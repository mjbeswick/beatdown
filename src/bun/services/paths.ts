/**
 * Manages user-configurable library and playlists directories.
 * Defaults to ~/Music/Reel/{Library,Playlists} but can be overridden
 * and persisted to ~/Music/Reel/paths.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DEFAULT_BASE = path.join(os.homedir(), 'Music', 'Reel');
const CONFIG_PATH = path.join(DEFAULT_BASE, 'paths.json');

export interface ReelPaths {
  libraryDir: string;
  playlistsDir: string;
}

function load(): ReelPaths {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ReelPaths>;
    return {
      libraryDir: parsed.libraryDir || path.join(DEFAULT_BASE, 'Library'),
      playlistsDir: parsed.playlistsDir || path.join(DEFAULT_BASE, 'Playlists'),
    };
  } catch {
    return {
      libraryDir: path.join(DEFAULT_BASE, 'Library'),
      playlistsDir: path.join(DEFAULT_BASE, 'Playlists'),
    };
  }
}

function save(p: ReelPaths) {
  fs.mkdirSync(DEFAULT_BASE, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(p, null, 2));
}

// Singleton mutable state
let current: ReelPaths = load();

export const paths = {
  get libraryDir() { return current.libraryDir; },
  get playlistsDir() { return current.playlistsDir; },

  getAll(): ReelPaths {
    return { ...current };
  },

  setLibraryDir(dir: string) {
    current.libraryDir = dir;
    save(current);
  },

  setPlaylistsDir(dir: string) {
    current.playlistsDir = dir;
    save(current);
  },
};
