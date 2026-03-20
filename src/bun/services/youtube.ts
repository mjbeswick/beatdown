import { spawn, type ChildProcess } from 'child_process';
import type { SpotifyContent, SpotifyTrack } from '../../shared/types';
import { logger } from '../logger';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'music.youtube.com',
  'm.youtube.com',
]);

function getString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeArtistName(value: string): string {
  return value.replace(/\s+-\s+Topic$/, '').trim();
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

function pickBestThumbnailUrl(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;

  const thumbnails = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const thumbnail = item as Record<string, unknown>;
      const url = getString(thumbnail['url']);
      if (!url) return null;

      const width = typeof thumbnail['width'] === 'number' ? thumbnail['width'] : 0;
      const height = typeof thumbnail['height'] === 'number' ? thumbnail['height'] : 0;
      return { url, score: width * height };
    })
    .filter((item): item is { url: string; score: number } => item !== null)
    .sort((a, b) => b.score - a.score);

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
        reject(new Error('yt-dlp is required to load YouTube Music playlists'));
        return;
      }
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

export function extractYouTubePlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (!YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) return null;

    const listId = parsed.searchParams.get('list')?.trim();
    return listId || null;
  } catch {
    return null;
  }
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
  const tracks = (Array.isArray(playlist['entries']) ? playlist['entries'] : [])
    .map((entry) => parseYouTubeTrack(entry))
    .filter((entry): entry is SpotifyTrack => entry !== null);

  if (tracks.length === 0) {
    throw new Error('Failed to extract track information from YouTube Music');
  }

  const name = getString(playlist['title']) ?? 'YouTube Music Playlist';
  const coverArt = pickBestThumbnailUrl(playlist['thumbnails']);

  logger.info(`Extracted "${name}": ${tracks.length} track(s) from YouTube Music`);

  return {
    name,
    type: 'playlist',
    coverArt,
    tracks,
  };
}
