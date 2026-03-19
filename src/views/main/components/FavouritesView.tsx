import { useUnit } from 'effector-react';
import { Heart, Play } from 'lucide-react';
import { $downloads, $search } from '../stores/downloads';
import { $favourites } from '../stores/favourites';
import { playPlaylist, playTrack } from '../stores/player';
import TrackRow from './TrackRow';
import type { TrackInfo } from '../../../shared/types';

export default function FavouritesView() {
  const downloads = useUnit($downloads);
  const favourites = useUnit($favourites);
  const search = useUnit($search);

  // Collect all done tracks that are favourited
  const tracks: Array<{ track: TrackInfo; downloadId: string; coverArt?: string; albumName: string }> = [];
  for (const item of downloads) {
    for (const track of item.tracks) {
      if (track.status === 'done' && favourites.includes(track.id)) {
        tracks.push({ track, downloadId: item.id, coverArt: item.coverArt, albumName: item.name });
      }
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? tracks.filter(
        ({ track }) =>
          track.title.toLowerCase().includes(q) ||
          track.artist.toLowerCase().includes(q) ||
          (track.album ?? '').toLowerCase().includes(q)
      )
    : tracks;

  const handlePlayAll = () => {
    if (filtered.length === 0) return;
    playPlaylist({ tracks: filtered, startIndex: 0 });
  };

  if (favourites.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Heart size={40} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-600 text-sm">No favourites yet</p>
          <p className="text-zinc-700 text-xs mt-1">
            Click the heart icon on any playing track to add it here
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-zinc-800/60 border-b border-zinc-700/60 flex items-center gap-3 px-4 py-2 select-none">
        <Heart size={14} className="text-rose-500 fill-rose-500 shrink-0" />
        <span className="text-xs text-zinc-400 font-medium flex-1">
          {filtered.length} {filtered.length === 1 ? 'track' : 'tracks'}
        </span>
        {filtered.length > 0 && (
          <button
            onClick={handlePlayAll}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Play all favourites"
          >
            <Play size={12} className="fill-current" />
            Play all
          </button>
        )}
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm">No favourites match your search</p>
          </div>
        ) : (
          filtered.map(({ track, downloadId, coverArt, albumName }) => (
            <TrackRow
              key={track.id}
              track={track}
              downloadId={downloadId}
              coverArt={coverArt}
              albumName={albumName}
              allTracks={filtered}
            />
          ))
        )}
      </div>
    </main>
  );
}
