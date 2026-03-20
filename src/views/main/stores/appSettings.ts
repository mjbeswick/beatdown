import { createEvent, createStore } from 'effector';

export type PlayerSeekerStyle = 'bar' | 'waveform';
export type DjMode = 'off' | 'crossfade' | 'beatmatch';

export const MIN_WAVEFORM_BAR_WIDTH = 1;
export const MAX_WAVEFORM_BAR_WIDTH = 8;
export const MIN_WAVEFORM_HEIGHT = 12;
export const MAX_WAVEFORM_HEIGHT = 32;

export interface AppSettings {
  confirmTrackDeletion: boolean;
  playerSeekerStyle: PlayerSeekerStyle;
  waveformHeight: number;
  waveformBarWidth: number;
  waveformBarGap: number;
  waveformBarRadius: number;
  waveformBarFullRounding: boolean;
  djMode: DjMode;
  crossfadeDuration: number; // seconds, 2–16
}

const STORAGE_KEY = 'reel:app-settings';

const DEFAULT_SETTINGS: AppSettings = {
  confirmTrackDeletion: true,
  playerSeekerStyle: 'bar',
  waveformHeight: 18,
  waveformBarWidth: 2,
  waveformBarGap: 2,
  waveformBarRadius: 0,
  waveformBarFullRounding: false,
  djMode: 'off',
  crossfadeDuration: 8,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getWaveformBarMaxRadius(barWidth: number): number {
  return Math.floor(clamp(barWidth, MIN_WAVEFORM_BAR_WIDTH, MAX_WAVEFORM_BAR_WIDTH) / 2);
}

export function getWaveformBarRadius(
  settings: Pick<AppSettings, 'waveformBarWidth' | 'waveformBarRadius' | 'waveformBarFullRounding'>
): number {
  const maxRadius = getWaveformBarMaxRadius(settings.waveformBarWidth);
  return settings.waveformBarFullRounding
    ? maxRadius
    : clamp(settings.waveformBarRadius, 0, maxRadius);
}

function sanitizePlayerSeekerStyle(value: unknown): PlayerSeekerStyle {
  return value === 'waveform' ? 'waveform' : DEFAULT_SETTINGS.playerSeekerStyle;
}

function sanitizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const barWidth =
    typeof input?.waveformBarWidth === 'number'
      ? clamp(input.waveformBarWidth, MIN_WAVEFORM_BAR_WIDTH, MAX_WAVEFORM_BAR_WIDTH)
      : DEFAULT_SETTINGS.waveformBarWidth;
  const maxRadius = getWaveformBarMaxRadius(barWidth);
  const barRadius =
    typeof input?.waveformBarRadius === 'number'
      ? clamp(input.waveformBarRadius, 0, maxRadius)
      : clamp(DEFAULT_SETTINGS.waveformBarRadius, 0, maxRadius);
  return {
    confirmTrackDeletion:
      typeof input?.confirmTrackDeletion === 'boolean'
        ? input.confirmTrackDeletion
        : DEFAULT_SETTINGS.confirmTrackDeletion,
    playerSeekerStyle: sanitizePlayerSeekerStyle(input?.playerSeekerStyle),
    waveformHeight:
      typeof input?.waveformHeight === 'number'
        ? clamp(input.waveformHeight, MIN_WAVEFORM_HEIGHT, MAX_WAVEFORM_HEIGHT)
        : DEFAULT_SETTINGS.waveformHeight,
    waveformBarWidth: barWidth,
    waveformBarGap:
      typeof input?.waveformBarGap === 'number'
        ? clamp(input.waveformBarGap, 0, 8)
        : DEFAULT_SETTINGS.waveformBarGap,
    waveformBarRadius: barRadius,
    waveformBarFullRounding:
      typeof input?.waveformBarFullRounding === 'boolean'
        ? input.waveformBarFullRounding
        : maxRadius > 0 && barRadius === maxRadius,
    djMode:
      input?.djMode === 'crossfade' || input?.djMode === 'beatmatch'
        ? input.djMode
        : DEFAULT_SETTINGS.djMode,
    crossfadeDuration:
      typeof input?.crossfadeDuration === 'number'
        ? clamp(input.crossfadeDuration, 2, 16)
        : DEFAULT_SETTINGS.crossfadeDuration,
  };
}

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    return sanitizeSettings(JSON.parse(stored) as Partial<AppSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

function applyPatch(state: AppSettings, patch: Partial<AppSettings>): AppSettings {
  const next = sanitizeSettings({ ...state, ...patch });
  saveSettings(next);
  return next;
}

export const patchAppSettings = createEvent<Partial<AppSettings>>();
export const setConfirmTrackDeletion = createEvent<boolean>();

export const $appSettings = createStore<AppSettings>(loadSettings())
  .on(patchAppSettings, (state, patch) => applyPatch(state, patch))
  .on(setConfirmTrackDeletion, (state, confirmTrackDeletion) =>
    applyPatch(state, { confirmTrackDeletion })
  );