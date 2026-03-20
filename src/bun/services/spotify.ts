import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ContentType, SpotifyContent, SpotifyTrack } from '../../shared/types';
import { logger } from '../logger';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SEO_USER_AGENT = 'Mozilla/5.0';

const http = axios.create({
  headers: {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  },
  timeout: 15000,
});

const fullPageHttp = axios.create({
  headers: {
    'User-Agent': SEO_USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  },
  timeout: 15000,
});

export function validateUrl(url: string): boolean {
  return /open\.spotify\.com\/(track|album|playlist)\/[a-zA-Z0-9]+/.test(url);
}

export function extractSpotifyId(url: string): { type: ContentType; id: string } | null {
  const match = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
  if (!match) return null;
  return { type: match[1] as ContentType, id: match[2] };
}

type ExtractedSpotifyTrack = SpotifyTrack & {
  spotifyId?: string;
};

interface ExtractedSpotifyContent {
  name: string;
  type: ContentType;
  tracks: ExtractedSpotifyTrack[];
}

function extractSpotifyTrackId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/(?:spotify:track:|\/track\/)([a-zA-Z0-9]+)/);
  return match?.[1];
}

function getAlbumName(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const album = value as Record<string, unknown>;
  const albumName = album['name'];
  if (typeof albumName !== 'string') return undefined;

  const trimmed = albumName.trim();
  return trimmed || undefined;
}

function getTrackAlbumNameFromRecord(record: Record<string, unknown>): string | undefined {
  return getAlbumName(record['album']) ?? getAlbumName(record['albumOfTrack']);
}

function decodeFullPageInitialState(html: string): unknown | null {
  const match = html.match(/<script id="initialState" type="text\/plain">([\s\S]*?)<\/script>/);
  if (!match?.[1]) return null;

  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function collectAlbumNamesByTrackId(
  value: unknown,
  albumNamesByTrackId: Map<string, string> = new Map()
): Map<string, string> {
  if (!value || typeof value !== 'object') return albumNamesByTrackId;

  if (Array.isArray(value)) {
    for (const item of value) collectAlbumNamesByTrackId(item, albumNamesByTrackId);
    return albumNamesByTrackId;
  }

  const record = value as Record<string, unknown>;
  const trackId = extractSpotifyTrackId(record['uri']) ?? (typeof record['id'] === 'string' ? record['id'] : undefined);
  const albumName = getTrackAlbumNameFromRecord(record);
  if (trackId && albumName) albumNamesByTrackId.set(trackId, albumName);

  for (const nested of Object.values(record)) {
    collectAlbumNamesByTrackId(nested, albumNamesByTrackId);
  }

  return albumNamesByTrackId;
}

function hydrateTrackAlbums(
  tracks: ExtractedSpotifyTrack[],
  albumNamesByTrackId: ReadonlyMap<string, string>
): ExtractedSpotifyTrack[] {
  let hydratedCount = 0;

  const hydratedTracks = tracks.map((track) => {
    if (track.album || !track.spotifyId) return track;

    const album = albumNamesByTrackId.get(track.spotifyId);
    if (!album) return track;

    hydratedCount += 1;
    return { ...track, album };
  });

  if (hydratedCount > 0) {
    logger.debug(`Hydrated album data for ${hydratedCount} track(s) from full page state`);
  }

  return hydratedTracks;
}

function extractTracksFromJson(obj: unknown, tracks: ExtractedSpotifyTrack[] = []): ExtractedSpotifyTrack[] {
  if (!obj || typeof obj !== 'object') return tracks;
  const o = obj as Record<string, unknown>;

  if (o['type'] === 'track' && typeof o['name'] === 'string') {
    const artists = o['artists'] as Array<{ name: string }> | undefined;
    if (artists?.length) {
      tracks.push({
        title: o['name'] as string,
        artist: artists.map((a) => a.name).join(', '),
        album: getTrackAlbumNameFromRecord(o),
        spotifyId: extractSpotifyTrackId(o['uri']) ?? (typeof o['id'] === 'string' ? o['id'] : undefined),
      });
      return tracks;
    }
  }

  if (Array.isArray(o['trackList'])) {
    for (const item of o['trackList'] as Array<Record<string, unknown>>) {
      if (typeof item['title'] === 'string' && typeof item['subtitle'] === 'string') {
        tracks.push({
          title: item['title'] as string,
          artist: (item['subtitle'] as string).replace(/\u00a0/g, ' '),
          album: getTrackAlbumNameFromRecord(item),
          spotifyId: extractSpotifyTrackId(item['uri']),
        });
      }
    }
    if (tracks.length > 0) return tracks;
  }

  if (Array.isArray(o['items'])) {
    for (const item of o['items']) extractTracksFromJson(item, tracks);
  }
  if (o['track'] && typeof o['track'] === 'object') extractTracksFromJson(o['track'], tracks);

  for (const key of ['props', 'pageProps', 'state', 'tracks', 'album', 'data', 'content', 'entity', 'playlistV2']) {
    if (o[key] && typeof o[key] === 'object') extractTracksFromJson(o[key], tracks);
  }
  return tracks;
}

function enhancedRegexExtract(html: string): ExtractedSpotifyTrack[] {
  const tracks: ExtractedSpotifyTrack[] = [];
  const pattern = /"name":"([^"]+)","artists":\[{"name":"([^"]+)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    tracks.push({ title: match[1], artist: match[2] });
  }
  if (tracks.length > 0) return tracks;

  const trackNames = [...html.matchAll(/"trackName":"([^"]+)"/g)].map((m) => m[1]);
  const artistNames = [...html.matchAll(/"artistName":"([^"]+)"/g)].map((m) => m[1]);
  for (let i = 0; i < Math.min(trackNames.length, artistNames.length); i++) {
    tracks.push({ title: trackNames[i], artist: artistNames[i] });
  }
  return tracks;
}

async function tryOembed(url: string): Promise<{ name?: string; coverArt?: string }> {
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await http.get(oembedUrl);
    logger.debug('oEmbed succeeded', { name: res.data.title });
    return { name: res.data.title, coverArt: res.data.thumbnail_url };
  } catch (err) {
    logger.warn('oEmbed failed', (err as Error).message);
    return {};
  }
}

async function tryEmbedPage(
  type: ContentType,
  id: string
): Promise<ExtractedSpotifyContent | null> {
  try {
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
    const res = await http.get(embedUrl);
    const html: string = res.data;

    const $ = cheerio.load(html);
    let tracks: ExtractedSpotifyTrack[] = [];

    $('script').each((_, el) => {
      const src = $(el).html() || '';
      if (src.includes('__NEXT_DATA__') || src.includes('trackList') || src.includes('"tracks"')) {
        try {
          const jsonMatch = src.match(/^\s*({.+})\s*$/s) || src.match(/=\s*({.+})\s*;?\s*$/s);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[1]);
            const extracted = extractTracksFromJson(parsed);
            if (extracted.length > 0) tracks = extracted;
          }
        } catch {}
      }
    });

    if (tracks.length === 0) tracks = enhancedRegexExtract(html);
    if (tracks.length === 0) return null;

    const title = $('title').text().split(' | ')[0] || $('meta[property="og:title"]').attr('content') || id;

    return {
      name: title,
      type,
      tracks,
    };
  } catch (err) {
    logger.warn('Embed page failed', (err as Error).message);
    return null;
  }
}

async function tryFullPageAlbumData(
  type: ContentType,
  id: string
): Promise<ReadonlyMap<string, string>> {
  try {
    const fullPageUrl = `https://open.spotify.com/${type}/${id}`;
    const res = await fullPageHttp.get(fullPageUrl);
    const state = decodeFullPageInitialState(res.data as string);
    if (!state) return new Map();

    const albumNamesByTrackId = collectAlbumNamesByTrackId(state);
    logger.debug(`Full page state extracted album data for ${albumNamesByTrackId.size} track(s)`);
    return albumNamesByTrackId;
  } catch (err) {
    logger.warn('Full page fetch failed', (err as Error).message);
    return new Map();
  }
}

export async function getSpotifyContent(url: string): Promise<SpotifyContent> {
  const parsed = extractSpotifyId(url);
  if (!parsed) throw new Error('Invalid Spotify URL');

  const { type, id } = parsed;

  const [oembedData, embedContent, fullPageAlbumData] = await Promise.all([
    tryOembed(url),
    tryEmbedPage(type, id),
    tryFullPageAlbumData(type, id),
  ]);

  if (!embedContent || embedContent.tracks.length === 0) {
    throw new Error('Failed to extract track information from Spotify');
  }

  const name = oembedData.name || embedContent.name;
  const coverArt = oembedData.coverArt;
  const tracks = hydrateTrackAlbums(embedContent.tracks, fullPageAlbumData).map(({ spotifyId: _spotifyId, ...track }) => track);

  logger.info(`Extracted "${name}": ${embedContent.tracks.length} track(s)`);

  return {
    name,
    type,
    coverArt,
    tracks,
  };
}
