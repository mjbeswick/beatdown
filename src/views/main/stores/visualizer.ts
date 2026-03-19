import { createEvent, createStore } from 'effector';

export type VisualizerQualityPreset = 'performance' | 'balanced' | 'detail';
export type VisualizerMeshDensity = 'sparse' | 'standard' | 'dense' | 'extreme';

export interface VisualizerSettings {
  presetName: string;
  autoCycle: boolean;
  cycleSeconds: number;
  blendSeconds: number;
  quality: VisualizerQualityPreset;
  fxaa: boolean;
  meshDensity: VisualizerMeshDensity;
}

const STORAGE_KEY = 'reel:visualizer';
const QUALITY_PRESETS: VisualizerQualityPreset[] = ['performance', 'balanced', 'detail'];
const MESH_DENSITIES: VisualizerMeshDensity[] = ['sparse', 'standard', 'dense', 'extreme'];

const DEFAULT_SETTINGS: VisualizerSettings = {
  presetName: '',
  autoCycle: true,
  cycleSeconds: 30,
  blendSeconds: 2,
  quality: 'balanced',
  fxaa: false,
  meshDensity: 'standard',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeSettings(input: Partial<VisualizerSettings> | null | undefined): VisualizerSettings {
  return {
    presetName: typeof input?.presetName === 'string' ? input.presetName : DEFAULT_SETTINGS.presetName,
    autoCycle: typeof input?.autoCycle === 'boolean' ? input.autoCycle : DEFAULT_SETTINGS.autoCycle,
    cycleSeconds: clamp(
      typeof input?.cycleSeconds === 'number' ? input.cycleSeconds : DEFAULT_SETTINGS.cycleSeconds,
      5,
      120
    ),
    blendSeconds: clamp(
      typeof input?.blendSeconds === 'number' ? input.blendSeconds : DEFAULT_SETTINGS.blendSeconds,
      0,
      10
    ),
    quality:
      typeof input?.quality === 'string' && QUALITY_PRESETS.includes(input.quality as VisualizerQualityPreset)
        ? (input.quality as VisualizerQualityPreset)
        : DEFAULT_SETTINGS.quality,
    fxaa: typeof input?.fxaa === 'boolean' ? input.fxaa : DEFAULT_SETTINGS.fxaa,
    meshDensity:
      typeof input?.meshDensity === 'string' && MESH_DENSITIES.includes(input.meshDensity as VisualizerMeshDensity)
        ? (input.meshDensity as VisualizerMeshDensity)
        : DEFAULT_SETTINGS.meshDensity,
  };
}

function loadSettings(): VisualizerSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    return sanitizeSettings(JSON.parse(stored) as Partial<VisualizerSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: VisualizerSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

function applyPatch(
  state: VisualizerSettings,
  patch: Partial<VisualizerSettings>
): VisualizerSettings {
  const next = sanitizeSettings({ ...state, ...patch });
  saveSettings(next);
  return next;
}

export const patchVisualizerSettings = createEvent<Partial<VisualizerSettings>>();
export const setVisualizerPresetName = createEvent<string>();
export const setVisualizerAutoCycle = createEvent<boolean>();
export const setVisualizerCycleSeconds = createEvent<number>();
export const setVisualizerBlendSeconds = createEvent<number>();
export const setVisualizerQuality = createEvent<VisualizerQualityPreset>();
export const setVisualizerFXAA = createEvent<boolean>();
export const setVisualizerMeshDensity = createEvent<VisualizerMeshDensity>();

export const $visualizerSettings = createStore<VisualizerSettings>(loadSettings())
  .on(patchVisualizerSettings, (state, patch) => applyPatch(state, patch))
  .on(setVisualizerPresetName, (state, presetName) => applyPatch(state, { presetName }))
  .on(setVisualizerAutoCycle, (state, autoCycle) => applyPatch(state, { autoCycle }))
  .on(setVisualizerCycleSeconds, (state, cycleSeconds) => applyPatch(state, { cycleSeconds }))
  .on(setVisualizerBlendSeconds, (state, blendSeconds) => applyPatch(state, { blendSeconds }))
  .on(setVisualizerQuality, (state, quality) => applyPatch(state, { quality }))
  .on(setVisualizerFXAA, (state, fxaa) => applyPatch(state, { fxaa }))
  .on(setVisualizerMeshDensity, (state, meshDensity) => applyPatch(state, { meshDensity }));
