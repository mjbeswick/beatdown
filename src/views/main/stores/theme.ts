import { createStore, createEvent } from 'effector';
import { rpc } from '../rpc';
import { loadSettingsFx } from './settingsLoader';

export type ThemeOption = 'system' | 'light' | 'dark';

function isThemeOption(v: unknown): v is ThemeOption {
  return v === 'system' || v === 'light' || v === 'dark';
}

export const themeChanged = createEvent<ThemeOption>();

export const $theme = createStore<ThemeOption>('system')
  .on(themeChanged, (_, t) => t)
  .on(loadSettingsFx.doneData, (state, data) =>
    isThemeOption(data.theme) ? data.theme : state
  );

$theme.watch((t) => {
  rpc.proxy.request['settings:save']({ key: 'theme', value: t }).catch(() => {});
});
