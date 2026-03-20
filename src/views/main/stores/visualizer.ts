import { createEvent, createStore } from 'effector';
import { rpc } from '../rpc';
import { loadSettingsFx } from './settingsLoader';

export type VisualizerQualityPreset = 'performance' | 'balanced' | 'detail' | 'ultra';
export type VisualizerMeshDensity = 'sparse' | 'standard' | 'dense' | 'extreme';
export type VisualizerCycleOrder = 'random' | 'sequential';
export type VisualizerPresetPreference = 'default' | 'favorite' | 'hidden';
export type VisualizerFps = 24 | 30 | 60 | 0; // 0 = unlimited

export interface VisualizerSettings {
  presetName: string;
  autoCycle: boolean;
  cycleSeconds: number;
  blendSeconds: number;
  quality: VisualizerQualityPreset;
  fxaa: boolean;
  meshDensity: VisualizerMeshDensity;
  cycleOrder: VisualizerCycleOrder;
  onlyFavourites: boolean;
  presetPreferences: Record<string, VisualizerPresetPreference>;
  fps: VisualizerFps;
  showTrackChangeOverlay: boolean;
  trackChangeOverlaySeconds: number;
  changePresetOnTrackChange: boolean;
}

const QUALITY_PRESETS: VisualizerQualityPreset[] = ['performance', 'balanced', 'detail', 'ultra'];
const MESH_DENSITIES: VisualizerMeshDensity[] = ['sparse', 'standard', 'dense', 'extreme'];
const CYCLE_ORDERS: VisualizerCycleOrder[] = ['random', 'sequential'];
const PRESET_PREFERENCES: VisualizerPresetPreference[] = ['default', 'favorite', 'hidden'];
const FPS_VALUES: VisualizerFps[] = [24, 30, 60, 0];

const DEFAULT_SETTINGS: VisualizerSettings = {
  presetName: '',
  autoCycle: true,
  cycleSeconds: 30,
  blendSeconds: 2,
  quality: 'balanced',
  fxaa: false,
  meshDensity: 'standard',
  cycleOrder: 'random',
  onlyFavourites: false,
  presetPreferences: {},
  fps: 60,
  showTrackChangeOverlay: true,
  trackChangeOverlaySeconds: 5,
  changePresetOnTrackChange: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeSettings(input: Partial<VisualizerSettings> | null | undefined): VisualizerSettings {
  const rawPreferences =
    input?.presetPreferences && typeof input.presetPreferences === 'object'
      ? input.presetPreferences
      : {};
  const presetPreferences = Object.fromEntries(
    Object.entries(rawPreferences).filter(
      ([presetName, preference]) =>
        typeof presetName === 'string' &&
        typeof preference === 'string' &&
        preference !== 'default' &&
        PRESET_PREFERENCES.includes(preference as VisualizerPresetPreference)
    )
  ) as Record<string, VisualizerPresetPreference>;

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
    cycleOrder:
      typeof input?.cycleOrder === 'string' && CYCLE_ORDERS.includes(input.cycleOrder as VisualizerCycleOrder)
        ? (input.cycleOrder as VisualizerCycleOrder)
        : DEFAULT_SETTINGS.cycleOrder,
    onlyFavourites: typeof input?.onlyFavourites === 'boolean' ? input.onlyFavourites : DEFAULT_SETTINGS.onlyFavourites,
    fps:
      typeof input?.fps === 'number' && FPS_VALUES.includes(input.fps as VisualizerFps)
        ? (input.fps as VisualizerFps)
        : DEFAULT_SETTINGS.fps,
    showTrackChangeOverlay:
      typeof input?.showTrackChangeOverlay === 'boolean'
        ? input.showTrackChangeOverlay
        : DEFAULT_SETTINGS.showTrackChangeOverlay,
    trackChangeOverlaySeconds: clamp(
      typeof input?.trackChangeOverlaySeconds === 'number'
        ? input.trackChangeOverlaySeconds
        : DEFAULT_SETTINGS.trackChangeOverlaySeconds,
      0,
      30
    ),
    changePresetOnTrackChange:
      typeof input?.changePresetOnTrackChange === 'boolean'
        ? input.changePresetOnTrackChange
        : DEFAULT_SETTINGS.changePresetOnTrackChange,
    presetPreferences,
  };
}

function loadSettings(): VisualizerSettings {
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: VisualizerSettings): void {
  rpc.proxy.request['settings:save']({ key: 'visualizer', value: settings }).catch(() => {});
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
export const resetVisualizerFavorites = createEvent();
export const resetVisualizerHidden = createEvent();
export const setVisualizerPresetName = createEvent<string>();
export const setVisualizerAutoCycle = createEvent<boolean>();
export const setVisualizerCycleSeconds = createEvent<number>();
export const setVisualizerBlendSeconds = createEvent<number>();
export const setVisualizerQuality = createEvent<VisualizerQualityPreset>();
export const setVisualizerFXAA = createEvent<boolean>();
export const setVisualizerMeshDensity = createEvent<VisualizerMeshDensity>();
export const setVisualizerCycleOrder = createEvent<VisualizerCycleOrder>();
export const setVisualizerOnlyFavourites = createEvent<boolean>();
export const setVisualizerFps = createEvent<VisualizerFps>();
export const setVisualizerPresetPreference = createEvent<{
  presetName: string;
  preference: VisualizerPresetPreference;
}>();
export const setVisualizerShowTrackChangeOverlay = createEvent<boolean>();
export const setVisualizerTrackChangeOverlaySeconds = createEvent<number>();
export const setVisualizerChangePresetOnTrackChange = createEvent<boolean>();

export const $visualizerSettings = createStore<VisualizerSettings>(loadSettings())
  .on(loadSettingsFx.doneData, (state, data) =>
    data.visualizer ? sanitizeSettings(data.visualizer as Partial<VisualizerSettings>) : state
  )
  .on(patchVisualizerSettings, (state, patch) => applyPatch(state, patch))
  .on(setVisualizerPresetName, (state, presetName) => applyPatch(state, { presetName }))
  .on(setVisualizerAutoCycle, (state, autoCycle) => applyPatch(state, { autoCycle }))
  .on(setVisualizerCycleSeconds, (state, cycleSeconds) => applyPatch(state, { cycleSeconds }))
  .on(setVisualizerBlendSeconds, (state, blendSeconds) => applyPatch(state, { blendSeconds }))
  .on(setVisualizerQuality, (state, quality) => applyPatch(state, { quality }))
  .on(setVisualizerFXAA, (state, fxaa) => applyPatch(state, { fxaa }))
  .on(setVisualizerMeshDensity, (state, meshDensity) => applyPatch(state, { meshDensity }))
  .on(setVisualizerCycleOrder, (state, cycleOrder) => applyPatch(state, { cycleOrder }))
  .on(setVisualizerOnlyFavourites, (state, onlyFavourites) => applyPatch(state, { onlyFavourites }))
  .on(setVisualizerFps, (state, fps) => applyPatch(state, { fps }))
  .on(setVisualizerShowTrackChangeOverlay, (state, showTrackChangeOverlay) => applyPatch(state, { showTrackChangeOverlay }))
  .on(setVisualizerTrackChangeOverlaySeconds, (state, trackChangeOverlaySeconds) => applyPatch(state, { trackChangeOverlaySeconds }))
  .on(setVisualizerChangePresetOnTrackChange, (state, changePresetOnTrackChange) => applyPatch(state, { changePresetOnTrackChange }))
  .on(setVisualizerPresetPreference, (state, { presetName, preference }) => {
    const presetPreferences = { ...state.presetPreferences };
    if (preference === 'default') delete presetPreferences[presetName];
    else presetPreferences[presetName] = preference;
    return applyPatch(state, { presetPreferences });
  })
  .on(resetVisualizerFavorites, (state) => {
    const presetPreferences = Object.fromEntries(
      Object.entries(state.presetPreferences).filter(([, v]) => v !== 'favorite')
    ) as Record<string, VisualizerPresetPreference>;
    return applyPatch(state, { presetPreferences });
  })
  .on(resetVisualizerHidden, (state) => {
    const presetPreferences = Object.fromEntries(
      Object.entries(state.presetPreferences).filter(([, v]) => v !== 'hidden')
    ) as Record<string, VisualizerPresetPreference>;
    return applyPatch(state, { presetPreferences });
  });
