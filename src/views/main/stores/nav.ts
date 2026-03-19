import { createStore, createEvent } from 'effector';

export type NavSection = 'nowplaying' | 'playlists' | 'albums' | 'artists' | 'genres' | 'favourites' | 'visualizer' | 'settings';

export const navChanged = createEvent<NavSection>();
export const navToAlbum = createEvent<string>();
export const navToArtist = createEvent<string>();

export const $nav = createStore<NavSection>('playlists').on(navChanged, (_, s) => s);
export const $focusedAlbum = createStore<string | null>(null)
  .on(navToAlbum, (_, id) => id)
  .reset(navChanged);
export const $focusedArtist = createStore<string | null>(null)
  .on(navToArtist, (_, a) => a)
  .reset(navChanged);

navToAlbum.watch(() => navChanged('albums'));
navToArtist.watch(() => navChanged('artists'));
