#!/usr/bin/env node
/**
 * backfill-chunks.js
 *
 * For nodes that have no chunk but have a description (typically Kara Keep
 * imports where htmlContent was unavailable), synthesises a chunk from
 * title + description and calls PUT /api/nodes/:id so the running server
 * enqueues embedding generation.
 *
 * Flags:
 *   --dry-run   Print what would be updated, don't call API
 *   --limit=N   Max nodes to process (default: all)
 */

"use strict";

const { resolve } = require("path");
require("dotenv").config({ path: resolve(__dirname, "../../.env.local") });

const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const Database = require("better-sqlite3");

const DRY_RUN = process.argv.includes("--dry-run");
const RAH_URL = (process.env.RAH_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const DB_PATH =
  process.env.SQLITE_DB_PATH ||
  path.join(os.homedir(), "Library/Application Support/RA-H/db/rah.sqlite");

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

function put(url, body) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const data = JSON.stringify(body);
    const req = mod.request(
      url,
      {
        method: "PUT",
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

async function main() {
  console.log(`[backfill-chunks] DB: ${DB_PATH}`);
  if (DRY_RUN)
    console.log("[backfill-chunks] DRY RUN — no changes will be made\n");

  const db = new Database(DB_PATH, { readonly: true });

  const nodes = db
    .prepare(
      `
    SELECT id, title, description
    FROM nodes
    WHERE (chunk IS NULL OR length(chunk) = 0
      OR id NOT IN (SELECT DISTINCT node_id FROM chunks))
      AND description IS NOT NULL
      AND length(description) > 0
    ORDER BY id ASC
  `,
    )
    .all();

  db.close();

  const toProcess = LIMIT < Infinity ? nodes.slice(0, LIMIT) : nodes;
  console.log(
    `[backfill-chunks] Nodes needing chunk: ${nodes.length}, processing: ${toProcess.length}\n`,
  );

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const node = toProcess[i];
    const chunk = `${node.title}: ${node.description}`.slice(0, 2000);

    if ((i + 1) % 100 === 0 || i === 0) {
      console.log(
        `[backfill-chunks] Progress: ${i + 1}/${toProcess.length} (updated: ${updated}, failed: ${failed})`,
      );
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] node ${node.id}: "${chunk.slice(0, 80)}..."`);
      updated++;
      continue;
    }

    try {
      await put(`${RAH_URL}/api/nodes/${node.id}`, { chunk });
      updated++;
    } catch (err) {
      console.error(`  [error] node ${node.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n[backfill-chunks] Done.`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Failed:  ${failed}`);
  console.log("\nThe server will now embed these nodes in the background.");
  console.log("Run batch-similarity-edges.js once embeddings are complete.");
}

main().catch((err) => {
  console.error("[backfill-chunks] Fatal:", err.message);
  process.exit(1);
});
