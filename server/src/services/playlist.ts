import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  DownloadItem,
  TrackInfo,
  AudioFormat,
  QualityPreset,
  ContentType,
  DownloadStatus,
} from '../types';
import { logger } from '../logger';

export const OUTPUT_BASE = path.join(os.homedir(), 'Music', 'Beatdown');

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || 'Unknown';
}

function escPipe(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function unescPipe(s: string): string {
  return s.replace(/\\\|/g, '|');
}

// Split on unescaped | (i.e., | not preceded by \)
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

export function savePlaylist(item: DownloadItem): void {
  const fileName = sanitize(item.name) + '.m3u';
  const filePath = path.join(item.outputDir, fileName);
  const lines: string[] = [];

  lines.push('#EXTM3U');
  lines.push('');
  lines.push(`#EXTREEL-ID:${item.id}`);
  lines.push(`#EXTREEL-URL:${item.url}`);
  lines.push(`#EXTREEL-TYPE:${item.type}`);
  lines.push(`#EXTREEL-FORMAT:${item.format}`);
  lines.push(`#EXTREEL-QUALITY:${item.quality}`);
  lines.push(`#EXTREEL-ADDED:${item.addedAt}`);
  if (item.coverArt) lines.push(`#EXTREEL-COVER:${item.coverArt}`);
  lines.push('');

  const pending = item.tracks.filter((t) => t.status !== 'done');
  if (pending.length > 0) {
    lines.push('# Pending tracks (index|trackId|artist|title)');
    for (const t of pending) {
      lines.push(
        `#EXTREEL-PENDING:${t.index}|${t.id}|${escPipe(t.artist)}|${escPipe(t.title)}`
      );
    }
    lines.push('');
  }

  const done = item.tracks.filter((t) => t.status === 'done');
  if (done.length > 0) {
    lines.push('# Downloaded tracks');
    for (const t of done) {
      lines.push(
        `#EXTREEL-DONE:${t.index}|${t.id}|${escPipe(t.artist)}|${escPipe(t.title)}`
      );
      lines.push(`#EXTINF:-1,${t.artist} - ${t.title}`);
      lines.push(t.filePath ?? '');
      lines.push('');
    }
  }

  try {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  } catch (err) {
    logger.error(`Failed to save playlist for "${item.name}"`, (err as Error).message);
  }
}

export function deletePlaylist(item: DownloadItem): void {
  const fileName = sanitize(item.name) + '.m3u';
  const filePath = path.join(item.outputDir, fileName);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    logger.error(`Failed to delete playlist for "${item.name}"`, (err as Error).message);
  }
}

export function loadAllPlaylists(): DownloadItem[] {
  const items: DownloadItem[] = [];

  if (!fs.existsSync(OUTPUT_BASE)) return items;

  let subdirs: string[];
  try {
    subdirs = fs
      .readdirSync(OUTPUT_BASE, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(OUTPUT_BASE, d.name));
  } catch {
    return items;
  }

  for (const dir of subdirs) {
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.m3u'));
    } catch {
      continue;
    }

    for (const file of files) {
      const m3uPath = path.join(dir, file);
      try {
        const item = parseM3U(m3uPath, dir);
        if (item) items.push(item);
      } catch (err) {
        logger.warn(`Failed to parse playlist ${m3uPath}`, (err as Error).message);
      }
    }
  }

  return items;
}

function parseM3U(filePath: string, outputDir: string): DownloadItem | null {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  let id = '';
  let url = '';
  let type: ContentType = 'playlist';
  let format: AudioFormat = 'mp3';
  let quality: QualityPreset = 'auto';
  let addedAt = new Date().toISOString();
  let coverArt: string | undefined;

  const pendingEntries: {
    index: number;
    id: string;
    artist: string;
    title: string;
  }[] = [];
  const doneEntries: {
    index: number;
    id: string;
    artist: string;
    title: string;
    filePath: string;
  }[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTREEL-ID:')) {
      id = line.slice('#EXTREEL-ID:'.length);
    } else if (line.startsWith('#EXTREEL-URL:')) {
      url = line.slice('#EXTREEL-URL:'.length);
    } else if (line.startsWith('#EXTREEL-TYPE:')) {
      type = line.slice('#EXTREEL-TYPE:'.length) as ContentType;
    } else if (line.startsWith('#EXTREEL-FORMAT:')) {
      format = line.slice('#EXTREEL-FORMAT:'.length) as AudioFormat;
    } else if (line.startsWith('#EXTREEL-QUALITY:')) {
      quality = line.slice('#EXTREEL-QUALITY:'.length) as QualityPreset;
    } else if (line.startsWith('#EXTREEL-ADDED:')) {
      addedAt = line.slice('#EXTREEL-ADDED:'.length);
    } else if (line.startsWith('#EXTREEL-COVER:')) {
      coverArt = line.slice('#EXTREEL-COVER:'.length);
    } else if (line.startsWith('#EXTREEL-PENDING:')) {
      const rest = line.slice('#EXTREEL-PENDING:'.length);
      const parsed = splitPipeEscaped(rest);
      if (parsed.length >= 4) {
        pendingEntries.push({
          index: parseInt(parsed[0], 10),
          id: parsed[1],
          artist: unescPipe(parsed[2]),
          title: unescPipe(parsed[3]),
        });
      }
    } else if (line.startsWith('#EXTREEL-DONE:')) {
      const rest = line.slice('#EXTREEL-DONE:'.length);
      const parsed = splitPipeEscaped(rest);
      if (parsed.length >= 4) {
        // Look ahead for #EXTINF and path
        let trackFilePath = '';
        let j = i + 1;
        // skip blank lines
        while (j < lines.length && lines[j].trim() === '') j++;
        // expect #EXTINF line
        if (j < lines.length && lines[j].trim().startsWith('#EXTINF')) {
          j++;
          // skip blank lines
          while (j < lines.length && lines[j].trim() === '') j++;
          // expect path line (not a comment)
          if (j < lines.length && !lines[j].trim().startsWith('#')) {
            trackFilePath = lines[j].trim();
            i = j;
          }
        }
        doneEntries.push({
          index: parseInt(parsed[0], 10),
          id: parsed[1],
          artist: unescPipe(parsed[2]),
          title: unescPipe(parsed[3]),
          filePath: trackFilePath,
        });
      }
    }
    i++;
  }

  if (!id || !url) return null;

  const name = path.basename(outputDir);

  const allTracks: TrackInfo[] = [];

  for (const p of pendingEntries) {
    allTracks.push({
      id: p.id,
      index: p.index,
      title: p.title,
      artist: p.artist,
      status: 'queued',
      progress: 0,
    });
  }

  for (const d of doneEntries) {
    const exists = d.filePath ? fs.existsSync(d.filePath) : false;
    allTracks.push({
      id: d.id,
      index: d.index,
      title: d.title,
      artist: d.artist,
      status: exists ? 'done' : 'queued',
      progress: exists ? 100 : 0,
      filePath: exists ? d.filePath : undefined,
    });
  }

  allTracks.sort((a, b) => a.index - b.index);

  const completedTracks = allTracks.filter((t) => t.status === 'done').length;
  const failedTracks = 0;
  const totalTracks = allTracks.length;
  const progress =
    totalTracks > 0 ? Math.round((completedTracks / totalTracks) * 100) : 0;

  let status: DownloadStatus = 'queued';
  if (completedTracks === totalTracks && totalTracks > 0) {
    status = 'done';
  }

  return {
    id,
    url,
    name,
    type,
    coverArt,
    tracks: allTracks,
    status,
    progress,
    totalTracks,
    completedTracks,
    failedTracks,
    addedAt,
    format,
    quality,
    outputDir,
  };
}
