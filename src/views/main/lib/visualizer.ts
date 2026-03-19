let butterchurnLib: any = null;
let butterchurnPresetPack: any = null;
let presetCache: Record<string, unknown> | null = null;

import type {
  VisualizerCycleOrder,
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
    pixelRatio: 1.25,
    textureRatio: 1,
  },
  detail: {
    meshWidth: 64,
    meshHeight: 48,
    pixelRatio: 2,
    textureRatio: 1,
  },
};

const MESH_SCALE: Record<VisualizerMeshDensity, number> = {
  sparse: 0.75,
  standard: 1,
  dense: 1.25,
  extreme: 1.5,
};

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
    meshWidth: clamp(Math.round(profile.meshWidth * meshScale), 24, 128),
    meshHeight: clamp(Math.round(profile.meshHeight * meshScale), 18, 96),
    pixelRatio: Math.min(devicePixelRatio, profile.pixelRatio),
    textureRatio: profile.textureRatio,
    outputFXAA: settings.fxaa,
  };
}

export function getButterchurnLibrary(): any {
  return butterchurnLib;
}

export function loadVisualizerPresets(): Record<string, unknown> {
  if (presetCache) return presetCache;

  if (!butterchurnPresetPack) {
    presetCache = {};
    return presetCache;
  }

  try {
    if (typeof butterchurnPresetPack.getPresets === 'function') {
      presetCache = butterchurnPresetPack.getPresets();
    } else if (typeof butterchurnPresetPack === 'object') {
      presetCache = butterchurnPresetPack as Record<string, unknown>;
    } else {
      presetCache = {};
    }
  } catch {
    presetCache = {};
  }

  return presetCache;
}

export function getVisualizerPresetNames(): string[] {
  return Object.keys(loadVisualizerPresets());
}

export function getVisualizerPresetPreference(
  settings: Pick<VisualizerSettings, 'presetPreferences'>,
  presetName: string
): VisualizerPresetPreference {
  return settings.presetPreferences[presetName] ?? 'default';
}

export function getVisibleVisualizerPresetNames(
  presetNames: string[],
  settings: Pick<VisualizerSettings, 'presetPreferences'>
): string[] {
  return presetNames.filter((presetName) => getVisualizerPresetPreference(settings, presetName) !== 'hidden');
}

export function getAdjacentVisualizerPresetName(
  presetNames: string[],
  currentPresetName: string,
  direction: 1 | -1,
  settings: Pick<VisualizerSettings, 'presetPreferences'>
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
  settings: Pick<VisualizerSettings, 'presetPreferences' | 'cycleOrder'>
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
