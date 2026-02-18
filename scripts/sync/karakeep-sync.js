#!/usr/bin/env node
/**
 * karakeep-sync.js
 *
 * Polls Kara Keep's REST API and creates new nodes in ra-h for each
 * bookmark not yet imported. Designed to run as a one-shot script on a
 * cron schedule (PM2 cron_restart + autorestart:false).
 *
 * Flags:
 *   --dry-run   Print mapped objects, do not create nodes
 *   --backfill  Ignore lastSyncTime, import all bookmarks
 *
 * Env vars (loaded from .env.local):
 *   KARAKEEP_URL      Base URL of your Kara Keep instance
 *   KARAKEEP_API_KEY  Bearer token for Kara Keep API
 *   RAH_URL           Base URL of your ra-h instance (default: http://localhost:3000)
 */

'use strict';

const { resolve } = require('path');
require('dotenv').config({ path: resolve(__dirname, '../../.env.local') });

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const https = require('https');
const http  = require('http');

// ── Config ───────────────────────────────────────────────────────────────────

const KARAKEEP_URL  = (process.env.KARAKEEP_URL  || '').replace(/\/$/, '');
const KARAKEEP_KEY  = process.env.KARAKEEP_API_KEY || '';
const RAH_URL       = (process.env.RAH_URL || 'http://localhost:3000').replace(/\/$/, '');
const STATE_DIR     = path.join(os.homedir(), '.local', 'share', 'ra-h');
const STATE_FILE    = path.join(STATE_DIR, 'karakeep-sync.json');
const PAGE_LIMIT    = 100;

const DRY_RUN  = process.argv.includes('--dry-run');
const BACKFILL = process.argv.includes('--backfill');

// ── Validation ───────────────────────────────────────────────────────────────

if (!KARAKEEP_URL) { console.error('Error: KARAKEEP_URL is not set'); process.exit(1); }
if (!KARAKEEP_KEY) { console.error('Error: KARAKEEP_API_KEY is not set'); process.exit(1); }

// ── Helpers ───────────────────────────────────────────────────────────────────

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod  = url.startsWith('https') ? https : http;
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    const req = mod.request(url, { method: options.method || 'GET', headers }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}: ${data}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── State ─────────────────────────────────────────────────────────────────────

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch { /* first run */ }
  return { lastSyncTime: null, lastRun: null };
}

function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, lastRun: new Date().toISOString() }, null, 2));
}

// ── Field mapping ─────────────────────────────────────────────────────────────

function mapBookmark(bm) {
  const content = bm.content || {};
  const isLink  = content.type === 'link';

  const title = bm.title || content.title || content.url || `Bookmark ${bm.id}`;

  const rawSummary = bm.summary || content.description || '';
  const description = rawSummary.slice(0, 280);

  const notes = bm.note || undefined;

  const link = isLink ? content.url : undefined;

  const rawText = isLink ? stripHtml(content.htmlContent) : undefined;
  const chunk = (rawText || bm.note) ? (rawText || bm.note).slice(0, 2000) : undefined;

  const dimensions = Array.isArray(bm.tags) ? bm.tags.map(t => t.name).filter(Boolean) : [];

  const metadata = {
    source:      'karakeep',
    karakeepId:  bm.id,
    createdAt:   bm.createdAt,
    contentType: content.type || 'unknown',
  };
  if (bm.source) metadata.karakeepSource = bm.source;

  const node = { title, metadata };
  if (description)           node.description = description;
  if (notes)                 node.notes        = notes;
  if (link)                  node.link         = link;
  if (chunk)                 node.chunk        = chunk;
  if (dimensions.length > 0) node.dimensions   = dimensions;

  return node;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[karakeep-sync] Starting${DRY_RUN ? ' (dry-run)' : ''}${BACKFILL ? ' (backfill)' : ''}`);

  const state       = loadState();
  const lastSync    = BACKFILL ? null : state.lastSyncTime;
  const cutoff      = lastSync ? new Date(lastSync) : null;

  if (cutoff) {
    console.log(`[karakeep-sync] Importing bookmarks newer than ${cutoff.toISOString()}`);
  } else {
    console.log('[karakeep-sync] No cutoff — importing all bookmarks');
  }

  const toImport = [];
  let cursor     = undefined;
  let done       = false;
  let pageCount  = 0;

  while (!done) {
    const params = new URLSearchParams({ sortOrder: 'desc', limit: String(PAGE_LIMIT) });
    if (cursor) params.set('cursor', cursor);

    const url  = `${KARAKEEP_URL}/api/v1/bookmarks?${params}`;
    const data = await request(url, {
      headers: { Authorization: `Bearer ${KARAKEEP_KEY}` },
    });

    pageCount++;
    const bookmarks = data.bookmarks || [];

    for (const bm of bookmarks) {
      const createdAt = new Date(bm.createdAt);
      if (cutoff && createdAt <= cutoff) {
        done = true;  // hit items we've already seen — stop
        break;
      }
      toImport.push(bm);
    }

    if (!done) {
      cursor = data.nextCursor;
      if (!cursor || bookmarks.length < PAGE_LIMIT) done = true;
    }
  }

  console.log(`[karakeep-sync] Fetched ${pageCount} page(s), found ${toImport.length} new bookmark(s)`);

  if (toImport.length === 0) {
    saveState({ lastSyncTime: state.lastSyncTime });
    console.log('[karakeep-sync] Nothing to import. Done.');
    return;
  }

  let created = 0;
  let failed  = 0;

  for (const bm of toImport) {
    const node = mapBookmark(bm);

    if (DRY_RUN) {
      console.log('[dry-run]', JSON.stringify(node, null, 2));
      created++;
      continue;
    }

    try {
      await request(`${RAH_URL}/api/nodes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    node,
      });
      created++;
    } catch (err) {
      console.error(`[karakeep-sync] Failed to create node for ${bm.id}: ${err.message}`);
      failed++;
    }
  }

  // Record the newest bookmark's timestamp as the new watermark
  const newestCreatedAt = toImport[0]?.createdAt || state.lastSyncTime;
  if (!DRY_RUN) {
    saveState({ lastSyncTime: newestCreatedAt });
  }

  console.log(`[karakeep-sync] Done. Created: ${created}, Failed: ${failed}`);
}

main().catch(err => {
  console.error('[karakeep-sync] Fatal:', err.message);
  process.exit(1);
});
