import { createStore, createEvent, createEffect, combine } from 'effector';
import { rpc } from '../rpc';
import { navChanged } from './nav';
import type { DownloadItem, AddDownloadParams, SpotifyContent } from '../../../shared/types';
import { confirmDownloadRemoval, confirmTrackRemoval } from '../lib/destructiveActionConfirm';

export type FilterType = 'all' | 'active' | 'done' | 'error';
export type AddPhase = 'idle' | 'fetching' | 'error';

// ── Events ────────────────────────────────────────────────────────────────────
export const stateReceived = createEvent<DownloadItem[]>();
export const downloadAdded = createEvent<DownloadItem>();
export const downloadUpdated = createEvent<DownloadItem>();
export const downloadRemoved = createEvent<string>();
export const filterChanged = createEvent<FilterType>();
export const rowToggled = createEvent<string>();
export const addPhaseSet = createEvent<{ phase: AddPhase; message?: string }>();
export const searchChanged = createEvent<string>();
export const previewClosed = createEvent();
export const resumeBannerShown = createEvent();
export const resumeBannerDismissed = createEvent();
export const closeRequestReceived = createEvent<{ activeCount: number }>();
export const closeRequestDismissed = createEvent();

// ── Effects ───────────────────────────────────────────────────────────────────
export const addDownloadFx = createEffect(async (params: AddDownloadParams) => {
  return rpc.proxy.request['download:add'](params);
});

export type PreviewPhase =
  | { phase: 'loading' }
  | { phase: 'ready'; data: SpotifyContent; url: string }
  | { phase: 'error'; message: string };

export const fetchPreviewFx = createEffect(async (url: string) => {
  return rpc.proxy.request['download:preview']({ url });
});

export const $preview = createStore<PreviewPhase | null>(null)
  .on(fetchPreviewFx, () => ({ phase: 'loading' }))
  .on(fetchPreviewFx.done, (_, { params: url, result: data }) => ({ phase: 'ready', data, url }))
  .on(fetchPreviewFx.fail, (_, { error }) => ({ phase: 'error', message: (error as Error).message }))
  .reset(previewClosed)
  .reset(addDownloadFx.done);

export const removeDownloadFx = createEffect(async (id: string) => {
  const item = $downloads.getState().find((download) => download.id === id);
  if (!(await confirmDownloadRemoval(item))) return;

  return rpc.proxy.request['download:remove']({ id });
});

export const removeTrackFx = createEffect(async ({ downloadId, trackId }: { downloadId: string; trackId: string }) => {
  const item = $downloads.getState().find((download) => download.id === downloadId);
  const track = item?.tracks.find((entry) => entry.id === trackId);
  if (!(await confirmTrackRemoval(track))) return;

  return rpc.proxy.request['track:remove']({ downloadId, trackId });
});

export const retryTrackFx = createEffect(({ downloadId, trackId }: { downloadId: string; trackId: string }) => {
  return rpc.proxy.request['track:retry']({ downloadId, trackId });
});

export const redownloadFx = createEffect((id: string) => {
  return rpc.proxy.request['download:redownload']({ id });
});

export type PrimaryDownloadAction = 'resume' | 'download';

export function getPrimaryDownloadAction(
  item: Pick<DownloadItem, 'status' | 'failedTracks'>
): PrimaryDownloadAction | null {
  if (item.status === 'paused') return 'resume';
  if (item.status === 'error' || item.failedTracks > 0) return 'download';
  return null;
}

export const pauseDownloadFx = createEffect((id: string) => {
  return rpc.proxy.request['download:pause']({ id });
});

export const resumeDownloadFx = createEffect((id: string) => {
  return rpc.proxy.request['download:resume']({ id });
});

export const retryAllFailedFx = createEffect(() => {
  return rpc.proxy.request['downloads:retryFailed'](undefined as any);
});

export const resumeInterruptedFx = createEffect(async () => {
  return rpc.proxy.request['downloads:resumeInterrupted'](undefined as any);
});

export const forceQuitFx = createEffect(async () => {
  return rpc.proxy.request['app:forceQuit'](undefined as any);
});

export const cancelCloseFx = createEffect(async () => {
  return rpc.proxy.request['app:cancelClose'](undefined as any);
});

export const loadAllFx = createEffect(async () => {
  return rpc.proxy.request['downloads:getAll'](undefined as any);
});

// ── Stores ────────────────────────────────────────────────────────────────────
export const $downloads = createStore<DownloadItem[]>([])
  .on(stateReceived, (_, items) => items)
  .on(downloadAdded, (items, item) => [item, ...items])
  .on(downloadUpdated, (items, updated) =>
    items.map((i) => (i.id === updated.id ? updated : i))
  )
  .on(downloadRemoved, (items, id) => items.filter((i) => i.id !== id))
  .on(loadAllFx.doneData, (_, items) => (items ? items : []));

export const $filter = createStore<FilterType>('all').on(filterChanged, (_, f) => f);
export const $search = createStore<string>('')
  .on(searchChanged, (_, s) => s)
  .reset(navChanged);

export const $expandedRows = createStore<Set<string>>(new Set()).on(
  rowToggled,
  (set, id) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  }
);

export const $addStatus = createStore<{ phase: AddPhase; message?: string }>({ phase: 'idle' })
  .on(addPhaseSet, (_, s) => s)
  .on(addDownloadFx, () => ({ phase: 'fetching' }))
  .on(addDownloadFx.done, () => ({ phase: 'idle' }))
  .on(addDownloadFx.fail, (_, { error }) => ({
    phase: 'error',
    message: (error as Error).message,
  }));

export const $filteredDownloads = combine($downloads, $filter, (downloads, filter) => {
  if (filter === 'all') return downloads;
  if (filter === 'active') return downloads.filter((d) => ['fetching', 'queued', 'active'].includes(d.status));
  if (filter === 'done') return downloads.filter((d) => d.status === 'done');
  if (filter === 'error') return downloads.filter((d) => d.status === 'error');
  return downloads;
});

export const $stats = $downloads.map((ds) => ({
  total: ds.length,
  active: ds.filter((d) => ['fetching', 'queued', 'active'].includes(d.status)).length,
  done: ds.filter((d) => d.status === 'done').length,
  error: ds.filter((d) => d.status === 'error').length,
  failedTracks: ds.reduce((s, d) => s + d.failedTracks, 0),
  totalSpeed: ds.reduce((s, d) => s + (d.speed ?? 0), 0),
}));

// ── Resume banner state ───────────────────────────────────────────────────────
// Shown once on startup/reconnect when interrupted downloads are detected.
export const $showResumeBanner = createStore(false)
  .on(resumeBannerShown, () => true)
  .on(resumeBannerDismissed, () => false)
  .reset(resumeInterruptedFx);

// Show the banner the first time loadAllFx resolves with incomplete downloads.
loadAllFx.doneData.watch((downloads) => {
  if (!downloads) return;
  if (downloads.some((d) => d.interrupted)) resumeBannerShown();
});

// ── Close-confirmation state ──────────────────────────────────────────────────
// Set when bun sends 'app:requestClose' because the user tried to quit while
// downloads were still in progress.
export const $closeRequested = createStore<{ activeCount: number } | null>(null)
  .on(closeRequestReceived, (_, data) => data)
  .reset(closeRequestDismissed)
  .reset(forceQuitFx);

// ── RPC bindings ──────────────────────────────────────────────────────────────
rpc.addMessageListener('downloads:state', (items) => stateReceived(items));
rpc.addMessageListener('download:added', (item) => {
  downloadAdded(item);
  addPhaseSet({ phase: 'idle' });
});
rpc.addMessageListener('download:updated', (item) => downloadUpdated(item));
rpc.addMessageListener('download:removed', (id) => downloadRemoved(id));
rpc.addMessageListener('download:fetching', () => addPhaseSet({ phase: 'fetching' }));
rpc.addMessageListener('download:fetch_done', () => addPhaseSet({ phase: 'idle' }));
rpc.addMessageListener('download:error', ({ message }) => addPhaseSet({ phase: 'error', message }));
rpc.addMessageListener('app:requestClose', (data) => closeRequestReceived(data));
