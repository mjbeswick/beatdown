import type { SpotifyContent } from '../../shared/types';
import { extractSpotifyId, getSpotifyContent } from './spotify';
import { getYouTubePlaylistContent, isYouTubePlaylistUrl } from './youtube';

export async function getContent(url: string): Promise<SpotifyContent> {
  const trimmed = url.trim();

  if (extractSpotifyId(trimmed)) {
    return getSpotifyContent(trimmed);
  }

  if (isYouTubePlaylistUrl(trimmed)) {
    return getYouTubePlaylistContent(trimmed);
  }

  throw new Error(
    'Unsupported URL. Paste a Spotify track, album, or playlist URL, or a YouTube Music playlist URL.'
  );
}
