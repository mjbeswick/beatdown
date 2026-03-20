import { createEvent, createStore } from 'effector';

export interface AppSettings {
  confirmTrackDeletion: boolean;
  waveformBarWidth: number;
  waveformBarGap: number;
  waveformBarRadius: number;
}

const STORAGE_KEY = 'reel:app-settings';

const DEFAULT_SETTINGS: AppSettings = {
  confirmTrackDeletion: true,
  waveformBarWidth: 5,
  waveformBarGap: 3,
  waveformBarRadius: 0,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const barWidth =
    typeof input?.waveformBarWidth === 'number'
      ? clamp(input.waveformBarWidth, 1, 8)
      : DEFAULT_SETTINGS.waveformBarWidth;
  const maxRadius = Math.floor(barWidth / 2);
  return {
    confirmTrackDeletion:
      typeof input?.confirmTrackDeletion === 'boolean'
        ? input.confirmTrackDeletion
        : DEFAULT_SETTINGS.confirmTrackDeletion,
    waveformBarWidth: barWidth,
    waveformBarGap:
      typeof input?.waveformBarGap === 'number'
        ? clamp(input.waveformBarGap, 0, 8)
        : DEFAULT_SETTINGS.waveformBarGap,
    waveformBarRadius:
      typeof input?.waveformBarRadius === 'number'
        ? clamp(input.waveformBarRadius, 0, maxRadius)
        : clamp(DEFAULT_SETTINGS.waveformBarRadius, 0, maxRadius),
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