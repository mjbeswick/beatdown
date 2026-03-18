import { createStore, createEvent, createEffect, combine } from 'effector';
import { socket } from '../socket/client';
import type { DownloadItem } from '../types';

export type FilterType = 'all' | 'active' | 'done' | 'error';
export type AddPhase = 'idle' | 'fetching' | 'error';

// ── Events ──────────────────────────────────────────────────────────────────
export const stateReceived = createEvent<DownloadItem[]>();
export const downloadAdded = createEvent<DownloadItem>();
export const downloadUpdated = createEvent<DownloadItem>();
export const downloadRemoved = createEvent<string>();
export const filterChanged = createEvent<FilterType>();
export const rowToggled = createEvent<string>();
export const addPhaseSet = createEvent<{ phase: AddPhase; message?: string }>();

// ── Effects ──────────────────────────────────────────────────────────────────
export const addDownloadFx = createEffect(
  (params: { url: string; format: string; quality: string }) => {
    socket.emit('download:add', params);
  }
);

export const removeDownloadFx = createEffect((id: string) => {
  socket.emit('download:remove', id);
});

export const removeTrackFx = createEffect(
  ({ downloadId, trackId }: { downloadId: string; trackId: string }) => {
    socket.emit('track:remove', { downloadId, trackId });
  }
);

export const redownloadFx = createEffect((id: string) => {
  socket.emit('download:redownload', id);
});

// ── Stores ────────────────────────────────────────────────────────────────────
export const $downloads = createStore<DownloadItem[]>([])
  .on(stateReceived, (_, items) => items)
  .on(downloadAdded, (items, item) => [item, ...items])
  .on(downloadUpdated, (items, updated) =>
    items.map((i) => (i.id === updated.id ? updated : i))
  )
  .on(downloadRemoved, (items, id) => items.filter((i) => i.id !== id));

export const $filter = createStore<FilterType>('all').on(
  filterChanged,
  (_, f) => f
);

export const $expandedRows = createStore<Set<string>>(new Set()).on(
  rowToggled,
  (set, id) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  }
);

export const $addStatus = createStore<{ phase: AddPhase; message?: string }>({
  phase: 'idle',
}).on(addPhaseSet, (_, s) => s);

export const $filteredDownloads = combine(
  $downloads,
  $filter,
  (downloads, filter) => {
    if (filter === 'all') return downloads;
    if (filter === 'active')
      return downloads.filter((d) =>
        ['fetching', 'queued', 'active'].includes(d.status)
      );
    if (filter === 'done') return downloads.filter((d) => d.status === 'done');
    if (filter === 'error') return downloads.filter((d) => d.status === 'error');
    return downloads;
  }
);

export const $stats = $downloads.map((ds) => ({
  total: ds.length,
  active: ds.filter((d) => ['fetching', 'queued', 'active'].includes(d.status)).length,
  done: ds.filter((d) => d.status === 'done').length,
  error: ds.filter((d) => d.status === 'error').length,
  totalSpeed: ds.reduce((s, d) => s + (d.speed ?? 0), 0),
}));

// ── Socket bindings ───────────────────────────────────────────────────────────
socket.on('downloads:state', (items: DownloadItem[]) => stateReceived(items));
socket.on('download:added', (item: DownloadItem) => {
  downloadAdded(item);
  addPhaseSet({ phase: 'idle' });
});
socket.on('download:updated', (item: DownloadItem) => downloadUpdated(item));
socket.on('download:removed', (id: string) => downloadRemoved(id));
socket.on('download:fetching', () => addPhaseSet({ phase: 'fetching' }));
socket.on('download:fetch_done', () => addPhaseSet({ phase: 'idle' }));
socket.on('download:error', ({ message }: { message: string }) =>
  addPhaseSet({ phase: 'error', message })
);
