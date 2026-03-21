import { useMemo, useState } from 'react';
import { useUnit } from 'effector-react';
import { Music2, Play, Tag } from 'lucide-react';
import { $downloads, $search } from '../stores/downloads';
import { playPlaylist } from '../stores/player';
import { createFuzzySearchMatcher, normalizeSearchText } from '../lib/search';
import ResizablePaneLayout from './ResizablePaneLayout';
import TrackRow from './TrackRow';
import type { TrackInfo } from '../../../shared/types';

type GenreTrackEntry = {
  track: TrackInfo;
  downloadId: string;
  coverArt?: string;
  albumName: string;
};

type GenreBucket = {
  key: string;
  label: string;
  tracks: GenreTrackEntry[];
};

function prettifyGenreLabel(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  return trimmed
    .split(/([\s/&-]+)/)
    .map((segment) => {
      if (/^[\s/&-]+$/.test(segment)) return segment;
      if (segment === segment.toUpperCase() && segment.length <= 4) return segment;
      return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
    })
    .join('');
}

export default function GenresView() {
  const downloads = useUnit($downloads);
  const search = useUnit($search);

  const genres = useMemo<GenreBucket[]>(() => {
    const buckets = new Map<string, GenreBucket>();

    for (const item of downloads) {
      for (const track of item.tracks) {
        if (track.status !== 'done' || !track.genres || track.genres.length === 0) continue;

        for (const rawGenre of track.genres) {
          const label = prettifyGenreLabel(rawGenre);
          const key = normalizeSearchText(label);
          if (!key) continue;

          let bucket = buckets.get(key);
          if (!bucket) {
            bucket = { key, label, tracks: [] };
            buckets.set(key, bucket);
          }

          bucket.tracks.push({
            track,
            downloadId: item.id,
            coverArt: item.coverArt,
            albumName: track.album ?? item.name,
          });
        }
      }
    }

    return [...buckets.values()]
      .map((bucket) => ({
        ...bucket,
        tracks: bucket.tracks.sort((left, right) => {
          const artistCompare = left.track.artist.localeCompare(right.track.artist);
          if (artistCompare !== 0) return artistCompare;
          const albumCompare = left.albumName.localeCompare(right.albumName);
          if (albumCompare !== 0) return albumCompare;
          return left.track.index - right.track.index;
        }),
      }))
      .sort((left, right) => {
        if (right.tracks.length !== left.tracks.length) return right.tracks.length - left.tracks.length;
        return left.label.localeCompare(right.label);
      });
  }, [downloads]);

  const filteredGenres = useMemo(() => {
    const matchesSearch = createFuzzySearchMatcher(search);
    return genres.filter((genre) =>
      matchesSearch(
        genre.label,
        ...genre.tracks.flatMap(({ track, albumName }) => [track.artist, track.title, albumName])
      )
    );
  }, [genres, search]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedGenre = filteredGenres.find((genre) => genre.key === selectedKey) ?? filteredGenres[0] ?? null;
  const selectedTracks = selectedGenre?.tracks ?? [];
  const playlistTracks = selectedTracks.map(({ track, downloadId, coverArt, albumName }) => ({
    track,
    downloadId,
    coverArt,
    albumName,
  }));
  const artistCount = new Set(selectedTracks.map(({ track }) => track.artist)).size;
  const albumCount = new Set(selectedTracks.map(({ albumName }) => albumName)).size;

  if (genres.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Tag size={40} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-600 text-sm">No genre tags yet</p>
          <p className="mt-1 text-xs text-zinc-700">Tracks appear here when downloads include genre metadata.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex overflow-hidden">
      <ResizablePaneLayout
        storageKey="reel:genres-list-width"
        defaultWidth={224}
        minPaneWidth={196}
        maxPaneWidth={420}
        minContentWidth={420}
        pane={
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-500 select-none">
              <span>Genre</span>
              <span>Tracks</span>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {filteredGenres.map((genre) => {
                const isSelected = genre.key === selectedGenre?.key;
                return (
                  <div
                    key={genre.key}
                    onClick={() => setSelectedKey(genre.key)}
                    className={`flex cursor-pointer items-center gap-2.5 border-b border-zinc-800/40 px-3 py-2 transition-colors last:border-b-0 ${
                      isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-400">
                      <Tag size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-zinc-300">{genre.label}</div>
                      <div className="text-xs text-zinc-600">
                        {new Set(genre.tracks.map(({ track }) => track.artist)).size} artists
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-500">{genre.tracks.length}</span>
                  </div>
                );
              })}
            </div>
          </div>
        }
      >
        {selectedGenre ? (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-900/70 px-5 py-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-zinc-700/80 bg-zinc-800 text-zinc-300 shadow-[0_12px_30px_rgba(0,0,0,0.28)]">
                <Tag size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-zinc-200">{selectedGenre.label}</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {selectedTracks.length} tracks · {artistCount} {artistCount === 1 ? 'artist' : 'artists'} · {albumCount} {albumCount === 1 ? 'album' : 'albums'}
                </div>
              </div>
              {selectedTracks.length > 0 && (
                <button
                  onClick={() => playPlaylist({ tracks: playlistTracks, startIndex: 0 })}
                  className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-emerald-400"
                >
                  <Play size={13} className="fill-current" />
                  Play all
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {selectedTracks.map(({ track, downloadId, coverArt, albumName }) => (
                <TrackRow
                  key={`${track.id}:${selectedGenre.key}`}
                  track={track}
                  downloadId={downloadId}
                  coverArt={coverArt}
                  albumName={albumName}
                  compact
                  allTracks={playlistTracks}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <Music2 size={40} className="mx-auto mb-3 text-zinc-700" />
              <p className="text-sm text-zinc-600">No matches</p>
              <p className="mt-1 text-xs text-zinc-700">Try a broader search to browse available genre tags.</p>
            </div>
          </div>
        )}
      </ResizablePaneLayout>
    </main>
  );
}
