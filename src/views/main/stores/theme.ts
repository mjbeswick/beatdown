import { createStore, createEvent } from 'effector';

export type ThemeOption = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'reel:theme';

function readTheme(): ThemeOption {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {}
  return 'system';
}

export const themeChanged = createEvent<ThemeOption>();

export const $theme = createStore<ThemeOption>(readTheme()).on(themeChanged, (_, t) => t);

// Persist to localStorage on every change.
$theme.watch((t) => {
  try { localStorage.setItem(STORAGE_KEY, t); } catch {}
});
