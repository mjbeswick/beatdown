import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
  AudioFormat,
  DownloadItem,
  DownloadStatus,
  QualityPreset,
  SpotifyContent,
  TrackInfo,
  TrackStatus,
} from '../types';
import { downloadTrack, DownloadProgress, getExpectedAudioExtension } from './downloader';
import { logger } from '../logger';
import { savePlaylist, deletePlaylist, loadAllPlaylists } from './playlist';

const DEFAULT_OUTPUT_BASE = path.join(os.homedir(), 'Music', 'Beatdown');
const CONCURRENCY = 3;

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || 'Unknown';
}

function hasTrackFileForFormat(track: TrackInfo, format: AudioFormat): boolean {
  if (!track.filePath || !fs.existsSync(track.filePath)) return false;
  return track.filePath.toLowerCase().endsWith(getExpectedAudioExtension(format));
}

export class DownloadQueue extends EventEmitter {
  private items = new Map<string, DownloadItem>();
  private abortControllers = new Map<string, AbortController>();
  private activeCount = 0;
  private pendingTracks: Array<{ downloadId: string; track: TrackInfo }> = [];

  getAll(): DownloadItem[] {
    return [...this.items.values()].sort(
      (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
    );
  }

  get(id: string): DownloadItem | undefined {
    return this.items.get(id);
  }

  loadFromDisk(): void {
    try {
      const loaded = loadAllPlaylists();
      for (const item of loaded) {
        this.items.set(item.id, item);
      }
      logger.info(`Loaded ${loaded.length} playlist(s) from disk`);
    } catch (err) {
      logger.error('Failed to load playlists from disk', (err as Error).message);
    }
  }

  async add(
    content: SpotifyContent,
    url: string,
    format: AudioFormat,
    quality: QualityPreset
  ): Promise<DownloadItem> {
    const id = uuidv4();
    const outputDir = path.join(DEFAULT_OUTPUT_BASE, sanitize(content.name));
    fs.mkdirSync(outputDir, { recursive: true });

    const tracks: TrackInfo[] = content.tracks.map((t, i) => ({
      id: uuidv4(),
      index: i,
      title: t.title,
      artist: t.artist,
      album: t.album ?? (content.type === 'album' ? content.name : undefined),
      status: 'queued' as TrackStatus,
      progress: 0,
    }));

    const item: DownloadItem = {
      id,
      url,
      name: content.name,
      type: content.type,
      coverArt: content.coverArt,
      tracks,
      status: 'queued',
      progress: 0,
      totalTracks: tracks.length,
      completedTracks: 0,
      failedTracks: 0,
      addedAt: new Date().toISOString(),
      format,
      quality,
      outputDir,
    };

    this.items.set(id, item);
    this.emit('download:added', { ...item });
    savePlaylist(item);
    logger.info(`Added "${content.name}" (${tracks.length} tracks) [${format}/${quality}]`);

    // Enqueue all tracks
    for (const track of tracks) {
      this.pendingTracks.push({ downloadId: id, track });
    }
    this.drain();

    return item;
  }

  remove(id: string): void {
    const item = this.items.get(id);

    const controller = this.abortControllers.get(id);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(id);
    }
    this.pendingTracks = this.pendingTracks.filter((p) => p.downloadId !== id);

    if (item) {
      for (const track of item.tracks) {
        if (track.filePath && fs.existsSync(track.filePath)) {
          try { fs.unlinkSync(track.filePath); } catch { /* ignore */ }
        }
      }
      deletePlaylist(item);
      try {
        if (fs.existsSync(item.outputDir)) {
          const remaining = fs.readdirSync(item.outputDir);
          if (remaining.length === 0) fs.rmdirSync(item.outputDir);
        }
      } catch { /* ignore */ }
    }

    this.items.delete(id);
    this.emit('download:removed', id);
  }

  removeTrack(downloadId: string, trackId: string): void {
    const item = this.items.get(downloadId);
    if (!item) return;
    const track = item.tracks.find((t) => t.id === trackId);
    if (!track) return;

    this.pendingTracks = this.pendingTracks.filter(
      (p) => !(p.downloadId === downloadId && p.track.id === trackId)
    );

    if (track.filePath && fs.existsSync(track.filePath)) {
      try { fs.unlinkSync(track.filePath); } catch { /* ignore */ }
    }

    item.tracks = item.tracks.filter((t) => t.id !== trackId);

    if (item.tracks.length === 0) {
      this.remove(downloadId);
      return;
    }

    this.recalculate(item);
    savePlaylist(item);
  }

  redownload(id: string): void {
    const item = this.items.get(id);
    if (!item) return;

    const controller = this.abortControllers.get(id);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(id);
    }
    this.pendingTracks = this.pendingTracks.filter((p) => p.downloadId !== id);

    let queuedTracks = 0;
    for (const track of item.tracks) {
      const hasMatchingFile = hasTrackFileForFormat(track, item.format);

      if (hasMatchingFile) {
        track.status = 'done';
        track.progress = 100;
        track.speed = undefined;
        track.eta = undefined;
        track.error = undefined;
        continue;
      }

      if (track.filePath && fs.existsSync(track.filePath)) {
        try { fs.unlinkSync(track.filePath); } catch { /* ignore */ }
      }

      track.status = 'queued';
      track.progress = 0;
      track.speed = undefined;
      track.eta = undefined;
      track.error = undefined;
      track.filePath = undefined;
      queuedTracks++;
    }

    item.totalTracks = item.tracks.length;
    item.completedTracks = item.tracks.filter((track) => track.status === 'done').length;
    item.failedTracks = 0;
    item.progress =
      item.totalTracks > 0
        ? Math.round((item.completedTracks / item.totalTracks) * 100)
        : 0;
    item.speed = undefined;
    item.status = queuedTracks > 0 ? 'queued' : 'done';
    item.completedAt = queuedTracks > 0 ? undefined : item.completedAt;

    this.emit('download:updated', { ...item, tracks: item.tracks.map((t) => ({ ...t })) });

    for (const track of item.tracks) {
      if (track.status === 'queued') {
        this.pendingTracks.push({ downloadId: id, track });
      }
    }
    if (queuedTracks > 0) this.drain();

    savePlaylist(item);
  }

  private mutate(id: string, changes: Partial<DownloadItem>): void {
    const item = this.items.get(id);
    if (!item) return;
    Object.assign(item, changes);
    this.emit('download:updated', { ...item, tracks: item.tracks.map((t) => ({ ...t })) });
  }

  private mutateTrack(
    downloadId: string,
    trackId: string,
    changes: Partial<TrackInfo>
  ): void {
    const item = this.items.get(downloadId);
    if (!item) return;
    const track = item.tracks.find((t) => t.id === trackId);
    if (!track) return;
    Object.assign(track, changes);
    this.recalculate(item);
    if (changes.status === 'done' || changes.status === 'error') {
      savePlaylist(item);
    }
  }

  private recalculate(item: DownloadItem): void {
    const totalTracks = item.tracks.length;
    item.totalTracks = totalTracks;

    const done = item.tracks.filter((t) => t.status === 'done').length;
    const failed = item.tracks.filter((t) => t.status === 'error').length;
    const finished = done + failed;
    const activeProgress = item.tracks
      .filter((t) => t.status === 'downloading' || t.status === 'converting')
      .reduce((s, t) => s + t.progress, 0);

    item.completedTracks = done;
    item.failedTracks = failed;
    item.progress = totalTracks > 0
      ? Math.min(Math.round(((finished * 100 + activeProgress) / totalTracks)), 100)
      : 0;
    item.speed = item.tracks
      .filter((t) => t.status === 'downloading')
      .reduce((s, t) => s + (t.speed ?? 0), 0);

    if (finished === totalTracks && totalTracks > 0) {
      item.status = (failed === totalTracks ? 'error' : 'done') as DownloadStatus;
      item.completedAt = new Date().toISOString();
    } else {
      item.status = 'active';
    }

    this.emit('download:updated', { ...item, tracks: item.tracks.map((t) => ({ ...t })) });
  }

  private drain(): void {
    while (this.activeCount < CONCURRENCY && this.pendingTracks.length > 0) {
      const next = this.pendingTracks.shift()!;
      this.runTrack(next.downloadId, next.track);
    }
  }

  private async runTrack(downloadId: string, track: TrackInfo): Promise<void> {
    const item = this.items.get(downloadId);
    if (!item) return;

    this.activeCount++;

    // Get or create abort controller for this download
    if (!this.abortControllers.has(downloadId)) {
      this.abortControllers.set(downloadId, new AbortController());
    }
    const signal = this.abortControllers.get(downloadId)!.signal;

    this.mutateTrack(downloadId, track.id, { status: 'downloading', progress: 0 });

    try {
      const filePath = await downloadTrack(
        { title: track.title, artist: track.artist, album: track.album },
        track.album ?? (item.type === 'album' ? item.name : ''),
        item.outputDir,
        item.format,
        item.quality,
        item.coverArt,
        (progress: DownloadProgress) => {
          this.mutateTrack(downloadId, track.id, {
            progress: Math.round(progress.percent),
            speed: progress.speed,
            eta: progress.eta,
          });
        },
        signal
      );

      this.mutateTrack(downloadId, track.id, {
        status: 'done',
        progress: 100,
        filePath,
        speed: undefined,
        eta: undefined,
      });
      logger.info(`Done: "${track.title}" → ${filePath}`);
    } catch (err) {
      if ((err as Error).message === 'Cancelled') {
        logger.debug(`Cancelled: "${track.title}"`);
      } else {
        logger.error(`Track failed: "${track.title}"`, (err as Error).message);
        this.mutateTrack(downloadId, track.id, {
          status: 'error',
          error: (err as Error).message,
        });
      }
    } finally {
      this.activeCount--;
      this.drain();
    }
  }
}

export const queue = new DownloadQueue();
