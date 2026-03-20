interface AlbumLike {
  album?: string | null;
}

export function getTrackAlbumName(track: AlbumLike | null | undefined, fallbackAlbumName = ''): string {
  const album = typeof track?.album === 'string' ? track.album.trim() : '';
  return album || fallbackAlbumName;
}

export function normalizeTrackGenres(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;

  const genres = input
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => value.length > 0);

  return genres.length > 0 ? [...new Set(genres)] : undefined;
}
