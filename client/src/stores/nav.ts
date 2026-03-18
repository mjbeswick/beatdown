import { createStore, createEvent } from 'effector';

export type NavSection = 'playlists' | 'artists' | 'genres' | 'settings';

export const navChanged = createEvent<NavSection>();
export const $nav = createStore<NavSection>('playlists').on(navChanged, (_, s) => s);
