/**
 * Manages user-configurable library and playlists directories.
 * Defaults to ~/Music/Beatdown/{Library,Playlists} but can be overridden.
 * Config (paths.json) is persisted to the OS config dir alongside other app settings.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import envPaths from 'env-paths';

const LIBRARY_BASE = path.join(os.homedir(), 'Music', 'Beatdown');
const CONFIG_DIR = envPaths('Beatdown', { suffix: '' }).config;
const CONFIG_PATH = path.join(CONFIG_DIR, 'paths.json');

export interface BeatdownPaths {
  libraryDir: string;
  playlistsDir: string;
  visualizerPresetsDir: string;
}

function load(): BeatdownPaths {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<BeatdownPaths>;
    return {
      libraryDir: parsed.libraryDir || path.join(LIBRARY_BASE, 'Library'),
      playlistsDir: parsed.playlistsDir || path.join(LIBRARY_BASE, 'Playlists'),
      visualizerPresetsDir:
        typeof parsed.visualizerPresetsDir === 'string'
          ? parsed.visualizerPresetsDir
          : path.join(LIBRARY_BASE, 'Visualizer Presets'),
    };
  } catch {
    return {
      libraryDir: path.join(LIBRARY_BASE, 'Library'),
      playlistsDir: path.join(LIBRARY_BASE, 'Playlists'),
      visualizerPresetsDir: path.join(LIBRARY_BASE, 'Visualizer Presets'),
    };
  }
}

function save(p: BeatdownPaths) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(p, null, 2));
}

// Singleton mutable state
let current: BeatdownPaths = load();

export const paths = {
  get libraryDir() { return current.libraryDir; },
  get playlistsDir() { return current.playlistsDir; },
  get visualizerPresetsDir() { return current.visualizerPresetsDir; },

  getAll(): BeatdownPaths {
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

  setVisualizerPresetsDir(dir: string) {
    current.visualizerPresetsDir = dir;
    save(current);
  },

  clearVisualizerPresetsDir() {
    current.visualizerPresetsDir = '';
    save(current);
  },
};
