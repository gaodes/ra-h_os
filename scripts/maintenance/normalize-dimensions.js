#!/usr/bin/env node
/**
 * normalize-dimensions.js
 *
 * Normalizes all dimension names in the ra-h database:
 *   1. Lowercase + replace spaces/hyphens with underscores
 *   2. Merge duplicate dimension names (keep most-used variant)
 *   3. Prune dimensions with fewer than MIN_COUNT nodes (default: 3)
 *
 * Flags:
 *   --dry-run       Print report without writing anything
 *   --min-count=N   Prune threshold (default: 3)
 */

'use strict';

const { resolve } = require('path');
require('dotenv').config({ path: resolve(__dirname, '../../.env.local') });

const path    = require('path');
const os      = require('os');
const Database = require('better-sqlite3');

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

const minCountArg = process.argv.find(a => a.startsWith('--min-count='));
const MIN_COUNT = minCountArg ? parseInt(minCountArg.split('=')[1], 10) : 3;

const DB_PATH = process.env.SQLITE_DB_PATH ||
  path.join(os.homedir(), 'Library/Application Support/RA-H/db/rah.sqlite');

// ── Normalize ─────────────────────────────────────────────────────────────────

function normalize(name) {
  return name.toLowerCase().replace(/[\s\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log(`[normalize-dimensions] DB: ${DB_PATH}`);
  console.log(`[normalize-dimensions] Min node count: ${MIN_COUNT}`);
  if (DRY_RUN) console.log('[normalize-dimensions] DRY RUN — no changes will be written\n');

  const db = new Database(DB_PATH);

  // 1. Load all dimensions with their node counts
  const dims = db.prepare(`
    SELECT d.name, COALESCE(c.count, 0) AS count
    FROM dimensions d
    LEFT JOIN (
      SELECT dimension, COUNT(*) AS count
      FROM node_dimensions
      GROUP BY dimension
    ) c ON c.dimension = d.name
  `).all();

  console.log(`[normalize-dimensions] Total dimensions: ${dims.length}`);

  // 2. Build groups: normalized_key → [{ name, count }, ...]
  const groups = new Map();
  for (const dim of dims) {
    const key = normalize(dim.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(dim);
  }

  // ── Report: merges ────────────────────────────────────────────────────────

  let mergeCount = 0;
  let mergeNodeRows = 0;
  const mergeOps = [];

  for (const [key, variants] of groups) {
    if (variants.length === 1) continue;

    // Keep the variant with the highest node count; break ties by longest original name
    variants.sort((a, b) => b.count - a.count || b.name.length - a.name.length);
    const canonical = variants[0];
    const duplicates = variants.slice(1);
    const dupeNames = duplicates.map(d => `"${d.name}" (${d.count})`).join(', ');

    mergeCount++;
    const totalNodes = duplicates.reduce((s, d) => s + d.count, 0);
    mergeNodeRows += totalNodes;
    mergeOps.push({ canonical, duplicates, key });
    console.log(`  MERGE → "${canonical.name}" (${canonical.count}) ← ${dupeNames}`);
  }

  // ── Report: prune ─────────────────────────────────────────────────────────

  // After merge simulation: count final nodes per normalized key
  const finalCounts = new Map();
  for (const [key, variants] of groups) {
    const total = variants.reduce((s, d) => s + d.count, 0);
    const canonical = [...variants].sort((a, b) => b.count - a.count || b.name.length - a.name.length)[0];
    finalCounts.set(key, { name: canonical.name, total });
  }

  const toPrune = [];
  for (const [key, { name, total }] of finalCounts) {
    if (total < MIN_COUNT) {
      toPrune.push({ name, total, key });
    }
  }

  // Don't prune canonical names that are the result of a merge with total ≥ MIN_COUNT
  const effectivePrune = toPrune.filter(p => finalCounts.get(p.key)?.total < MIN_COUNT);

  console.log(`\n[normalize-dimensions] Summary:`);
  console.log(`  Dimensions to merge: ${mergeCount} groups (${mergeNodeRows} node-dimension rows remapped)`);
  console.log(`  Dimensions to prune (<${MIN_COUNT} nodes): ${effectivePrune.length}`);
  if (effectivePrune.length > 0) {
    effectivePrune.slice(0, 20).forEach(p => console.log(`    PRUNE "${p.name}" (${p.total} nodes)`));
    if (effectivePrune.length > 20) console.log(`    ... and ${effectivePrune.length - 20} more`);
  }

  if (DRY_RUN) {
    console.log('\n[normalize-dimensions] Dry run complete. Run without --dry-run to apply.');
    db.close();
    return;
  }

  // ── Apply changes ─────────────────────────────────────────────────────────

  const applyMerge = db.transaction((op) => {
    const { canonical, duplicates } = op;
    for (const dup of duplicates) {
      // Remap node_dimensions rows to canonical (ignore conflicts — node may already have canonical)
      db.prepare(`
        UPDATE OR IGNORE node_dimensions SET dimension = ? WHERE dimension = ?
      `).run(canonical.name, dup.name);
      // Delete any remaining rows pointing at the dupe (were conflicts)
      db.prepare(`DELETE FROM node_dimensions WHERE dimension = ?`).run(dup.name);
      // Delete the dimension record
      db.prepare(`DELETE FROM dimensions WHERE name = ?`).run(dup.name);
    }
  });

  const applyPrune = db.transaction((name) => {
    db.prepare(`DELETE FROM node_dimensions WHERE dimension = ?`).run(name);
    db.prepare(`DELETE FROM dimensions WHERE name = ?`).run(name);
  });

  let merged = 0;
  for (const op of mergeOps) {
    applyMerge(op);
    merged += op.duplicates.length;
  }

  let pruned = 0;
  // Re-count after merges
  for (const { name } of effectivePrune) {
    const currentCount = db.prepare(
      'SELECT COUNT(*) AS c FROM node_dimensions WHERE dimension = ?'
    ).get(name)?.c || 0;
    if (currentCount < MIN_COUNT) {
      applyPrune(name);
      pruned++;
    }
  }

  const remaining = db.prepare('SELECT COUNT(*) AS c FROM dimensions').get().c;

  console.log(`\n[normalize-dimensions] Done.`);
  console.log(`  Merged: ${merged} duplicate dimension(s)`);
  console.log(`  Pruned: ${pruned} low-signal dimension(s)`);
  console.log(`  Remaining dimensions: ${remaining}`);
  console.log('\nNext step: Review top dimensions and promote high-signal ones to is_priority=1:');
  console.log('  SELECT d.name, COUNT(*) as c FROM node_dimensions nd');
  console.log('  JOIN dimensions d ON d.name = nd.dimension');
  console.log('  GROUP BY nd.dimension ORDER BY c DESC LIMIT 30;');

  db.close();
}

main();
