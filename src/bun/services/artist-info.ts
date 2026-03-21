import type { ArtistInfo } from '../../shared/types';
import { logger } from '../logger';

const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2';
const MUSICBRAINZ_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Beatdown/1.0 (desktop app)',
};
const WIKIPEDIA_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Beatdown/1.0 (desktop app)',
};
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

type MusicBrainzSearchArtist = {
  id: string;
  name: string;
  score?: string;
  disambiguation?: string;
};

type MusicBrainzTag = {
  name?: string;
  count?: number;
};

type MusicBrainzRelation = {
  type?: string;
  url?: {
    resource?: string;
  };
};

type MusicBrainzArtistDetail = {
  id: string;
  name: string;
  type?: string;
  disambiguation?: string;
  country?: string;
  area?: {
    name?: string;
  };
  'life-span'?: {
    begin?: string;
    end?: string;
    ended?: boolean;
  };
  tags?: MusicBrainzTag[];
  relations?: MusicBrainzRelation[];
};

type WikidataEntityResponse = {
  entities?: Record<string, {
    sitelinks?: {
      enwiki?: {
        title?: string;
      };
    };
    claims?: {
      P18?: Array<{
        mainsnak?: {
          datavalue?: {
            value?: string;
          };
        };
      }>;
    };
  }>;
};

type WikipediaSummary = {
  extract?: string;
  thumbnail?: {
    source?: string;
  };
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
};

type CacheEntry = {
  value: ArtistInfo | null;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

function normalizeArtistName(value: string): string {
  return value.trim().toLowerCase();
}

function getBestArtistMatch(name: string, artists: MusicBrainzSearchArtist[]): MusicBrainzSearchArtist | null {
  if (artists.length === 0) return null;

  const normalizedTarget = normalizeArtistName(name);
  const exactMatch = artists.find((artist) => normalizeArtistName(artist.name) === normalizedTarget);
  if (exactMatch) return exactMatch;

  return [...artists].sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0))[0] ?? null;
}

function formatActiveYears(lifeSpan?: MusicBrainzArtistDetail['life-span']): string | undefined {
  if (!lifeSpan) return undefined;

  const startYear = lifeSpan.begin?.slice(0, 4);
  const endYear = lifeSpan.end?.slice(0, 4);
  if (startYear && endYear) return `${startYear}-${endYear}`;
  if (startYear && lifeSpan.ended) return `${startYear}-`;
  if (startYear) return `${startYear}-present`;
  return undefined;
}

function trimSummary(summary?: string): string | undefined {
  if (!summary) return undefined;

  const normalized = summary.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function getTopTags(tags?: MusicBrainzTag[]): string[] {
  if (!tags?.length) return [];

  return [...tags]
    .sort((left, right) => (right.count ?? 0) - (left.count ?? 0))
    .map((tag) => tag.name?.trim())
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 4);
}

function getWikipediaUrl(relations?: MusicBrainzRelation[]): string | undefined {
  const relation = relations?.find((item) => item.type === 'wikipedia' && item.url?.resource);
  return relation?.url?.resource;
}

function getWikidataUrl(relations?: MusicBrainzRelation[]): string | undefined {
  const relation = relations?.find((item) => item.type === 'wikidata' && item.url?.resource);
  return relation?.url?.resource;
}

function getCachedValue(key: string): ArtistInfo | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt > Date.now()) return entry.value;

  cache.delete(key);
  return undefined;
}

function setCachedValue(key: string, value: ArtistInfo | null): ArtistInfo | null {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return value;
}

function wikidataEntityDataUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const entityId = parsed.pathname.split('/').filter(Boolean).pop();
    if (!entityId) return null;
    return `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(entityId)}.json`;
  } catch {
    return null;
  }
}

function wikipediaUrlFromTitle(title?: string): string | undefined {
  if (!title) return undefined;
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

function commonsImageUrl(fileName?: string): string | undefined {
  if (!fileName) return undefined;
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(fileName.replace(/ /g, '_'))}`;
}

function wikipediaSummaryUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const title = parsed.pathname.split('/').filter(Boolean).pop();
    if (!title) return null;
    return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(decodeURIComponent(title))}`;
  } catch {
    return null;
  }
}

async function searchArtist(name: string): Promise<MusicBrainzSearchArtist | null> {
  const params = new URLSearchParams({
    query: `artist:${name}`,
    fmt: 'json',
    limit: '5',
  });
  const response = await fetch(`${MUSICBRAINZ_BASE}/artist?${params}`, {
    headers: MUSICBRAINZ_HEADERS,
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return null;

  const payload = await response.json() as { artists?: MusicBrainzSearchArtist[] };
  return getBestArtistMatch(name, payload.artists ?? []);
}

async function fetchArtistDetail(mbid: string): Promise<MusicBrainzArtistDetail | null> {
  const params = new URLSearchParams({
    fmt: 'json',
    inc: 'url-rels+tags',
  });
  const response = await fetch(`${MUSICBRAINZ_BASE}/artist/${mbid}?${params}`, {
    headers: MUSICBRAINZ_HEADERS,
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return null;
  return await response.json() as MusicBrainzArtistDetail;
}

async function fetchWikipediaSummary(rawUrl?: string): Promise<WikipediaSummary | null> {
  if (!rawUrl) return null;

  const summaryUrl = wikipediaSummaryUrl(rawUrl);
  if (!summaryUrl) return null;

  const response = await fetch(summaryUrl, {
    headers: WIKIPEDIA_HEADERS,
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return null;
  return await response.json() as WikipediaSummary;
}

async function fetchWikidataProfile(rawUrl?: string): Promise<{ wikipediaUrl?: string; imageUrl?: string }> {
  if (!rawUrl) return {};

  const entityDataUrl = wikidataEntityDataUrl(rawUrl);
  if (!entityDataUrl) return {};

  const response = await fetch(entityDataUrl, {
    headers: WIKIPEDIA_HEADERS,
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return {};

  const payload = await response.json() as WikidataEntityResponse;
  const entity = Object.values(payload.entities ?? {})[0];
  if (!entity) return {};

  const wikiTitle = entity.sitelinks?.enwiki?.title;
  const imageName = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;

  return {
    wikipediaUrl: wikipediaUrlFromTitle(wikiTitle),
    imageUrl: commonsImageUrl(imageName),
  };
}

export async function getArtistInfo(artistName: string, options?: { forceRefresh?: boolean }): Promise<ArtistInfo | null> {
  const key = normalizeArtistName(artistName);
  if (!key) return null;

  if (options?.forceRefresh) cache.delete(key);

  const cachedValue = getCachedValue(key);
  if (cachedValue !== undefined) return cachedValue;

  try {
    const searchMatch = await searchArtist(artistName);
    if (!searchMatch) {
      return setCachedValue(key, null);
    }

    const detail = await fetchArtistDetail(searchMatch.id);
    if (!detail) {
      return setCachedValue(key, null);
    }

    const wikidataProfile = await fetchWikidataProfile(getWikidataUrl(detail.relations));
    const wikipediaUrl = getWikipediaUrl(detail.relations) ?? wikidataProfile.wikipediaUrl;
    const wikipediaSummary = await fetchWikipediaSummary(wikipediaUrl);
    const summary = trimSummary(wikipediaSummary?.extract) ?? trimSummary(detail.disambiguation);

    const info: ArtistInfo = {
      name: detail.name,
      summary,
      imageUrl: wikipediaSummary?.thumbnail?.source ?? wikidataProfile.imageUrl,
      tags: getTopTags(detail.tags),
      area: detail.area?.name ?? detail.country,
      type: detail.type,
      activeYears: formatActiveYears(detail['life-span']),
      wikipediaUrl: wikipediaSummary?.content_urls?.desktop?.page ?? wikipediaUrl,
      musicBrainzUrl: `https://musicbrainz.org/artist/${detail.id}`,
    };

    return setCachedValue(key, info);
  } catch (err) {
    logger.warn('artist info fetch failed', { artistName, message: (err as Error).message });
    return setCachedValue(key, null);
  }
}