import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import type {
  DownloadItem,
  TrackInfo,
  AudioFormat,
  QualityPreset,
  ContentType,
  DownloadStatus,
} from '../../shared/types';
import { normalizeTrackGenres } from '../../shared/track-metadata';
import { logger } from '../logger';
import { sanitizeFilename } from './downloader';
import { paths } from './paths';

function escPipe(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function unescPipe(s: string): string {
  return s.replace(/\\\|/g, '|');
}

function splitPipeEscaped(s: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length && s[i + 1] === '|') {
      current += '\\|';
      i++;
    } else if (s[i] === '|') {
      parts.push(current);
      current = '';
    } else {
      current += s[i];
    }
  }
  parts.push(current);
  return parts;
}

function decodeOptionalMetadataField(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = unescPipe(raw).trim();
  return value ? value : undefined;
}

function encodeGenresField(genres?: string[]): string {
  return JSON.stringify(genres ?? []);
}

function decodeGenresField(raw: string | undefined): string[] | undefined {
  const value = decodeOptionalMetadataField(raw);
  if (!value) return undefined;

  try {
    return normalizeTrackGenres(JSON.parse(value));
  } catch {
    return normalizeTrackGenres(value.split(/[;,]/));
  }
}

function encodeDurationField(durationSeconds?: number): string {
  return typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? String(Math.round(durationSeconds))
    : '';
}

function decodeDurationField(raw: string | undefined): number | undefined {
  const value = decodeOptionalMetadataField(raw);
  if (!value) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function encodeExtInfDuration(durationSeconds?: number): string {
  return typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? String(Math.round(durationSeconds))
    : '-1';
}

/** Make a relative path from a Playlists/ .m3u to a Library/ audio file. */
function toRelativePath(filePath: string): string {
  return path.relative(paths.playlistsDir, filePath);
}

/** Resolve a relative path stored in .m3u back to absolute. */
function toAbsolutePath(stored: string, m3uPath: string): string {
  if (path.isAbsolute(stored)) return stored;
  return path.resolve(path.dirname(m3uPath), stored);
}

function getFileSizeBytes(filePath: string): number | undefined {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile() ? stats.size : undefined;
  } catch {
    return undefined;
  }
}

export function calculateSizeOnDiskBytes(
  tracks: Array<Pick<TrackInfo, 'status' | 'filePath' | 'fileSizeBytes'>>
): number {
  const seenPaths = new Set<string>();
  let total = 0;

  for (const track of tracks) {
    if (track.status !== 'done' || !track.filePath) continue;

    const resolvedPath = path.resolve(track.filePath);
    if (seenPaths.has(resolvedPath)) continue;

    seenPaths.add(resolvedPath);

    if (typeof track.fileSizeBytes === 'number' && Number.isFinite(track.fileSizeBytes)) {
      total += track.fileSizeBytes;
    }
  }

  return total;
}

export function savePlaylist(item: DownloadItem): void {
  fs.mkdirSync(paths.playlistsDir, { recursive: true });
  const fileName = sanitizeFilename(item.name) + '.m3u';
  const filePath = path.join(paths.playlistsDir, fileName);
  const lines: string[] = [];

  lines.push('#EXTM3U');
  lines.push('');
  lines.push(`#EXTREEL-ID:${item.id}`);
  lines.push(`#EXTREEL-NAME:${item.name}`);
  lines.push(`#EXTREEL-URL:${item.url}`);
  lines.push(`#EXTREEL-TYPE:${item.type}`);
  lines.push(`#EXTREEL-STATUS:${item.status}`);
  lines.push(`#EXTREEL-FORMAT:${item.format}`);
  lines.push(`#EXTREEL-QUALITY:${item.quality}`);
  lines.push(`#EXTREEL-ADDED:${item.addedAt}`);
  if (item.coverArt) lines.push(`#EXTREEL-COVER:${item.coverArt}`);
  lines.push('');

  const pending = item.tracks.filter((t) => t.status !== 'done');
  if (pending.length > 0) {
    lines.push('# Pending tracks (index|trackId|artist|title|album|genresJson|sourceUrl|durationSeconds)');
    for (const t of pending) {
      lines.push(
        `#EXTREEL-PENDING:${t.index}|${t.id}|${escPipe(t.artist)}|${escPipe(t.title)}|${escPipe(t.album ?? '')}|${escPipe(encodeGenresField(t.genres))}|${escPipe(t.sourceUrl ?? '')}|${encodeDurationField(t.durationSeconds)}`
      );
    }
    lines.push('');
  }

  const done = item.tracks.filter((t) => t.status === 'done');
  if (done.length > 0) {
    lines.push('# Downloaded tracks');
    for (const t of done) {
      lines.push(
        `#EXTREEL-DONE:${t.index}|${t.id}|${escPipe(t.artist)}|${escPipe(t.title)}|${escPipe(t.album ?? '')}|${escPipe(encodeGenresField(t.genres))}|${escPipe(t.sourceUrl ?? '')}|${encodeDurationField(t.durationSeconds)}`
      );
      lines.push(`#EXTINF:${encodeExtInfDuration(t.durationSeconds)},${t.artist} - ${t.title}`);
      lines.push(t.filePath ? toRelativePath(t.filePath) : '');
      lines.push('');
    }
  }

  try {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  } catch (err) {
    logger.error(`Failed to save playlist for "${item.name}"`, (err as Error).message);
  }
}

export async function downloadPlaylistCoverArt(item: DownloadItem): Promise<void> {
  if (!item.coverArt?.startsWith('http')) return;
  fs.mkdirSync(paths.playlistsDir, { recursive: true });
  const dest = path.join(paths.playlistsDir, sanitizeFilename(item.name) + '.jpg');
  try {
    const res = await axios.get(item.coverArt, { responseType: 'arraybuffer', timeout: 10000 });
    fs.writeFileSync(dest, Buffer.from(res.data as ArrayBuffer));
    item.coverArt = dest;
  } catch (err) {
    logger.warn(`Failed to download cover art for "${item.name}"`, (err as Error).message);
  }
}

function findPlaylistFilePath(item: Pick<DownloadItem, 'id' | 'name' | 'url'>): string | null {
  const byName = path.join(paths.playlistsDir, `${sanitizeFilename(item.name)}.m3u`);
  if (fs.existsSync(byName)) return byName;

  let files: string[];
  try {
    files = fs.readdirSync(paths.playlistsDir).filter((file) => file.endsWith('.m3u'));
  } catch {
    return null;
  }

  for (const file of files) {
    const filePath = path.join(paths.playlistsDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes(`#EXTREEL-ID:${item.id}`) || content.includes(`#EXTREEL-URL:${item.url}`)) {
        return filePath;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function deletePlaylist(item: DownloadItem): void {
  const filePath = findPlaylistFilePath(item);
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    logger.error(`Failed to delete playlist for "${item.name}"`, (err as Error).message);
  }
}

export function loadAllPlaylists(): DownloadItem[] {
  const items: DownloadItem[] = [];

  if (!fs.existsSync(paths.playlistsDir)) return items;

  let files: string[];
  try {
    files = fs.readdirSync(paths.playlistsDir).filter((f) => f.endsWith('.m3u'));
  } catch {
    return items;
  }

  for (const file of files) {
    const m3uPath = path.join(paths.playlistsDir, file);
    try {
      const item = parseM3U(m3uPath);
      if (item) items.push(item);
    } catch (err) {
      logger.warn(`Failed to parse playlist ${m3uPath}`, (err as Error).message);
    }
  }

  return items;
}

function parseM3U(filePath: string): DownloadItem | null {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  let id = '';
  let storedName: string | undefined;
  let url = '';
  let type: ContentType = 'playlist';
  let status: DownloadStatus = 'queued';
  let format: AudioFormat = 'mp3';
  let quality: QualityPreset = 'auto';
  let addedAt = new Date().toISOString();
  let coverArt: string | undefined;

  const pendingEntries: {
    index: number;
    id: string;
    artist: string;
    title: string;
    album?: string;
    genres?: string[];
    sourceUrl?: string;
    durationSeconds?: number;
  }[] = [];
  const doneEntries: {
    index: number;
    id: string;
    artist: string;
    title: string;
    album?: string;
    genres?: string[];
    sourceUrl?: string;
    durationSeconds?: number;
    filePath: string;
  }[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTREEL-ID:')) id = line.slice('#EXTREEL-ID:'.length);
    else if (line.startsWith('#EXTREEL-NAME:')) storedName = line.slice('#EXTREEL-NAME:'.length);
    else if (line.startsWith('#EXTREEL-URL:')) url = line.slice('#EXTREEL-URL:'.length);
    else if (line.startsWith('#EXTREEL-TYPE:')) type = line.slice('#EXTREEL-TYPE:'.length) as ContentType;
    else if (line.startsWith('#EXTREEL-STATUS:')) status = line.slice('#EXTREEL-STATUS:'.length) as DownloadStatus;
    else if (line.startsWith('#EXTREEL-FORMAT:')) format = line.slice('#EXTREEL-FORMAT:'.length) as AudioFormat;
    else if (line.startsWith('#EXTREEL-QUALITY:')) quality = line.slice('#EXTREEL-QUALITY:'.length) as QualityPreset;
    else if (line.startsWith('#EXTREEL-ADDED:')) addedAt = line.slice('#EXTREEL-ADDED:'.length);
    else if (line.startsWith('#EXTREEL-COVER:')) coverArt = line.slice('#EXTREEL-COVER:'.length);
    else if (line.startsWith('#EXTREEL-PENDING:')) {
      const parsed = splitPipeEscaped(line.slice('#EXTREEL-PENDING:'.length));
      if (parsed.length >= 4) {
        pendingEntries.push({
          index: parseInt(parsed[0], 10),
          id: parsed[1],
          artist: unescPipe(parsed[2]),
          title: unescPipe(parsed[3]),
          album: decodeOptionalMetadataField(parsed[4]),
          genres: decodeGenresField(parsed[5]),
          sourceUrl: decodeOptionalMetadataField(parsed[6]),
          durationSeconds: decodeDurationField(parsed[7]),
        });
      }
    } else if (line.startsWith('#EXTREEL-DONE:')) {
      const parsed = splitPipeEscaped(line.slice('#EXTREEL-DONE:'.length));
      if (parsed.length >= 4) {
        let trackFilePath = '';
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length && lines[j].trim().startsWith('#EXTINF')) {
          j++;
          while (j < lines.length && lines[j].trim() === '') j++;
          if (j < lines.length && !lines[j].trim().startsWith('#')) {
            trackFilePath = toAbsolutePath(lines[j].trim(), filePath);
            i = j;
          }
        }
        doneEntries.push({
          index: parseInt(parsed[0], 10),
          id: parsed[1],
          artist: unescPipe(parsed[2]),
          title: unescPipe(parsed[3]),
          album: decodeOptionalMetadataField(parsed[4]),
          genres: decodeGenresField(parsed[5]),
          sourceUrl: decodeOptionalMetadataField(parsed[6]),
          durationSeconds: decodeDurationField(parsed[7]),
          filePath: trackFilePath,
        });
      }
    }
    i++;
  }

  if (!id || !url) return null;

  const name = storedName?.trim() || path.basename(filePath, '.m3u');

  // outputDir is the Library dir (for backward compat), but files are under Library/{Artist}/
  const outputDir = paths.libraryDir;

  const allTracks: TrackInfo[] = [];

  for (const p of pendingEntries) {
    allTracks.push({
      id: p.id,
      index: p.index,
      title: p.title,
      artist: p.artist,
      album: p.album ?? (type === 'album' ? name : undefined),
      durationSeconds: p.durationSeconds,
      genres: p.genres,
      sourceUrl: p.sourceUrl,
      status: 'queued',
      progress: 0,
    });
  }

  for (const d of doneEntries) {
    const exists = d.filePath ? fs.existsSync(d.filePath) : false;
    const fileSizeBytes = exists ? getFileSizeBytes(d.filePath) : undefined;
    allTracks.push({
      id: d.id,
      index: d.index,
      title: d.title,
      artist: d.artist,
      album: d.album ?? (type === 'album' ? name : undefined),
      durationSeconds: d.durationSeconds,
      genres: d.genres,
      sourceUrl: d.sourceUrl,
      status: exists ? 'done' : 'queued',
      progress: exists ? 100 : 0,
      filePath: exists ? d.filePath : undefined,
      fileSizeBytes,
    });
  }

  allTracks.sort((a, b) => a.index - b.index);

  const completedTracks = allTracks.filter((t) => t.status === 'done').length;
  const totalTracks = allTracks.length;
  const progress = totalTracks > 0 ? Math.round((completedTracks / totalTracks) * 100) : 0;
  const sizeOnDiskBytes = calculateSizeOnDiskBytes(allTracks);

  const resolvedStatus: DownloadStatus =
    completedTracks === totalTracks && totalTracks > 0
      ? 'done'
      : status === 'paused'
        ? 'paused'
        : 'queued';

  return {
    id,
    url,
    name,
    type,
    coverArt,
    tracks: allTracks,
    status: resolvedStatus,
    progress,
    totalTracks,
    completedTracks,
    failedTracks: 0,
    sizeOnDiskBytes,
    addedAt,
    format,
    quality,
    outputDir,
  };
}
