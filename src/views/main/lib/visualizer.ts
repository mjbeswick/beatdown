let butterchurnLib: any = null;
let butterchurnPresetPack: any = null;
let stockPresetCache: Record<string, unknown> | null = null;

import type {
  VisualizerPresetCatalog as RemoteVisualizerPresetCatalog,
  VisualizerPresetDescriptor as RemoteVisualizerPresetDescriptor,
} from '../../../shared/rpc-schema';
import { rpc } from '../rpc';
import type {
  VisualizerMeshDensity,
  VisualizerPresetPreference,
  VisualizerQualityPreset,
  VisualizerSettings,
} from '../stores/visualizer';

try {
  butterchurnLib = require('butterchurn').default ?? require('butterchurn');
  butterchurnPresetPack = require('butterchurn-presets').default ?? require('butterchurn-presets');
} catch {
  // The app can still render without the visualizer dependencies.
}

export interface VisualizerRenderOptions {
  width: number;
  height: number;
  meshWidth: number;
  meshHeight: number;
  pixelRatio: number;
  textureRatio: number;
  outputFXAA: boolean;
}

export interface VisualizerPresetDescriptor {
  id: string;
  label: string;
  source: 'stock' | 'custom';
}

const QUALITY_CONFIG: Record<
  VisualizerQualityPreset,
  { meshWidth: number; meshHeight: number; pixelRatio: number; textureRatio: number }
> = {
  performance: {
    meshWidth: 36,
    meshHeight: 27,
    pixelRatio: 1,
    textureRatio: 0.85,
  },
  balanced: {
    meshWidth: 48,
    meshHeight: 36,
    pixelRatio: 2,
    textureRatio: 1,
  },
  detail: {
    meshWidth: 64,
    meshHeight: 48,
    pixelRatio: 2,
    textureRatio: 1,
  },
  ultra: {
    meshWidth: 96,
    meshHeight: 72,
    pixelRatio: 2,
    textureRatio: 1.5,
  },
};

const MESH_SCALE: Record<VisualizerMeshDensity, number> = {
  sparse: 0.75,
  standard: 1,
  dense: 1.25,
  extreme: 1.5,
};

let stockPresetDescriptorsCache: VisualizerPresetDescriptor[] | null = null;
let customPresetCatalogCache: RemoteVisualizerPresetCatalog | null = null;
let customPresetCatalogPromise: Promise<RemoteVisualizerPresetCatalog> | null = null;
const customPresetCache = new Map<string, Record<string, unknown>>();
const customPresetLabels = new Map<string, string>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getVisualizerRenderOptions(
  settings: Pick<VisualizerSettings, 'quality' | 'fxaa' | 'meshDensity'>,
  width: number,
  height: number
): VisualizerRenderOptions {
  const profile = QUALITY_CONFIG[settings.quality];
  const meshScale = MESH_SCALE[settings.meshDensity];
  const devicePixelRatio =
    typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);

  return {
    width,
    height,
    meshWidth: clamp(Math.round(profile.meshWidth * meshScale), 24, 192),
    meshHeight: clamp(Math.round(profile.meshHeight * meshScale), 18, 144),
    pixelRatio: Math.min(devicePixelRatio, profile.pixelRatio),
    textureRatio: profile.textureRatio,
    outputFXAA: settings.fxaa,
  };
}

export function getButterchurnLibrary(): any {
  return butterchurnLib;
}

function loadStockVisualizerPresets(): Record<string, unknown> {
  if (stockPresetCache) return stockPresetCache;

  if (!butterchurnPresetPack) {
    stockPresetCache = {};
    return stockPresetCache;
  }

  try {
    if (typeof butterchurnPresetPack.getPresets === 'function') {
      stockPresetCache = butterchurnPresetPack.getPresets();
    } else if (typeof butterchurnPresetPack === 'object') {
      stockPresetCache = butterchurnPresetPack as Record<string, unknown>;
    } else {
      stockPresetCache = {};
    }
  } catch {
    stockPresetCache = {};
  }

  return stockPresetCache;
}

function getStockVisualizerPresetDescriptors(): VisualizerPresetDescriptor[] {
  if (stockPresetDescriptorsCache) return stockPresetDescriptorsCache;

  stockPresetDescriptorsCache = Object.keys(loadStockVisualizerPresets()).map((presetName) => ({
    id: presetName,
    label: presetName,
    source: 'stock',
  }));

  return stockPresetDescriptorsCache;
}

export function invalidateVisualizerPresetCatalog(): void {
  customPresetCatalogCache = null;
  customPresetCatalogPromise = null;
  customPresetCache.clear();
  customPresetLabels.clear();
}

async function loadCustomVisualizerPresetCatalog(
  forceRefresh = false
): Promise<RemoteVisualizerPresetCatalog> {
  if (forceRefresh) invalidateVisualizerPresetCatalog();
  if (customPresetCatalogCache) return customPresetCatalogCache;
  if (customPresetCatalogPromise) return customPresetCatalogPromise;

  customPresetCatalogPromise = rpc.proxy.request['visualizer-presets:list'](undefined as never)
    .then((catalog) => {
      customPresetCatalogCache = catalog;
      for (const preset of catalog.presets) {
        customPresetLabels.set(preset.id, preset.label);
      }
      return catalog;
    })
    .catch((error) => {
      console.error('Failed to load visualizer preset catalog', error);
      return {
        sourceDir: '',
        presets: [],
      };
    })
    .finally(() => {
      customPresetCatalogPromise = null;
    });

  return customPresetCatalogPromise;
}

export async function loadVisualizerPresetCatalog(
  forceRefreshCustom = false
): Promise<VisualizerPresetDescriptor[]> {
  const stockPresets = getStockVisualizerPresetDescriptors();
  const customCatalog = await loadCustomVisualizerPresetCatalog(forceRefreshCustom);
  const customPresets = customCatalog.presets.map(
    (preset: RemoteVisualizerPresetDescriptor): VisualizerPresetDescriptor => ({
      id: preset.id,
      label: preset.label,
      source: 'custom',
    })
  );

  return [...stockPresets, ...customPresets];
}

export async function loadVisualizerPresetById(
  presetId: string
): Promise<Record<string, unknown> | null> {
  const stockPreset = loadStockVisualizerPresets()[presetId];
  if (stockPreset && typeof stockPreset === 'object') {
    return stockPreset as Record<string, unknown>;
  }

  const cachedCustomPreset = customPresetCache.get(presetId);
  if (cachedCustomPreset) return cachedCustomPreset;

  try {
    const preset = await rpc.proxy.request['visualizer-presets:get']({ id: presetId });
    if (!preset || typeof preset !== 'object') return null;

    const normalizedPreset = preset as Record<string, unknown>;
    customPresetCache.set(presetId, normalizedPreset);
    return normalizedPreset;
  } catch (error) {
    console.error(`Failed to load visualizer preset ${presetId}`, error);
    return null;
  }
}

export function getVisualizerPresetLabel(presetId: string): string {
  return customPresetLabels.get(presetId) ?? presetId;
}

export function getVisualizerPresetPreference(
  settings: Pick<VisualizerSettings, 'presetPreferences'>,
  presetName: string
): VisualizerPresetPreference {
  return settings.presetPreferences[presetName] ?? 'default';
}

export function getVisibleVisualizerPresetNames(
  presetNames: string[],
  settings: Pick<VisualizerSettings, 'presetPreferences' | 'onlyFavourites'>
): string[] {
  return presetNames.filter((presetName) => {
    const pref = getVisualizerPresetPreference(settings, presetName);
    if (pref === 'hidden') return false;
    if (settings.onlyFavourites && pref !== 'favorite') return false;
    return true;
  });
}

export function getAdjacentVisualizerPresetName(
  presetNames: string[],
  currentPresetName: string,
  direction: 1 | -1,
  settings: Pick<VisualizerSettings, 'presetPreferences' | 'onlyFavourites'>
): string | null {
  const visiblePresetNames = getVisibleVisualizerPresetNames(presetNames, settings);
  if (visiblePresetNames.length === 0) return null;

  const currentIndex = visiblePresetNames.indexOf(currentPresetName);
  if (currentIndex === -1) {
    return direction === 1
      ? visiblePresetNames[0]
      : visiblePresetNames[visiblePresetNames.length - 1];
  }

  const nextIndex =
    (currentIndex + direction + visiblePresetNames.length) % visiblePresetNames.length;
  return visiblePresetNames[nextIndex] ?? null;
}

export function getNextAutoCyclePresetName(
  presetNames: string[],
  currentPresetName: string,
  settings: Pick<VisualizerSettings, 'presetPreferences' | 'cycleOrder' | 'onlyFavourites'>
): string | null {
  const visiblePresetNames = getVisibleVisualizerPresetNames(presetNames, settings);
  if (visiblePresetNames.length === 0) return null;
  if (visiblePresetNames.length === 1) return visiblePresetNames[0];

  if (settings.cycleOrder === 'sequential') {
    return getAdjacentVisualizerPresetName(presetNames, currentPresetName, 1, settings);
  }

  const candidates = visiblePresetNames.filter((presetName) => presetName !== currentPresetName);
  if (candidates.length === 0) return currentPresetName;

  const weightedPool = candidates.flatMap((presetName) =>
    getVisualizerPresetPreference(settings, presetName) === 'favorite'
      ? [presetName, presetName, presetName]
      : [presetName]
  );
  return weightedPool[Math.floor(Math.random() * weightedPool.length)] ?? candidates[0];
}
