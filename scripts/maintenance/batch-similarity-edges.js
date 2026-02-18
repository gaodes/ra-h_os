#!/usr/bin/env node
/**
 * batch-similarity-edges.js
 *
 * Backfills edges between existing nodes using stored sqlite-vec embeddings.
 * For each node that has an embedding in vec_chunks, finds the top-K most
 * similar OTHER nodes and creates edges between them via the ra-h API.
 *
 * Flags:
 *   --dry-run         Print what edges would be created, don't call API
 *   --limit=N         Max nodes to process (default: all)
 *   --similarity=0.X  Minimum similarity threshold (default: 0.6)
 *   --top-k=N         Max edges per node (default: 5)
 */

"use strict";

const { resolve } = require("path");
require("dotenv").config({ path: resolve(__dirname, "../../.env.local") });

const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const Database = require("better-sqlite3");

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const RAH_URL = (process.env.RAH_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const DB_PATH =
  process.env.SQLITE_DB_PATH ||
  path.join(os.homedir(), "Library/Application Support/RA-H/db/rah.sqlite");
const VEC_EXT =
  process.env.SQLITE_VEC_EXTENSION_PATH ||
  "./vendor/sqlite-extensions/vec0.dylib";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

const simArg = process.argv.find((a) => a.startsWith("--similarity="));
const SIMILARITY_THRESHOLD = simArg ? parseFloat(simArg.split("=")[1]) : 0.6;

const topKArg = process.argv.find((a) => a.startsWith("--top-k="));
const TOP_K = topKArg ? parseInt(topKArg.split("=")[1], 10) : 5;

// ── HTTP helper ───────────────────────────────────────────────────────────────

function post(url, body) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const data = JSON.stringify(body);
    const req = mod.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${buf}`));
            return;
          }
          try {
            resolve(JSON.parse(buf));
          } catch {
            resolve(buf);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[batch-similarity-edges] DB: ${DB_PATH}`);
  console.log(
    `[batch-similarity-edges] Similarity threshold: ${SIMILARITY_THRESHOLD}`,
  );
  console.log(`[batch-similarity-edges] Top-K per node: ${TOP_K}`);
  if (DRY_RUN)
    console.log(
      "[batch-similarity-edges] DRY RUN — no edges will be created\n",
    );

  const db = new Database(DB_PATH);

  // Load sqlite-vec extension (required for vector search)
  const vecExtPath = resolve(__dirname, "../..", VEC_EXT);
  try {
    db.loadExtension(vecExtPath);
    console.log("[batch-similarity-edges] sqlite-vec extension loaded");
  } catch (err) {
    console.error(
      `[batch-similarity-edges] Failed to load sqlite-vec from ${vecExtPath}: ${err.message}`,
    );
    console.error(
      "Set SQLITE_VEC_EXTENSION_PATH in .env.local to the correct path.",
    );
    process.exit(1);
  }

  // Get all nodes that have at least one chunk with an embedding
  const nodes = db
    .prepare(
      `
    SELECT DISTINCT n.id, n.title
    FROM nodes n
    INNER JOIN chunks c ON c.node_id = n.id
    INNER JOIN vec_chunks v ON v.chunk_id = c.id
    ORDER BY n.id ASC
  `,
    )
    .all();

  const toProcess = LIMIT < Infinity ? nodes.slice(0, LIMIT) : nodes;
  console.log(
    `[batch-similarity-edges] Nodes with embeddings: ${nodes.length}, processing: ${toProcess.length}\n`,
  );

  // Prepare queries — sqlite-vec requires LIMIT directly on the MATCH CTE.
  // Get the node's chunk_id first (regular table), then run a CTE-based KNN.
  const getChunkId = db.prepare(`
    SELECT id FROM chunks WHERE node_id = ? ORDER BY id ASC LIMIT 1
  `);

  // CTE isolates the vec_chunks MATCH+LIMIT scan; outer query joins chunks and filters.
  // Fetch TOP_K * 3 so filtering by threshold and excluding self still yields TOP_K results.
  const knnSearch = db.prepare(`
    WITH knn AS (
      SELECT chunk_id, distance
      FROM vec_chunks
      WHERE embedding MATCH (SELECT embedding FROM vec_chunks WHERE chunk_id = ?)
      ORDER BY distance
      LIMIT ?
    )
    SELECT c.node_id, (1.0 / (1.0 + knn.distance)) AS similarity
    FROM knn
    JOIN chunks c ON c.id = knn.chunk_id
    WHERE c.node_id != ?
      AND (1.0 / (1.0 + knn.distance)) >= ?
    ORDER BY similarity DESC
  `);

  const edgeExists = db.prepare(`
    SELECT 1 FROM edges WHERE (from_node_id = ? AND to_node_id = ?) OR (from_node_id = ? AND to_node_id = ?) LIMIT 1
  `);

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let noChunk = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const node = toProcess[i];
    if ((i + 1) % 100 === 0 || i === 0) {
      console.log(
        `[batch-similarity-edges] Progress: ${i + 1}/${toProcess.length} (created: ${created}, skipped: ${skipped}, failed: ${failed})`,
      );
    }

    const chunkRow = getChunkId.get(node.id);
    if (!chunkRow) {
      noChunk++;
      continue;
    }

    let similar;
    try {
      similar = knnSearch
        .all(chunkRow.id, TOP_K * 3, node.id, SIMILARITY_THRESHOLD)
        .slice(0, TOP_K);
    } catch (err) {
      noChunk++;
      continue;
    }

    for (const match of similar) {
      // Skip if edge already exists in either direction
      const exists = edgeExists.get(
        node.id,
        match.node_id,
        match.node_id,
        node.id,
      );
      if (exists) {
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(
          `  [dry-run] Edge: ${node.id} → ${match.node_id} (similarity: ${match.similarity.toFixed(3)})`,
        );
        created++;
        continue;
      }

      try {
        await post(`${RAH_URL}/api/edges`, {
          from_node_id: node.id,
          to_node_id: match.node_id,
          explanation: `Semantically similar content (score: ${match.similarity.toFixed(3)})`,
          source: "ai_similarity",
          created_via: "workflow",
          skip_inference: true,
        });
        created++;
      } catch (err) {
        console.error(
          `  [error] Edge ${node.id}→${match.node_id}: ${err.message}`,
        );
        failed++;
      }
    }
  }

  console.log(`\n[batch-similarity-edges] Done.`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped (already existed): ${skipped}`);
  console.log(`  Failed: ${failed}`);
  if (noChunk > 0) console.log(`  No embedding found: ${noChunk}`);

  db.close();
}

main().catch((err) => {
  console.error("[batch-similarity-edges] Fatal:", err.message);
  process.exit(1);
});
