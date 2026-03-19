import { createStore, createEvent, createEffect, sample } from 'effector';
import type { TrackInfo } from '../../../shared/types';
import { rpc } from '../rpc';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RepeatMode = 'off' | 'one' | 'all';
export type ShuffleMode = 'off' | 'on';

export interface PlayingTrack {
  track: TrackInfo;
  downloadId: string;
  coverArt?: string;
  albumName: string;
}

interface PlayerState {
  current: PlayingTrack | null;
  queue: PlayingTrack[];
  queueIndex: number;
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  shuffle: ShuffleMode;
  repeat: RepeatMode;
  streamPort: number;
}

// ── Events ────────────────────────────────────────────────────────────────────
export const playTrack = createEvent<PlayingTrack>();
export const playPlaylist = createEvent<{ tracks: PlayingTrack[]; startIndex: number }>();
export const enqueueTrack = createEvent<PlayingTrack>();
export const playNext = createEvent<PlayingTrack>();
export const pause = createEvent();
export const resume = createEvent();
export const togglePlay = createEvent();
export const next = createEvent();
export const prev = createEvent();
export const seek = createEvent<number>();
export const setVolume = createEvent<number>();
export const toggleShuffle = createEvent();
export const toggleRepeat = createEvent();
export const trackEnded = createEvent();
export const timeUpdated = createEvent<{ currentTime: number; duration: number }>();
export const streamPortReceived = createEvent<number>();

// ── Store ─────────────────────────────────────────────────────────────────────

function loadPref<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s !== null ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

function savePref<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export const $player = createStore<PlayerState>({
  current: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  volume: loadPref('reel:volume', 1),
  currentTime: 0,
  duration: 0,
  shuffle: loadPref<ShuffleMode>('reel:shuffle', 'off'),
  repeat: loadPref<RepeatMode>('reel:repeat', 'off'),
  streamPort: 0,
})
  .on(playTrack, (state, track) => ({
    ...state,
    current: track,
    queue: [track],
    queueIndex: 0,
    isPlaying: true,
    currentTime: 0,
  }))
  .on(playPlaylist, (state, { tracks, startIndex }) => {
    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));
    return {
      ...state,
      current: tracks[idx],
      queue: tracks,
      queueIndex: idx,
      isPlaying: true,
      currentTime: 0,
    };
  })
  .on(enqueueTrack, (state, track) => ({
    ...state,
    queue: [...state.queue, track],
  }))
  .on(playNext, (state, track) => {
    const newQueue = [...state.queue];
    newQueue.splice(state.queueIndex + 1, 0, track);
    return { ...state, queue: newQueue };
  })
  .on(pause, (state) => ({ ...state, isPlaying: false }))
  .on(resume, (state) => ({ ...state, isPlaying: true }))
  .on(togglePlay, (state) => ({ ...state, isPlaying: !state.isPlaying }))
  .on(setVolume, (state, volume) => {
    savePref('reel:volume', volume);
    return { ...state, volume };
  })
  .on(toggleShuffle, (state) => {
    const shuffle: ShuffleMode = state.shuffle === 'off' ? 'on' : 'off';
    savePref('reel:shuffle', shuffle);
    return { ...state, shuffle };
  })
  .on(toggleRepeat, (state) => {
    const modes: RepeatMode[] = ['off', 'one', 'all'];
    const repeat = modes[(modes.indexOf(state.repeat) + 1) % modes.length];
    savePref('reel:repeat', repeat);
    return { ...state, repeat };
  })
  .on(timeUpdated, (state, { currentTime, duration }) => ({
    ...state,
    currentTime,
    duration,
  }))
  .on(streamPortReceived, (state, port) => ({ ...state, streamPort: port }))
  .on(next, (state) => {
    const { queue, queueIndex, shuffle, repeat } = state;
    if (queue.length === 0) return state;

    let nextIdx: number;
    if (shuffle === 'on') {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = queueIndex + 1;
      if (nextIdx >= queue.length) {
        if (repeat === 'all') nextIdx = 0;
        else return { ...state, isPlaying: false };
      }
    }

    return {
      ...state,
      current: queue[nextIdx],
      queueIndex: nextIdx,
      isPlaying: true,
      currentTime: 0,
    };
  })
  .on(prev, (state) => {
    const { queue, queueIndex, currentTime } = state;
    // If > 3s in, restart current track
    if (currentTime > 3) {
      seek(0);
      return { ...state, currentTime: 0 };
    }
    const prevIdx = Math.max(0, queueIndex - 1);
    return {
      ...state,
      current: queue[prevIdx],
      queueIndex: prevIdx,
      isPlaying: true,
      currentTime: 0,
    };
  })
  .on(trackEnded, (state) => {
    const { queue, queueIndex, repeat, shuffle } = state;
    if (repeat === 'one') {
      return { ...state, currentTime: 0, isPlaying: true };
    }
    let nextIdx: number;
    if (shuffle === 'on') {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = queueIndex + 1;
    }
    if (nextIdx >= queue.length) {
      if (repeat === 'all') nextIdx = 0;
      else return { ...state, isPlaying: false };
    }
    return {
      ...state,
      current: queue[nextIdx],
      queueIndex: nextIdx,
      isPlaying: true,
      currentTime: 0,
    };
  });

// Bind stream port from RPC
rpc.addMessageListener('stream:port', ({ port }) => {
  streamPortReceived(port);
});

// ── Helpers ────────────────────────────────────────────────────────────────────

export function getStreamUrl(filePath: string, port: number): string {
  return `http://localhost:${port}${encodeURI(filePath)}`;
}
