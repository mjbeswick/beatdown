import { createStore, createEvent } from 'effector';
import { loadSettingsFx } from './settingsLoader';
import { patchAppSettings } from './appSettings';
import type { NavSection } from './appSettings';
export type { NavSection } from './appSettings';

export const navChanged = createEvent<NavSection>();
export const navToAlbum = createEvent<string>();
export const navToArtist = createEvent<string>();

export const $nav = createStore<NavSection>('playlists')
  .on(navChanged, (_, s) => s)
  .on(loadSettingsFx.doneData, (state, data) => {
    const saved = data.appSettings?.selectedView as NavSection | undefined;
    const valid: NavSection[] = ['nowplaying', 'playlists', 'albums', 'artists', 'genres', 'favourites', 'visualizer', 'settings'];
    return valid.includes(saved!) ? saved! : state;
  });

export const $focusedAlbum = createStore<string | null>(null)
  .on(navToAlbum, (_, id) => id)
  .reset(navChanged);
export const $focusedArtist = createStore<string | null>(null)
  .on(navToArtist, (_, a) => a)
  .reset(navChanged);

navToAlbum.watch(() => navChanged('albums'));
navToArtist.watch(() => navChanged('artists'));

navChanged.watch((section) => patchAppSettings({ selectedView: section }));
