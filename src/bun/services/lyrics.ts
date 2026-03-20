import type { LyricLine } from '../../shared/types';
import { logger } from '../logger';

const BASE = 'https://lrclib.net/api';
const cache = new Map<string, LyricLine[] | null>();

function cacheKey(artist: string, title: string): string {
  return `${artist.toLowerCase()}::${title.toLowerCase()}`;
}

function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const re = /\[(\d+):(\d+\.\d+)\](.+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lrc)) !== null) {
    const time = parseInt(m[1]) * 60 + parseFloat(m[2]);
    const text = m[3].trim();
    if (text) lines.push({ time, text });
  }
  return lines;
}

export async function getLyrics(artist: string, title: string): Promise<LyricLine[] | null> {
  const key = cacheKey(artist, title);
  if (cache.has(key)) return cache.get(key)!;

  try {
    const params = new URLSearchParams({ artist_name: artist, track_name: title });
    const res = await fetch(`${BASE}/get?${params}`, {
      headers: { 'User-Agent': 'Beatdown/1.0 (https://github.com/beatdown)' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      cache.set(key, null);
      return null;
    }

    const data = await res.json() as { syncedLyrics?: string; plainLyrics?: string } | null;
    if (!data) {
      cache.set(key, null);
      return null;
    }

    if (data.syncedLyrics) {
      const lines = parseLrc(data.syncedLyrics);
      cache.set(key, lines);
      return lines;
    }

    if (data.plainLyrics) {
      const lines = data.plainLyrics
        .split('\n')
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text, i) => ({ time: i * 3, text }));
      cache.set(key, lines);
      return lines;
    }

    cache.set(key, null);
    return null;
  } catch (err) {
    logger.warn('lyrics fetch failed', (err as Error).message);
    cache.set(key, null);
    return null;
  }
}
