import { createEffect, createStore } from 'effector';
import { rpc } from '../rpc';

export interface DepsStatus {
  ytdlp: boolean;
  ffmpeg: boolean;
}

export const checkDepsFx = createEffect<void, DepsStatus>(async () => {
  return await rpc.proxy.request['deps:check'](undefined as any);
});

export const $depsStatus = createStore<DepsStatus | null>(null).on(
  checkDepsFx.doneData,
  (_, status) => status
);
