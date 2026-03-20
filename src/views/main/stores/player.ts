import { createStore, createEvent, createEffect, sample } from 'effector';
import type { DownloadItem, TrackInfo } from '../../../shared/types';
import { rpc } from '../rpc';
import { downloadRemoved, downloadUpdated, loadAllFx } from './downloads';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RepeatMode = 'off' | 'one' | 'all';
export type ShuffleMode = 'off' | 'on';

export interface PlayingTrack {
  track: TrackInfo;
  downloadId: string;
  coverArt?: string;
  albumName: string;
}

interface FollowPlaylistState {
  downloadId: string;
  albumName: string;
  coverArt?: string;
  trackOrder: string[];
  queuedTrackIds: string[];
}

interface PersistedTrackRef {
  downloadId: string;
  trackId: string;
}

interface PersistedPlayerSession {
  version: 1;
  current: PersistedTrackRef | null;
  queue: PersistedTrackRef[];
  queueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  followPlaylist: FollowPlaylistState | null;
}

interface RestoredPlayerSession {
  current: PlayingTrack;
  queue: PlayingTrack[];
  queueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  followPlaylist: FollowPlaylistState | null;
}

interface PlayerState {
  current: PlayingTrack | null;
  queue: PlayingTrack[];
  queueIndex: number;
  isPlaying: boolean;
  volume: number;
  lastVolume: number;
  currentTime: number;
  duration: number;
  shuffle: ShuffleMode;
  repeat: RepeatMode;
  streamPort: number;
}

// ── Events ────────────────────────────────────────────────────────────────────
export const playTrack = createEvent<PlayingTrack>();
export const playPlaylist = createEvent<{ tracks: PlayingTrack[]; startIndex: number }>();
export const playDownloadPlaylist = createEvent<DownloadItem>();
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
export const jumpToQueueIndex = createEvent<number>();
export const removeFromQueue = createEvent<number>();
const playerSessionRestored = createEvent<RestoredPlayerSession>();
const followPlaylistTracksQueued = createEvent<{
  downloadId: string;
  trackIds: string[];
  tracks: PlayingTrack[];
}>();

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

const PLAYER_SESSION_STORAGE_KEY = 'reel:player-session';
const PLAYER_SESSION_VERSION = 1 as const;

function isPersistedTrackRef(value: unknown): value is PersistedTrackRef {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as PersistedTrackRef).downloadId === 'string' &&
    typeof (value as PersistedTrackRef).trackId === 'string'
  );
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function loadPersistedPlayerSession(): { snapshot: PersistedPlayerSession | null; serialized: string } {
  try {
    const serialized = localStorage.getItem(PLAYER_SESSION_STORAGE_KEY) ?? '';
    if (!serialized) return { snapshot: null, serialized: '' };

    const raw = JSON.parse(serialized) as Partial<PersistedPlayerSession> | null;
    if (!raw || raw.version !== PLAYER_SESSION_VERSION) {
      return { snapshot: null, serialized: '' };
    }

    return {
      snapshot: {
        version: PLAYER_SESSION_VERSION,
        current: isPersistedTrackRef(raw.current) ? raw.current : null,
        queue: Array.isArray(raw.queue) ? raw.queue.filter(isPersistedTrackRef) : [],
        queueIndex:
          typeof raw.queueIndex === 'number' && Number.isFinite(raw.queueIndex)
            ? Math.max(0, Math.floor(raw.queueIndex))
            : 0,
        isPlaying: Boolean(raw.isPlaying),
        currentTime:
          typeof raw.currentTime === 'number' && Number.isFinite(raw.currentTime)
            ? Math.max(0, raw.currentTime)
            : 0,
        followPlaylist:
          raw.followPlaylist &&
          typeof raw.followPlaylist === 'object' &&
          typeof raw.followPlaylist.downloadId === 'string' &&
          typeof raw.followPlaylist.albumName === 'string'
            ? {
                downloadId: raw.followPlaylist.downloadId,
                albumName: raw.followPlaylist.albumName,
                coverArt:
                  typeof raw.followPlaylist.coverArt === 'string'
                    ? raw.followPlaylist.coverArt
                    : undefined,
                trackOrder: sanitizeStringArray(raw.followPlaylist.trackOrder),
                queuedTrackIds: sanitizeStringArray(raw.followPlaylist.queuedTrackIds),
              }
            : null,
      },
      serialized,
    };
  } catch {
    return { snapshot: null, serialized: '' };
  }
}

function savePlayerSession(snapshot: PersistedPlayerSession | null): string {
  const serialized = snapshot ? JSON.stringify(snapshot) : '';

  try {
    if (snapshot) localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, serialized);
    else localStorage.removeItem(PLAYER_SESSION_STORAGE_KEY);
  } catch {}

  return serialized;
}

function isPlayableTrack(track: TrackInfo): boolean {
  return track.status === 'done' && Boolean(track.filePath);
}

function toPersistedTrackRef(track: PlayingTrack): PersistedTrackRef {
  return {
    downloadId: track.downloadId,
    trackId: track.track.id,
  };
}

function createPlayerSessionSnapshot(
  player: PlayerState,
  followPlaylist: FollowPlaylistState | null
): PersistedPlayerSession | null {
  if (!player.current || player.queue.length === 0) return null;

  const queue = player.queue.map(toPersistedTrackRef);
  if (queue.length === 0) return null;

  const currentTimeAtRest =
    player.duration > 0 && player.currentTime >= Math.max(0, player.duration - 1)
      ? 0
      : Math.max(0, Math.round(player.currentTime));

  return {
    version: PLAYER_SESSION_VERSION,
    current: toPersistedTrackRef(player.current),
    queue,
    queueIndex: Math.max(0, Math.min(player.queueIndex, queue.length - 1)),
    isPlaying: player.isPlaying,
    currentTime: currentTimeAtRest,
    followPlaylist,
  };
}

function restorePlayingTrack(
  ref: PersistedTrackRef,
  itemsById: Map<string, DownloadItem>
): PlayingTrack | null {
  const item = itemsById.get(ref.downloadId);
  if (!item) return null;

  const track = item.tracks.find((candidate) => candidate.id === ref.trackId);
  if (!track || !isPlayableTrack(track)) return null;

  return asPlayingTrack(track, item);
}

function getFilteredQueueIndex(entries: Array<PlayingTrack | null>, rawIndex: number): number {
  let filteredIndex = 0;

  for (let i = 0; i < rawIndex; i++) {
    if (entries[i]) filteredIndex++;
  }

  return filteredIndex;
}

function findClosestRestoredQueueIndex(
  entries: Array<PlayingTrack | null>,
  preferredRawIndex: number
): number {
  if (entries.length === 0) return -1;

  const clampedIndex = Math.max(0, Math.min(preferredRawIndex, entries.length - 1));
  if (entries[clampedIndex]) return getFilteredQueueIndex(entries, clampedIndex);

  for (let offset = 1; offset < entries.length; offset++) {
    const afterIndex = clampedIndex + offset;
    if (afterIndex < entries.length && entries[afterIndex]) {
      return getFilteredQueueIndex(entries, afterIndex);
    }

    const beforeIndex = clampedIndex - offset;
    if (beforeIndex >= 0 && entries[beforeIndex]) {
      return getFilteredQueueIndex(entries, beforeIndex);
    }
  }

  const firstIndex = entries.findIndex((entry) => entry !== null);
  return firstIndex >= 0 ? getFilteredQueueIndex(entries, firstIndex) : -1;
}

function restoreFollowPlaylistState(
  snapshot: PersistedPlayerSession,
  itemsById: Map<string, DownloadItem>,
  queue: PlayingTrack[]
): FollowPlaylistState | null {
  const followPlaylist = snapshot.followPlaylist;
  if (!followPlaylist) return null;

  const item = itemsById.get(followPlaylist.downloadId);
  if (!item || item.type !== 'playlist') return null;

  const trackOrder = item.tracks.map((track) => track.id);
  const queuedTrackIds = queue
    .filter((track) => track.downloadId === item.id)
    .map((track) => track.track.id);

  if (queuedTrackIds.length === 0 || queuedTrackIds.length >= trackOrder.length) {
    return null;
  }

  return {
    downloadId: item.id,
    albumName: item.name,
    coverArt: item.coverArt,
    trackOrder,
    queuedTrackIds,
  };
}

function appendRestoredFollowPlaylistTracks(
  snapshot: PersistedPlayerSession,
  itemsById: Map<string, DownloadItem>,
  queue: PlayingTrack[]
): PlayingTrack[] {
  const followPlaylist = snapshot.followPlaylist;
  if (!followPlaylist) return queue;

  const item = itemsById.get(followPlaylist.downloadId);
  if (!item || item.type !== 'playlist') return queue;

  const queuedTrackIds = new Set(
    queue
      .filter((track) => track.downloadId === item.id)
      .map((track) => track.track.id)
  );

  const appendedTracks = item.tracks
    .filter((track) => isPlayableTrack(track) && !queuedTrackIds.has(track.id))
    .map((track) => asPlayingTrack(track, item));

  return appendedTracks.length > 0 ? [...queue, ...appendedTracks] : queue;
}

function restorePlayerSessionFromDownloads(
  snapshot: PersistedPlayerSession,
  downloads: DownloadItem[]
): RestoredPlayerSession | null {
  const itemsById = new Map(downloads.map((item) => [item.id, item]));
  const restoredEntries = snapshot.queue.map((ref) => restorePlayingTrack(ref, itemsById));
  const baseQueue = restoredEntries.filter((entry): entry is PlayingTrack => entry !== null);
  const queue = appendRestoredFollowPlaylistTracks(snapshot, itemsById, baseQueue);
  if (queue.length === 0) return null;

  const preferredRawIndex = snapshot.current
    ? snapshot.queue.findIndex(
        (trackRef) =>
          trackRef.downloadId === snapshot.current?.downloadId &&
          trackRef.trackId === snapshot.current?.trackId
      )
    : -1;
  const queueIndex = findClosestRestoredQueueIndex(
    restoredEntries,
    preferredRawIndex >= 0 ? preferredRawIndex : snapshot.queueIndex
  );
  const current = queue[queueIndex] ?? queue[0];
  const followPlaylist = restoreFollowPlaylistState(snapshot, itemsById, queue);

  return {
    current,
    queue,
    queueIndex: current ? queue.indexOf(current) : 0,
    isPlaying: snapshot.isPlaying,
    currentTime: Math.max(0, snapshot.currentTime),
    followPlaylist,
  };
}

function asPlayingTrack(track: TrackInfo, item: Pick<DownloadItem, 'id' | 'coverArt' | 'name'>): PlayingTrack {
  return {
    track,
    downloadId: item.id,
    coverArt: item.coverArt,
    albumName: item.name,
  };
}

function getPlayableTracks(item: Pick<DownloadItem, 'id' | 'coverArt' | 'name' | 'tracks'>): PlayingTrack[] {
  return item.tracks
    .filter((track) => track.status === 'done')
    .map((track) => asPlayingTrack(track, item));
}

const $followPlaylist = createStore<FollowPlaylistState | null>(null)
  .on(playerSessionRestored, (_, session) => session.followPlaylist)
  .on(playDownloadPlaylist, (_, item) => {
    if (item.type !== 'playlist') return null;

    const queuedTrackIds = item.tracks
      .filter((track) => track.status === 'done')
      .map((track) => track.id);

    if (queuedTrackIds.length === 0 || queuedTrackIds.length >= item.tracks.length) {
      return null;
    }

    return {
      downloadId: item.id,
      albumName: item.name,
      coverArt: item.coverArt,
      trackOrder: item.tracks.map((track) => track.id),
      queuedTrackIds,
    };
  })
  .reset(playTrack, playPlaylist)
  .on(downloadRemoved, (state, id) => (state?.downloadId === id ? null : state))
  .on(followPlaylistTracksQueued, (state, payload) => {
    if (!state || state.downloadId !== payload.downloadId || payload.trackIds.length === 0) {
      return state;
    }

    const queuedTrackIds = [...state.queuedTrackIds, ...payload.trackIds];

    if (queuedTrackIds.length >= state.trackOrder.length) {
      return null;
    }

    return {
      ...state,
      queuedTrackIds,
    };
  });

export const $player = createStore<PlayerState>({
  current: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  volume: loadPref('reel:volume', 1),
  lastVolume: loadPref('reel:volume', 1),
  currentTime: 0,
  duration: 0,
  shuffle: loadPref<ShuffleMode>('reel:shuffle', 'off'),
  repeat: loadPref<RepeatMode>('reel:repeat', 'off'),
  streamPort: 0,
})
  .on(playerSessionRestored, (state, session) => ({
    ...state,
    current: session.current,
    queue: session.queue,
    queueIndex: session.queueIndex,
    isPlaying: session.isPlaying,
    currentTime: session.currentTime,
    duration: 0,
  }))
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
  .on(playDownloadPlaylist, (state, item) => {
    const tracks = getPlayableTracks(item);
    if (tracks.length === 0) return state;

    return {
      ...state,
      current: tracks[0],
      queue: tracks,
      queueIndex: 0,
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
    return { ...state, volume, lastVolume: volume > 0 ? volume : state.lastVolume };
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
  .on(jumpToQueueIndex, (state, idx) => {
    if (idx < 0 || idx >= state.queue.length) return state;
    return {
      ...state,
      current: state.queue[idx],
      queueIndex: idx,
      isPlaying: true,
      currentTime: 0,
    };
  })
  .on(removeFromQueue, (state, idx) => {
    if (idx < 0 || idx >= state.queue.length) return state;
    const newQueue = [...state.queue];
    newQueue.splice(idx, 1);
    const newQueueIndex = idx < state.queueIndex
      ? state.queueIndex - 1
      : state.queueIndex;
    return {
      ...state,
      queue: newQueue,
      queueIndex: newQueueIndex,
      current: newQueue[newQueueIndex] ?? null,
    };
  })
  .on(followPlaylistTracksQueued, (state, payload) => {
    if (payload.tracks.length === 0) return state;

    return {
      ...state,
      queue: [...state.queue, ...payload.tracks],
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

// Fallback: request the port directly in case the push message was missed
rpc.proxy.request['stream:getPort'](undefined as any)
  .then(streamPortReceived)
  .catch(() => {});

const { snapshot: pendingPlayerSession } = loadPersistedPlayerSession();
let canPersistPlayerSession = false;
let lastSavedPlayerSession = '';

loadAllFx.doneData.watch((downloads) => {
  if (canPersistPlayerSession) return;

  canPersistPlayerSession = true;

  if (!pendingPlayerSession) return;

  const restoredSession = restorePlayerSessionFromDownloads(pendingPlayerSession, downloads ?? []);
  if (restoredSession) {
    playerSessionRestored(restoredSession);
    return;
  }

  lastSavedPlayerSession = savePlayerSession(null);
});

$player.updates.watch(() => {
  if (!canPersistPlayerSession) return;

  const snapshot = createPlayerSessionSnapshot($player.getState(), $followPlaylist.getState());
  const serialized = snapshot ? JSON.stringify(snapshot) : '';
  if (serialized === lastSavedPlayerSession) return;

  lastSavedPlayerSession = savePlayerSession(snapshot);
});

$followPlaylist.updates.watch(() => {
  if (!canPersistPlayerSession) return;

  const snapshot = createPlayerSessionSnapshot($player.getState(), $followPlaylist.getState());
  const serialized = snapshot ? JSON.stringify(snapshot) : '';
  if (serialized === lastSavedPlayerSession) return;

  lastSavedPlayerSession = savePlayerSession(snapshot);
});

sample({
  clock: downloadUpdated,
  source: $followPlaylist,
  filter: (follow, item) => Boolean(follow && follow.downloadId === item.id),
  fn: (follow, item) => {
    if (!follow) {
      return {
        downloadId: item.id,
        trackIds: [],
        tracks: [],
      };
    }

    const tracksById = new Map(item.tracks.map((track) => [track.id, track]));
    const queuedTrackIds = new Set(follow.queuedTrackIds);
    const tracks: PlayingTrack[] = [];

    for (const trackId of follow.trackOrder) {
      if (queuedTrackIds.has(trackId)) continue;

      const track = tracksById.get(trackId);
      if (!track || track.status !== 'done') continue;

      tracks.push({
        track,
        downloadId: item.id,
        coverArt: follow.coverArt,
        albumName: follow.albumName,
      });
    }

    return {
      downloadId: item.id,
      trackIds: tracks.map((entry) => entry.track.id),
      tracks,
    };
  },
  target: followPlaylistTracksQueued,
});

// ── Helpers ────────────────────────────────────────────────────────────────────

export function getStreamUrl(filePath: string, port: number): string {
  return `http://127.0.0.1:${port}/stream?path=${encodeURIComponent(filePath)}`;
}
