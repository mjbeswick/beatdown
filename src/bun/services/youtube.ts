import { spawn, type ChildProcess } from 'child_process';
import type { SpotifyContent, SpotifyTrack } from '../../shared/types';
import { extractYouTubePlaylistId as extractSharedYouTubePlaylistId } from '../../shared/content-source';
import { logger } from '../logger';

function getString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeArtistName(value: string): string {
  return value.replace(/\s+-\s+Topic$/, '').trim();
}

function normalizeDurationSeconds(value: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(1, Math.round(value));
}

function parseDurationSeconds(value: unknown): number | undefined {
  if (typeof value === 'number') return normalizeDurationSeconds(value);
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) {
    return normalizeDurationSeconds(Number.parseInt(trimmed, 10));
  }

  const parts = trimmed.split(':').map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) return undefined;

  if (parts.length === 2) {
    return normalizeDurationSeconds(parts[0] * 60 + parts[1]);
  }

  if (parts.length === 3) {
    return normalizeDurationSeconds(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  return undefined;
}

function extractYouTubeVideoUrl(entry: Record<string, unknown>): string | undefined {
  const id = getString(entry['id']);
  if (id) return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

  const rawUrl = getString(entry['webpage_url']) ?? getString(entry['url']);
  if (!rawUrl) return undefined;

  try {
    const parsed = new URL(rawUrl, 'https://www.youtube.com');
    const videoId = parsed.searchParams.get('v')?.trim();
    if (videoId) return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  } catch {}

  return rawUrl;
}

interface ThumbnailCandidate {
  url: string;
  score: number;
}

function collectThumbnailCandidates(...sources: unknown[]): ThumbnailCandidate[] {
  const candidates = new Map<string, ThumbnailCandidate>();

  for (const source of sources) {
    if (typeof source === 'string') {
      const url = getString(source);
      if (url && !candidates.has(url)) candidates.set(url, { url, score: 0 });
      continue;
    }

    if (!Array.isArray(source)) continue;

    for (const item of source) {
      if (!item || typeof item !== 'object') continue;
      const thumbnail = item as Record<string, unknown>;
      const url = getString(thumbnail['url']) ?? getString(thumbnail['thumbnail']);
      if (!url) continue;

      const width = typeof thumbnail['width'] === 'number' ? thumbnail['width'] : 0;
      const height = typeof thumbnail['height'] === 'number' ? thumbnail['height'] : 0;
      const score = width * height;
      const existing = candidates.get(url);

      if (!existing || existing.score < score) {
        candidates.set(url, { url, score });
      }
    }
  }

  return [...candidates.values()].sort((a, b) => b.score - a.score);
}

async function canLoadThumbnail(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });

    if (response.ok) return true;
    if (response.status !== 403 && response.status !== 405) return false;

    const fallback = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      redirect: 'follow',
      signal: controller.signal,
    });

    return fallback.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function pickBestThumbnailUrl(...sources: unknown[]): Promise<string | undefined> {
  const thumbnails = collectThumbnailCandidates(...sources);
  if (thumbnails.length === 0) return undefined;

  for (const thumbnail of thumbnails) {
    if (await canLoadThumbnail(thumbnail.url)) return thumbnail.url;
  }

  return thumbnails[0]?.url;
}

function parseYouTubeTrack(entry: unknown): SpotifyTrack | null {
  if (!entry || typeof entry !== 'object') return null;

  const record = entry as Record<string, unknown>;
  const title = getString(record['title']);
  if (!title) return null;

  const rawArtist =
    getString(record['artist']) ??
    getString(record['channel']) ??
    getString(record['uploader']) ??
    'Unknown Artist';

  const artist = normalizeArtistName(rawArtist) || 'Unknown Artist';

  return {
    title,
    artist,
    album: getString(record['album']),
    durationSeconds:
      parseDurationSeconds(record['duration']) ??
      parseDurationSeconds(record['duration_string']) ??
      parseDurationSeconds(record['length_seconds']),
    sourceUrl: extractYouTubeVideoUrl(record),
  };
}

function readYtDlpJson(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn('yt-dlp', [
      '--dump-single-json',
      '--flat-playlist',
      '--no-warnings',
      url,
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout?.setEncoding('utf8');
    proc.stderr?.setEncoding('utf8');

    proc.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });

    proc.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const detail = stderr.trim().split('\n').pop() || stdout.trim().split('\n').pop() || `yt-dlp exited ${code}`;
        reject(new Error(detail));
        return;
      }

      const json = stdout.trim();
      if (!json) {
        reject(new Error('yt-dlp returned no playlist data'));
        return;
      }

      try {
        const parsed = JSON.parse(json);
        if (!parsed || typeof parsed !== 'object') {
          reject(new Error('yt-dlp returned invalid playlist data'));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch (err) {
        reject(new Error(`Failed to parse yt-dlp playlist data: ${(err as Error).message}`));
      }
    });

    proc.on('error', (err) => {
      const spawnError = err as NodeJS.ErrnoException;
      if (spawnError.code === 'ENOENT') {
        reject(new Error('yt-dlp not found — install with: brew install yt-dlp'));
        return;
      }
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

export function extractYouTubePlaylistId(url: string): string | null {
  return extractSharedYouTubePlaylistId(url);
}

export function isYouTubePlaylistUrl(url: string): boolean {
  return extractYouTubePlaylistId(url) !== null;
}

export function toCanonicalYouTubePlaylistUrl(url: string): string | null {
  const listId = extractYouTubePlaylistId(url);
  return listId ? `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}` : null;
}

export async function getYouTubePlaylistContent(url: string): Promise<SpotifyContent> {
  const canonicalUrl = toCanonicalYouTubePlaylistUrl(url);
  if (!canonicalUrl) throw new Error('Invalid YouTube Music playlist URL');

  const playlist = await readYtDlpJson(canonicalUrl);
  const entries = Array.isArray(playlist['entries']) ? playlist['entries'] : [];
  const tracks = entries
    .map((entry) => parseYouTubeTrack(entry))
    .filter((entry): entry is SpotifyTrack => entry !== null);

  if (tracks.length === 0) {
    throw new Error('Failed to extract track information from YouTube Music');
  }

  const name = getString(playlist['title']) ?? 'YouTube Music Playlist';
  const entryThumbnailSources = entries
    .slice(0, 4)
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const record = entry as Record<string, unknown>;
      return [record['thumbnails'], record['thumbnail']];
    });
  const coverArt = await pickBestThumbnailUrl(
    playlist['thumbnails'],
    playlist['playlist_thumbnails'],
    playlist['thumbnail'],
    ...entryThumbnailSources
  );

  logger.info(`Extracted "${name}": ${tracks.length} track(s) from YouTube Music`);

  return {
    name,
    type: 'playlist',
    coverArt,
    tracks,
  };
}
