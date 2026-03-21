import type { ContentType } from './types';

type SpotifyContentType = Extract<ContentType, 'track' | 'album' | 'playlist'>;

function getString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function extractSpotifyContentRef(
  url: string
): { type: SpotifyContentType; id: string } | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname.toLowerCase() !== 'open.spotify.com') return null;

    const [type, id] = parsed.pathname.split('/').filter(Boolean);
    if (
      (type === 'track' || type === 'album' || type === 'playlist') &&
      id &&
      /^[a-zA-Z0-9]+$/.test(id)
    ) {
      return { type, id };
    }

    return null;
  } catch {
    return null;
  }
}

export function extractYouTubePlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname !== 'youtube.com' &&
      hostname !== 'www.youtube.com' &&
      hostname !== 'music.youtube.com' &&
      hostname !== 'm.youtube.com'
    ) {
      return null;
    }

    return getString(parsed.searchParams.get('list')) ?? null;
  } catch {
    return null;
  }
}

export function getContentSourceIdentity(url: string): string | null {
  const spotifyRef = extractSpotifyContentRef(url);
  if (spotifyRef) return `spotify:${spotifyRef.type}:${spotifyRef.id}`;

  const youtubePlaylistId = extractYouTubePlaylistId(url);
  if (youtubePlaylistId) return `youtube:playlist:${youtubePlaylistId}`;

  return null;
}
