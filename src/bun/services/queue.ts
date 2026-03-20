import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  AudioFormat,
  DownloadItem,
  DownloadStatus,
  QualityPreset,
  SpotifyContent,
  TrackInfo,
  TrackStatus,
} from '../../shared/types';
import { getTrackAlbumName } from '../../shared/track-metadata';
import {
  downloadTrack,
  findExistingTrack,
  getArtistDir,
  getExpectedAudioExtension,
  sanitizeFilename,
  type DownloadProgress,
} from './downloader';
import { logger } from '../logger';
import { savePlaylist, deletePlaylist, loadAllPlaylists, calculateSizeOnDiskBytes } from './playlist';
import { paths } from './paths';

const CONCURRENCY = 3;
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [2000, 8000];

function hasTrackFileForFormat(track: TrackInfo, format: AudioFormat): boolean {
  if (!track.filePath || !fs.existsSync(track.filePath)) return false;
  return track.filePath.toLowerCase().endsWith(getExpectedAudioExtension(format));
}

function getFileSizeBytes(filePath: string): number | undefined {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile() ? stats.size : undefined;
  } catch {
    return undefined;
  }
}

function normalizeTrackPart(value: string): string {
  return sanitizeFilename(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function getTrackReferenceKey(
  track: Pick<TrackInfo, 'artist' | 'title'>,
  format: AudioFormat
): string {
  const primaryArtist = track.artist.split(',')[0]?.trim() || track.artist;
  return `${normalizeTrackPart(primaryArtist)}::${normalizeTrackPart(track.title)}::${format}`;
}

export class DownloadQueue extends EventEmitter {
  private items = new Map<string, DownloadItem>();
  private abortControllers = new Map<string, AbortController>();
  private activeCount = 0;
  private pendingTracks: Array<{ downloadId: string; track: TrackInfo; attempt: number }> = [];
  private pausedDownloads = new Set<string>();

  private isExcludedTrack(
    itemId: string,
    trackId: string,
    excluded?: { downloadId?: string; trackId?: string }
  ): boolean {
    if (!excluded?.downloadId || itemId !== excluded.downloadId) return false;
    if (!excluded.trackId) return true;
    return trackId === excluded.trackId;
  }

  private findReusableTrackFile(
    track: Pick<TrackInfo, 'artist' | 'title'>,
    format: AudioFormat,
    excluded?: { downloadId?: string; trackId?: string }
  ): string | null {
    const referenceKey = getTrackReferenceKey(track, format);

    for (const item of this.items.values()) {
      if (item.format !== format) continue;

      for (const candidate of item.tracks) {
        if (this.isExcludedTrack(item.id, candidate.id, excluded)) continue;
        if (getTrackReferenceKey(candidate, item.format) !== referenceKey) continue;
        if (!candidate.filePath || !hasTrackFileForFormat(candidate, item.format)) continue;
        return candidate.filePath;
      }
    }

    return findExistingTrack(track.artist, track.title, format);
  }

  private isTrackReferencedElsewhere(
    track: Pick<TrackInfo, 'artist' | 'title' | 'filePath'>,
    format: AudioFormat,
    excluded?: { downloadId?: string; trackId?: string }
  ): boolean {
    const resolvedPath = track.filePath ? path.resolve(track.filePath) : undefined;
    const referenceKey = getTrackReferenceKey(track, format);

    for (const item of this.items.values()) {
      for (const candidate of item.tracks) {
        if (this.isExcludedTrack(item.id, candidate.id, excluded)) continue;

        if (resolvedPath && candidate.filePath && path.resolve(candidate.filePath) === resolvedPath) {
          return true;
        }

        if (item.format === format && getTrackReferenceKey(candidate, item.format) === referenceKey) {
          return true;
        }
      }
    }

    return false;
  }

  private pruneEmptyLibraryDirs(startDir: string): void {
    const libraryRoot = path.resolve(paths.libraryDir);
    let currentDir = path.resolve(startDir);

    while (currentDir.startsWith(`${libraryRoot}${path.sep}`)) {
      let entries: string[];
      try {
        entries = fs.readdirSync(currentDir);
      } catch {
        return;
      }

      if (entries.length > 0) return;

      try {
        fs.rmdirSync(currentDir);
      } catch {
        return;
      }

      currentDir = path.dirname(currentDir);
    }
  }

  private deleteTrackFileIfUnreferenced(
    track: Pick<TrackInfo, 'id' | 'artist' | 'title' | 'filePath'>,
    format: AudioFormat,
    excluded?: { downloadId?: string; trackId?: string }
  ): void {
    if (!track.filePath) return;

    const filePath = path.resolve(track.filePath);
    if (!fs.existsSync(filePath)) return;

    if (this.isTrackReferencedElsewhere({ ...track, filePath }, format, excluded)) {
      logger.debug(`Keeping shared track file: ${filePath}`);
      return;
    }

    try {
      fs.unlinkSync(filePath);
      this.pruneEmptyLibraryDirs(path.dirname(filePath));
      logger.info(`Deleted unreferenced track file: ${filePath}`);
    } catch (err) {
      logger.warn(`Failed to delete track file ${filePath}`, (err as Error).message);
    }
  }

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
        const wasPaused = item.status === 'paused';
        // Reset any tracks that were mid-download when the process was killed
        for (const track of item.tracks) {
          if (track.status === 'downloading' || track.status === 'converting') {
            track.status = 'queued';
            track.progress = 0;
            track.speed = undefined;
            track.eta = undefined;
          }
        }

        const hasPendingTracks = item.tracks.some((track) => track.status === 'queued');
        item.interrupted = hasPendingTracks && !wasPaused;

        if (hasPendingTracks) {
          item.status = 'paused';
          this.pausedDownloads.add(item.id);
        }

        this.items.set(item.id, item);
      }
      logger.info(`Loaded ${loaded.length} playlist(s) from disk`);
    } catch (err) {
      logger.error('Failed to load playlists from disk', (err as Error).message);
    }
  }

  /** Resume downloads that were interrupted before the app last exited. */
  resumeInterrupted(): number {
    let count = 0;
    for (const item of this.items.values()) {
      if (!item.interrupted) continue;
      count += item.tracks.filter((t) => t.status === 'queued').length;
      if (!this.pausedDownloads.has(item.id)) this.pausedDownloads.add(item.id);
      this.resume(item.id);
    }
    return count;
  }

  async add(
    content: SpotifyContent,
    url: string,
    format: AudioFormat,
    quality: QualityPreset
  ): Promise<DownloadItem> {
    const id = uuidv4();

    const tracks: TrackInfo[] = content.tracks.map((t, i) => ({
      id: uuidv4(),
      index: i,
      title: t.title,
      artist: t.artist,
      album: getTrackAlbumName(t, content.type === 'album' ? content.name : '') || undefined,
      genres: t.genres,
      sourceUrl: t.sourceUrl,
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
      interrupted: false,
      progress: 0,
      totalTracks: tracks.length,
      completedTracks: 0,
      failedTracks: 0,
      sizeOnDiskBytes: 0,
      addedAt: new Date().toISOString(),
      format,
      quality,
      outputDir: '',
    };

    this.items.set(id, item);

    for (const track of item.tracks) {
      const existingFile = this.findReusableTrackFile(track, format, { downloadId: id, trackId: track.id });
      if (!existingFile || !fs.existsSync(existingFile)) continue;

      track.status = 'done';
      track.progress = 100;
      track.filePath = existingFile;
      track.fileSizeBytes = getFileSizeBytes(existingFile);
    }

    this.recalculate(item, false);
    this.emit('download:added', { ...item, tracks: tracks.map((t) => ({ ...t })) });
    savePlaylist(item);
    logger.info(`Added "${content.name}" (${tracks.length} tracks) [${format}/${quality}]`);

    for (const track of tracks) {
      if (track.status !== 'queued') continue;
      this.pendingTracks.push({ downloadId: id, track, attempt: 0 });
    }
    this.drain();

    return item;
  }

  pause(id: string): void {
    const item = this.items.get(id);
    if (!item) return;
    if (item.status === 'done' || item.status === 'error' || item.status === 'paused') return;

    this.pausedDownloads.add(id);

    const controller = this.abortControllers.get(id);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(id);
    }

    this.pendingTracks = this.pendingTracks.filter((p) => p.downloadId !== id);

    for (const track of item.tracks) {
      if (track.status === 'downloading' || track.status === 'converting') {
        track.status = 'queued';
        track.progress = 0;
        track.speed = undefined;
        track.eta = undefined;
      }
    }

    item.status = 'paused';
    item.interrupted = false;
    this.emit('download:updated', { ...item, tracks: item.tracks.map((t) => ({ ...t })) });
    savePlaylist(item);
  }

  resume(id: string): void {
    const item = this.items.get(id);
    if (!item) return;
    if (!this.pausedDownloads.has(id)) return;

    this.pausedDownloads.delete(id);

    const queuedTracks = item.tracks.filter((t) => t.status === 'queued');
    for (const track of queuedTracks) {
      this.pendingTracks.push({ downloadId: id, track, attempt: 0 });
    }

    item.status = 'queued';
    item.interrupted = false;
    this.emit('download:updated', { ...item, tracks: item.tracks.map((t) => ({ ...t })) });
    savePlaylist(item);
    this.drain();
  }

  remove(id: string): void {
    const controller = this.abortControllers.get(id);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(id);
    }
    this.pausedDownloads.delete(id);
    this.pendingTracks = this.pendingTracks.filter((p) => p.downloadId !== id);

    const item = this.items.get(id);
    if (item) {
      for (const track of item.tracks) {
        this.deleteTrackFileIfUnreferenced(track, item.format, { downloadId: id });
      }
      deletePlaylist(item);
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

    this.deleteTrackFileIfUnreferenced(track, item.format, { downloadId, trackId });
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
    this.pausedDownloads.delete(id);
    this.pendingTracks = this.pendingTracks.filter((p) => p.downloadId !== id);

    let queuedTracks = 0;
    for (const track of item.tracks) {
      const reusableFile = hasTrackFileForFormat(track, item.format)
        ? track.filePath
        : this.findReusableTrackFile(track, item.format, { downloadId: id, trackId: track.id });

      if (reusableFile && fs.existsSync(reusableFile)) {
        const fileSizeBytes = getFileSizeBytes(reusableFile);
        track.status = 'done';
        track.progress = 100;
        track.filePath = reusableFile;
        track.fileSizeBytes = fileSizeBytes;
        track.speed = undefined;
        track.eta = undefined;
        track.error = undefined;
        continue;
      }

      track.status = 'queued';
      track.progress = 0;
      track.speed = undefined;
      track.eta = undefined;
      track.error = undefined;
      track.filePath = undefined;
      track.fileSizeBytes = undefined;
      queuedTracks++;
    }

    item.interrupted = false;
    item.totalTracks = item.tracks.length;
    item.completedTracks = item.tracks.filter((track) => track.status === 'done').length;
    item.failedTracks = 0;
    item.progress =
      item.totalTracks > 0
        ? Math.round((item.completedTracks / item.totalTracks) * 100)
        : 0;
    item.sizeOnDiskBytes = calculateSizeOnDiskBytes(item.tracks);
    item.speed = undefined;
    item.status = queuedTracks > 0 ? 'queued' : 'done';
    item.completedAt = queuedTracks > 0 ? undefined : item.completedAt;

    this.emit('download:updated', { ...item, tracks: item.tracks.map((t) => ({ ...t })) });

    for (const track of item.tracks) {
      if (track.status === 'queued') {
        this.pendingTracks.push({ downloadId: id, track, attempt: 0 });
      }
    }
    if (queuedTracks > 0) this.drain();
    savePlaylist(item);
  }

  retryAllFailed(): void {
    for (const item of this.items.values()) {
      const failedTracks = item.tracks.filter((t) => t.status === 'error');
      if (failedTracks.length === 0) continue;

      for (const track of failedTracks) {
        track.status = 'queued';
        track.progress = 0;
        track.error = undefined;
        this.pendingTracks.push({ downloadId: item.id, track, attempt: 0 });
      }

      item.interrupted = false;
      this.recalculate(item);
      savePlaylist(item);
    }
    this.drain();
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

  private recalculate(item: DownloadItem, emit = true): void {
    const isPaused = this.pausedDownloads.has(item.id);
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
    item.sizeOnDiskBytes = calculateSizeOnDiskBytes(item.tracks);
    item.progress =
      totalTracks > 0
        ? Math.min(Math.round(((finished * 100 + activeProgress) / totalTracks)), 100)
        : 0;
    item.speed = item.tracks
      .filter((t) => t.status === 'downloading')
      .reduce((s, t) => s + (t.speed ?? 0), 0);

    if (!isPaused) {
      if (finished === totalTracks && totalTracks > 0) {
        item.status = (failed === totalTracks ? 'error' : 'done') as DownloadStatus;
        item.completedAt = new Date().toISOString();
      } else if (item.tracks.some((t) => t.status === 'downloading' || t.status === 'converting')) {
        item.status = 'active';
      } else if (item.status !== 'queued') {
        item.status = 'active';
      }
    }

    if (emit) {
      this.emit('download:updated', { ...item, tracks: item.tracks.map((t) => ({ ...t })) });
    }
  }

  private drain(): void {
    while (this.activeCount < CONCURRENCY && this.pendingTracks.length > 0) {
      const next = this.pendingTracks[0];
      if (this.pausedDownloads.has(next.downloadId)) {
        this.pendingTracks.shift();
        continue;
      }
      this.pendingTracks.shift();
      this.runTrack(next.downloadId, next.track, next.attempt);
    }
  }

  private async runTrack(downloadId: string, track: TrackInfo, attempt: number): Promise<void> {
    const item = this.items.get(downloadId);
    if (!item) return;

    this.activeCount++;

    if (!this.abortControllers.has(downloadId)) {
      this.abortControllers.set(downloadId, new AbortController());
    }
    const signal = this.abortControllers.get(downloadId)!.signal;

    if (signal.aborted) {
      this.activeCount--;
      this.drain();
      return;
    }

    // --- Dedup: check if this track already exists in the Library ---
    const existing = this.findReusableTrackFile(track, item.format, { downloadId, trackId: track.id });
    if (existing && fs.existsSync(existing)) {
      logger.info(`Dedup hit: "${track.title}" → ${existing}`);
      this.mutateTrack(downloadId, track.id, {
        status: 'done',
        progress: 100,
        filePath: existing,
        fileSizeBytes: getFileSizeBytes(existing),
        speed: undefined,
        eta: undefined,
      });
      this.activeCount--;
      this.drain();
      return;
    }

    this.mutateTrack(downloadId, track.id, {
      status: 'downloading',
      progress: 0,
    });

    try {
      const artistDir = getArtistDir(track.artist);
      const filePath = await downloadTrack(
        { title: track.title, artist: track.artist },
        artistDir,
        item.format,
        item.quality,
        item.coverArt,
        (progress: DownloadProgress) => {
          if (progress.percent >= 99.5) {
            this.mutateTrack(downloadId, track.id, {
              status: 'converting',
              progress: 99,
            });
          } else {
            this.mutateTrack(downloadId, track.id, {
              progress: Math.round(progress.percent),
              speed: progress.speed,
              eta: progress.eta,
            });
          }
        },
        signal,
        track.album ?? (item.type === 'album' ? item.name : undefined),
        track.genres
      );

      const currentItem = this.items.get(downloadId);
      const currentTrack = currentItem?.tracks.find((candidate) => candidate.id === track.id);
      if (!currentTrack) {
        this.deleteTrackFileIfUnreferenced(
          { ...track, filePath },
          item.format,
          { downloadId, trackId: track.id }
        );
        logger.info(`Discarded unreferenced track file after removal: ${filePath}`);
        return;
      }

      this.mutateTrack(downloadId, track.id, {
        status: 'done',
        progress: 100,
        filePath,
        fileSizeBytes: getFileSizeBytes(filePath),
        speed: undefined,
        eta: undefined,
      });
      logger.info(`Done: "${track.title}" → ${filePath}`);
    } catch (err) {
      const msg = (err as Error).message;

      if (msg === 'Cancelled') {
        logger.debug(`Cancelled: "${track.title}"`);
      } else if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS_MS[attempt] ?? 8000;
        logger.warn(
          `Track failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms: "${track.title}"`
        );
        this.mutateTrack(downloadId, track.id, {
          status: 'queued',
          progress: 0,
          error: undefined,
        });
        // Schedule retry after freeing the slot
        setTimeout(() => {
          this.pendingTracks.unshift({ downloadId, track, attempt: attempt + 1 });
          this.drain();
        }, delay);
      } else {
        logger.error(`Track failed after ${MAX_RETRIES + 1} attempts: "${track.title}"`, msg);
        this.mutateTrack(downloadId, track.id, {
          status: 'error',
          error: msg,
        });
      }
    } finally {
      this.activeCount--;
      this.drain();
    }
  }
}

export const queue = new DownloadQueue();
