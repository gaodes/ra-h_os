import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';

export interface GuideMeta {
  name: string;
  description: string;
  immutable: boolean;
}

export interface Guide extends GuideMeta {
  content: string;
}

const MAX_USER_GUIDES = 10;

const GUIDES_DIR = path.join(
  os.homedir(),
  'Library/Application Support/RA-H/guides'
);

const SYSTEM_GUIDES_DIR = path.join(
  process.cwd(),
  'src/config/guides/system'
);

const USER_GUIDES_DIR = path.join(
  process.cwd(),
  'src/config/guides'
);

// System guide names (immutable, always re-seeded)
const SYSTEM_GUIDE_NAMES = new Set([
  'schema',
  'creating-nodes',
  'edges',
  'dimensions',
  'extract',
]);

function ensureGuidesDir(): void {
  if (!fs.existsSync(GUIDES_DIR)) {
    fs.mkdirSync(GUIDES_DIR, { recursive: true });
  }
}

/**
 * Seed system guides — always overwritten on app start to stay current.
 * User guides are only seeded if they don't already exist.
 */
function seedGuides(): void {
  // Always re-seed system guides (immutable, kept up to date)
  if (fs.existsSync(SYSTEM_GUIDES_DIR)) {
    const systemFiles = fs.readdirSync(SYSTEM_GUIDES_DIR).filter(f => f.endsWith('.md'));
    for (const file of systemFiles) {
      const dest = path.join(GUIDES_DIR, file);
      fs.copyFileSync(path.join(SYSTEM_GUIDES_DIR, file), dest);
    }
  }

  // Seed default user guides only if they don't exist
  if (fs.existsSync(USER_GUIDES_DIR)) {
    const userFiles = fs.readdirSync(USER_GUIDES_DIR).filter(f => f.endsWith('.md'));
    for (const file of userFiles) {
      const dest = path.join(GUIDES_DIR, file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(USER_GUIDES_DIR, file), dest);
      }
    }
  }
}

let initialized = false;

function init(): void {
  if (initialized) return;
  ensureGuidesDir();
  seedGuides();
  initialized = true;
}

function isSystemGuide(filename: string): boolean {
  const name = filename.replace('.md', '');
  return SYSTEM_GUIDE_NAMES.has(name);
}

export function listGuides(): GuideMeta[] {
  init();
  const files = fs.readdirSync(GUIDES_DIR).filter(f => f.endsWith('.md'));

  const guides = files.map(file => {
    const raw = fs.readFileSync(path.join(GUIDES_DIR, file), 'utf-8');
    const { data } = matter(raw);
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

export function readGuide(name: string): Guide | null {
  init();
  const candidates = [
    `${name}.md`,
    `${name.toLowerCase()}.md`,
  ];

  for (const filename of candidates) {
    const filepath = path.join(GUIDES_DIR, filename);
    if (fs.existsSync(filepath)) {
      const raw = fs.readFileSync(filepath, 'utf-8');
      const { data, content } = matter(raw);
      const immutable = isSystemGuide(filename) || data.immutable === true;
      return {
        name: data.name || name,
        description: data.description || '',
        immutable,
        content: content.trim(),
      };
    }
  }

  return null;
}

export function writeGuide(name: string, content: string): { success: boolean; error?: string } {
  init();
  const filename = `${name.toLowerCase()}.md`;

  // Reject writes to immutable guides
  if (isSystemGuide(filename)) {
    return { success: false, error: `Guide "${name}" is a system guide and cannot be modified.` };
  }

  // Check user guide cap for new guides
  const filepath = path.join(GUIDES_DIR, filename);
  if (!fs.existsSync(filepath)) {
    const userGuideCount = getUserGuideCount();
    if (userGuideCount >= MAX_USER_GUIDES) {
      return { success: false, error: `Maximum of ${MAX_USER_GUIDES} custom guides reached. Delete a guide first.` };
    }
  }

  fs.writeFileSync(filepath, content, 'utf-8');
  return { success: true };
}

export function deleteGuide(name: string): { success: boolean; error?: string } {
  init();
  const candidates = [
    `${name}.md`,
    `${name.toLowerCase()}.md`,
  ];

  for (const filename of candidates) {
    // Reject deletes of immutable guides
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

export function getUserGuideCount(): number {
  init();
  const files = fs.readdirSync(GUIDES_DIR).filter(f => f.endsWith('.md'));
  return files.filter(f => !isSystemGuide(f)).length;
}

export function getGuideStats(): { userGuides: number; maxUserGuides: number; systemGuides: number } {
  const guides = listGuides();
  const systemCount = guides.filter(g => g.immutable).length;
  const userCount = guides.filter(g => !g.immutable).length;
  return {
    userGuides: userCount,
    maxUserGuides: MAX_USER_GUIDES,
    systemGuides: systemCount,
  };
}
