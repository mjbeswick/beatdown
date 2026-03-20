import { createStore, createEvent } from 'effector';
import { rpc } from '../rpc';
import { loadSettingsFx } from './settingsLoader';

export const toggleFavourite = createEvent<string>();

export const $favourites = createStore<string[]>([])
  .on(loadSettingsFx.doneData, (_, data) =>
    Array.isArray(data.favourites)
      ? data.favourites.filter((x): x is string => typeof x === 'string')
      : []
  )
  .on(toggleFavourite, (state, id) => {
    const next = state.includes(id) ? state.filter((x) => x !== id) : [...state, id];
    rpc.proxy.request['settings:save']({ key: 'favourites', value: next }).catch(() => {});
    return next;
  });
