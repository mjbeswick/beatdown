import { createStore, createEvent } from 'effector';
import { rpc } from '../rpc';
import type { DLNADevice } from '../../../shared/types';
import { $player, pause, resume, seek, togglePlay } from './player';

export type { DLNADevice };

interface CastState {
  devices: DLNADevice[];
  activeDevice: DLNADevice | null;
  isDiscovering: boolean;
  isCasting: boolean;
}

export const devicesDiscovered = createEvent<DLNADevice[]>();
export const discoveringStarted = createEvent();
export const deviceSelected = createEvent<DLNADevice | null>();

export const $cast = createStore<CastState>({
  devices: [],
  activeDevice: null,
  isDiscovering: false,
  isCasting: false,
})
  .on(discoveringStarted, (s) => ({ ...s, isDiscovering: true }))
  .on(devicesDiscovered, (s, devices) => ({ ...s, devices, isDiscovering: false }))
  .on(deviceSelected, (s, device) => ({
    ...s,
    activeDevice: device,
    isCasting: device !== null,
  }));

// ── Sync playback events to cast device ──────────────────────────────────────

// Track the last cast path so we only re-cast when the track actually changes
let prevCastPath: string | null = null;

$player.watch((state) => {
  const cast = $cast.getState();
  if (!cast.isCasting || !cast.activeDevice) return;

  const currentPath = state.current?.track.filePath ?? null;
  if (currentPath !== prevCastPath) {
    prevCastPath = currentPath;
    if (currentPath && state.isPlaying) {
      rpc.proxy.request['cast:start']({
        deviceId: cast.activeDevice.id,
        streamPath: currentPath,
        title: state.current!.track.title,
        artist: state.current!.track.artist,
      }).catch(() => {});
    }
  }
});

// togglePlay fires BEFORE the store updates, so isPlaying reflects the current
// (pre-toggle) state: true → going to pause, false → going to play
togglePlay.watch(() => {
  const cast = $cast.getState();
  if (!cast.isCasting || !cast.activeDevice) return;
  const { isPlaying } = $player.getState();
  if (isPlaying) {
    rpc.proxy.request['cast:pause']({ deviceId: cast.activeDevice.id }).catch(() => {});
  } else {
    rpc.proxy.request['cast:resume']({ deviceId: cast.activeDevice.id }).catch(() => {});
  }
});

pause.watch(() => {
  const cast = $cast.getState();
  if (!cast.isCasting || !cast.activeDevice) return;
  rpc.proxy.request['cast:pause']({ deviceId: cast.activeDevice.id }).catch(() => {});
});

resume.watch(() => {
  const cast = $cast.getState();
  if (!cast.isCasting || !cast.activeDevice) return;
  rpc.proxy.request['cast:resume']({ deviceId: cast.activeDevice.id }).catch(() => {});
});

seek.watch((seconds) => {
  const cast = $cast.getState();
  if (!cast.isCasting || !cast.activeDevice) return;
  rpc.proxy.request['cast:seek']({ deviceId: cast.activeDevice.id, seconds }).catch(() => {});
});
