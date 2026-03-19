import { createStore, createEvent } from 'effector';

function loadFavourites(): string[] {
  try {
    const s = localStorage.getItem('reel:favourites');
    return s ? (JSON.parse(s) as string[]) : [];
  } catch {
    return [];
  }
}

export const toggleFavourite = createEvent<string>(); // track id

export const $favourites = createStore<string[]>(loadFavourites()).on(
  toggleFavourite,
  (state, id) => {
    const next = state.includes(id) ? state.filter((x) => x !== id) : [...state, id];
    try { localStorage.setItem('reel:favourites', JSON.stringify(next)); } catch {}
    return next;
  }
);
