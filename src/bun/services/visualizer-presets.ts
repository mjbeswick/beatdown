import * as fs from 'fs';
import * as path from 'path';
import type {
  VisualizerPresetCatalog,
  VisualizerPresetDescriptor,
} from '../../shared/rpc-schema';

const CUSTOM_PRESET_PREFIX = 'custom:';
const PRESET_EXTENSION = '.milk';

const { convertPreset } = require('milkdrop-preset-converter') as {
  convertPreset: (presetContents: string) => Promise<Record<string, unknown>>;
};

interface ResolvedVisualizerPresetDescriptor extends VisualizerPresetDescriptor {
  filePath: string;
}

let cachedRootDir = '';
let catalogLoaded = false;
let cachedDescriptors: ResolvedVisualizerPresetDescriptor[] = [];
let cachedById = new Map<string, ResolvedVisualizerPresetDescriptor>();
const convertedPresetCache = new Map<string, Record<string, unknown>>();
const failedPresetIds = new Set<string>();

function clearCache(): void {
  cachedRootDir = '';
  catalogLoaded = false;
  cachedDescriptors = [];
  cachedById = new Map();
  convertedPresetCache.clear();
  failedPresetIds.clear();
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function makePresetId(relativePath: string): string {
  return `${CUSTOM_PRESET_PREFIX}${normalizeRelativePath(relativePath)}`;
}

function makePresetLabel(relativePath: string): string {
  return normalizeRelativePath(relativePath).replace(/\.milk$/i, '');
}

function isMilkPresetFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(PRESET_EXTENSION);
}

function walkMilkPresetFiles(rootDir: string): string[] {
  const files: string[] = [];
  const pending = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }

      if (entry.isFile() && isMilkPresetFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  return files.sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' })
  );
}

function ensureCatalog(rootDir: string): ResolvedVisualizerPresetDescriptor[] {
  if (!rootDir || !fs.existsSync(rootDir)) {
    clearCache();
    return [];
  }

  if (catalogLoaded && cachedRootDir === rootDir) {
    return cachedDescriptors;
  }

  const descriptors = walkMilkPresetFiles(rootDir)
    .map((filePath) => {
      const relativePath = normalizeRelativePath(path.relative(rootDir, filePath));
      return {
        id: makePresetId(relativePath),
        label: makePresetLabel(relativePath),
        filePath,
      };
    })
    .sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
    );

  cachedRootDir = rootDir;
  catalogLoaded = true;
  cachedDescriptors = descriptors;
  cachedById = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
  convertedPresetCache.clear();
  failedPresetIds.clear();

  return cachedDescriptors;
}

export function isCustomVisualizerPresetId(id: string): boolean {
  return id.startsWith(CUSTOM_PRESET_PREFIX);
}

export function getCustomVisualizerPresetFallbackLabel(id: string): string {
  return id.replace(CUSTOM_PRESET_PREFIX, '').replace(/\.milk$/i, '');
}

export function invalidateCustomVisualizerPresetCache(): void {
  clearCache();
}

export function listCustomVisualizerPresets(rootDir: string): VisualizerPresetCatalog {
  const descriptors = ensureCatalog(rootDir);

  return {
    sourceDir: rootDir,
    presets: descriptors.map(({ id, label }) => ({ id, label })),
  };
}

export async function getCustomVisualizerPreset(
  rootDir: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const descriptors = ensureCatalog(rootDir);
  if (descriptors.length === 0) return null;
  if (failedPresetIds.has(id)) return null;

  const cachedPreset = convertedPresetCache.get(id);
  if (cachedPreset) return cachedPreset;

  const descriptor = cachedById.get(id);
  if (!descriptor) return null;

  try {
    const presetContents = fs.readFileSync(descriptor.filePath, 'utf8');
    const convertedPreset = await convertPreset(presetContents);
    if (!convertedPreset || typeof convertedPreset !== 'object') {
      failedPresetIds.add(id);
      return null;
    }

    const preset = convertedPreset as Record<string, unknown>;
    convertedPresetCache.set(id, preset);
    return preset;
  } catch {
    failedPresetIds.add(id);
    return null;
  }
}
