import fs from 'fs';
import os from 'os';
import path from 'path';
import { getSQLiteClient } from '@/services/database/sqlite-client';

export interface AutoContextSettings {
  autoContextEnabled: boolean;
  lastPinnedMigration?: string;
}

const SETTINGS_FILE = 'settings.json';
const DEFAULT_SETTINGS: AutoContextSettings = {
  autoContextEnabled: false,
};

let bootstrapAttempted = false;

function resolveBaseConfigDir(): string {
  const override = process.env.RAH_CONFIG_DIR;
  if (override && override.trim().length > 0) {
    return override;
  }

  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'RA-H');
  }

  if (process.platform === 'win32') {
    const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(roaming, 'RA-H');
  }

  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(xdgConfig, 'ra-h');
}

function getSettingsDir(): string {
  return path.join(resolveBaseConfigDir(), 'config');
}

function getSettingsPath(): string {
  return path.join(getSettingsDir(), SETTINGS_FILE);
}

function ensureSettingsDirExists(): void {
  const dir = getSettingsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeSettingsFile(settings: AutoContextSettings): AutoContextSettings {
  ensureSettingsDirExists();
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
  return settings;
}

function bootstrapFromLegacyPins(): void {
  if (bootstrapAttempted) return;
  bootstrapAttempted = true;

  const settingsPath = getSettingsPath();
  if (fs.existsSync(settingsPath)) {
    return;
  }

  try {
    const db = getSQLiteClient();
    const countRow = db
      .query<{ count: number }>('SELECT COUNT(*) as count FROM nodes WHERE is_pinned = 1')
      .rows[0];
    const pinnedCount = Number(countRow?.count ?? 0);
    if (pinnedCount > 0) {
      writeSettingsFile({
        autoContextEnabled: true,
        lastPinnedMigration: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.warn('Auto-context pin bootstrap failed:', error);
  }
}

export function getAutoContextSettings(): AutoContextSettings {
  bootstrapFromLegacyPins();
  const settingsPath = getSettingsPath();

  try {
    if (!fs.existsSync(settingsPath)) {
      return { ...DEFAULT_SETTINGS };
    }

    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      autoContextEnabled: Boolean(parsed?.autoContextEnabled),
    };
  } catch (error) {
    console.warn('Failed to read auto-context settings, using defaults:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateAutoContextSettings(
  partial: Partial<AutoContextSettings>
): AutoContextSettings {
  const current = getAutoContextSettings();
  const next: AutoContextSettings = {
    ...current,
    ...partial,
    autoContextEnabled:
      typeof partial.autoContextEnabled === 'boolean'
        ? partial.autoContextEnabled
        : current.autoContextEnabled,
  };
  return writeSettingsFile(next);
}

export function setAutoContextEnabled(enabled: boolean): AutoContextSettings {
  return updateAutoContextSettings({ autoContextEnabled: enabled });
}
