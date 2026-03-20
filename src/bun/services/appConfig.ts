/**
 * Manages app configuration files stored in the OS-appropriate config directory.
 *   macOS:   ~/Library/Application Support/Beatdown/
 *   Linux:   ~/.config/Beatdown/
 *   Windows: %APPDATA%\Beatdown\
 */

import * as fs from 'fs';
import * as path from 'path';
import envPaths from 'env-paths';

const CONFIG_DIR = envPaths('Beatdown', { suffix: '' }).config;

const FILES: Record<string, string> = {
  appSettings: 'app-settings.json',
  theme: 'theme.json',
  visualizer: 'visualizer.json',
  favourites: 'favourites.json',
  playerPrefs: 'player-prefs.json',
  playerSession: 'player-session.json',
};

function readJson(name: string): unknown {
  try {
    const raw = fs.readFileSync(path.join(CONFIG_DIR, name), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(name: string, value: unknown): void {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(path.join(CONFIG_DIR, name), JSON.stringify(value, null, 2));
  } catch {}
}

export const appConfig = {
  getDir(): string {
    return CONFIG_DIR;
  },

  load() {
    return {
      appSettings: readJson(FILES.appSettings) as Record<string, unknown> | null,
      theme: readJson(FILES.theme) as string | null,
      visualizer: readJson(FILES.visualizer) as Record<string, unknown> | null,
      favourites: readJson(FILES.favourites) as unknown[] | null,
      playerPrefs: readJson(FILES.playerPrefs) as Record<string, unknown> | null,
      playerSession: readJson(FILES.playerSession) as Record<string, unknown> | null,
    };
  },

  save(key: string, value: unknown): void {
    const fileName = FILES[key];
    if (!fileName) return;
    writeJson(fileName, value);
  },
};
