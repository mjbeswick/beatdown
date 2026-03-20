import { createEffect } from 'effector';
import { rpc } from '../rpc';
import type { RawSettings } from '../../../shared/rpc-schema';

export const loadSettingsFx = createEffect<void, RawSettings>(async () => {
  return await rpc.proxy.request['settings:load'](undefined as any);
});
