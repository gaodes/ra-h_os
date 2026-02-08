'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const MAX_USER_GUIDES = 10;

// Where guides live on disk (shared with the app)
const GUIDES_DIR = path.join(
  os.homedir(),
  'Library', 'Application Support', 'RA-H', 'guides'
);

// System guides bundled with this package
const BUNDLED_SYSTEM_DIR = path.join(__dirname, '..', 'guides', 'system');
const BUNDLED_USER_DIR = path.join(__dirname, '..', 'guides');

// System guide names (immutable, always re-seeded)
const SYSTEM_GUIDE_NAMES = new Set([
  'schema',
  'creating-nodes',
  'edges',
  'dimensions',
  'extract',
]);

/**
 * Parse YAML frontmatter from markdown without external deps.
 * Returns { data: {}, content: string }
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw.trim() };

  const yamlBlock = match[1];
  const content = match[2];
  const data = {};

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Handle booleans
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    data[key] = value;
  }

  return { data, content: content.trim() };
}

function isSystemGuide(filename) {
  const name = filename.replace('.md', '');
  return SYSTEM_GUIDE_NAMES.has(name);
}

function ensureGuidesDir() {
  if (!fs.existsSync(GUIDES_DIR)) {
    fs.mkdirSync(GUIDES_DIR, { recursive: true });
  }
}

/**
 * Seed guides on first run.
 * System guides always overwrite. User guides only seed if missing.
 */
function seedGuides() {
  ensureGuidesDir();

  // Always re-seed system guides (immutable)
  if (fs.existsSync(BUNDLED_SYSTEM_DIR)) {
    const files = fs.readdirSync(BUNDLED_SYSTEM_DIR).filter(f => f.endsWith('.md'));
    for (const file of files) {
      fs.copyFileSync(path.join(BUNDLED_SYSTEM_DIR, file), path.join(GUIDES_DIR, file));
    }
  }

  // Seed default user guides only if they don't exist
  if (fs.existsSync(BUNDLED_USER_DIR)) {
    const files = fs.readdirSync(BUNDLED_USER_DIR).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const dest = path.join(GUIDES_DIR, file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(BUNDLED_USER_DIR, file), dest);
      }
    }
  }
}

let initialized = false;

function init() {
  if (initialized) return;
  seedGuides();
  initialized = true;
}

/**
 * List all guides with name, description, immutable flag.
 */
function listGuides() {
  init();
  if (!fs.existsSync(GUIDES_DIR)) return [];

  const files = fs.readdirSync(GUIDES_DIR).filter(f => f.endsWith('.md'));

  const guides = files.map(file => {
    const raw = fs.readFileSync(path.join(GUIDES_DIR, file), 'utf-8');
    const { data } = parseFrontmatter(raw);
    const immutable = isSystemGuide(file) || data.immutable === true;
    return {
      name: data.name || file.replace('.md', ''),
      description: data.description || '',
      immutable,
    };
  });

  // System guides first, then user guides alphabetically
  return guides.sort((a, b) => {
    if (a.immutable && !b.immutable) return -1;
    if (!a.immutable && b.immutable) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Read a guide by name. Returns full content.
 */
function readGuide(name) {
  init();
  const candidates = [`${name}.md`, `${name.toLowerCase()}.md`];

  for (const filename of candidates) {
    const filepath = path.join(GUIDES_DIR, filename);
    if (fs.existsSync(filepath)) {
      const raw = fs.readFileSync(filepath, 'utf-8');
      const { data, content } = parseFrontmatter(raw);
      const immutable = isSystemGuide(filename) || data.immutable === true;
      return {
        name: data.name || name,
        description: data.description || '',
        immutable,
        content,
      };
    }
  }

  return null;
}

/**
 * Write or update a guide. Rejects writes to system guides.
 */
function writeGuide(name, content) {
  init();
  const filename = `${name.toLowerCase()}.md`;

  if (isSystemGuide(filename)) {
    return { success: false, error: `Guide "${name}" is a system guide and cannot be modified.` };
  }

  const filepath = path.join(GUIDES_DIR, filename);
  if (!fs.existsSync(filepath)) {
    const userCount = listGuides().filter(g => !g.immutable).length;
    if (userCount >= MAX_USER_GUIDES) {
      return { success: false, error: `Maximum of ${MAX_USER_GUIDES} custom guides reached. Delete a guide first.` };
    }
  }

  ensureGuidesDir();
  fs.writeFileSync(filepath, content, 'utf-8');
  return { success: true };
}

/**
 * Delete a guide. Rejects deletes of system guides.
 */
function deleteGuide(name) {
  init();
  const candidates = [`${name}.md`, `${name.toLowerCase()}.md`];

  for (const filename of candidates) {
    if (isSystemGuide(filename)) {
      return { success: false, error: `Guide "${name}" is a system guide and cannot be deleted.` };
    }
    const filepath = path.join(GUIDES_DIR, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return { success: true };
    }
  }

  return { success: false, error: `Guide "${name}" not found.` };
}

module.exports = {
  listGuides,
  readGuide,
  writeGuide,
  deleteGuide,
};
