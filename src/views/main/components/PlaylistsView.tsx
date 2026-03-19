import { useState } from 'react';
import { useUnit } from 'effector-react';
import { ListMusic, Play, Music2 } from 'lucide-react';
import { $downloads, $search } from '../stores/downloads';
import { playPlaylist } from '../stores/player';
import TrackRow from './TrackRow';

export default function PlaylistsView() {
  const downloads = useUnit($downloads);
  const search = useUnit($search);

  const q = search.trim().toLowerCase();
  const playlists = downloads
    .filter((d) => d.type === 'playlist' && d.tracks.length > 0)
    .filter((d) => !q || d.name.toLowerCase().includes(q));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = playlists.find((p) => p.id === selectedId) ?? playlists[0] ?? null;

  if (playlists.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <ListMusic size={40} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-600 text-sm">No playlists yet</p>
          <p className="text-zinc-700 text-xs mt-1">Playlist downloads appear here</p>
        </div>
      </main>
    );
  }

  const doneTracks = selected ? selected.tracks.filter((t) => t.status === 'done') : [];

  return (
    <main className="flex-1 flex overflow-hidden">
      {/* Left: playlist list */}
      <div className="w-56 shrink-0 border-r border-zinc-800 flex flex-col overflow-hidden">
        <div className="bg-zinc-800/60 backdrop-blur border-b border-zinc-700/60 px-3 py-1.5 text-xs text-zinc-500 font-medium select-none flex items-center justify-between shrink-0">
          <span>Playlist</span>
          <span>Tracks</span>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {playlists.map((item) => {
            const done = item.tracks.filter((t) => t.status === 'done');
            const isSelected = item.id === selected?.id;
            return (
              <div
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-zinc-800/60 last:border-b-0 transition-colors ${
                  isSelected ? 'bg-zinc-700/50' : 'hover:bg-zinc-800/30'
                }`}
              >
                <div className="w-8 h-8 rounded overflow-hidden bg-zinc-700 flex items-center justify-center shrink-0">
                  {item.coverArt ? (
                    <img src={item.coverArt} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music2 size={12} className="text-zinc-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-zinc-300 text-xs truncate">{item.name}</div>
                  <div className="text-zinc-600 text-xs">{item.format.toUpperCase()}</div>
                </div>
                <span className="text-zinc-500 text-xs font-mono tabular-nums shrink-0">
                  {done.length}/{item.totalTracks}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: tracks for selected playlist */}
      {selected && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Playlist header */}
          <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
            <div className="w-14 h-14 rounded overflow-hidden bg-zinc-700 flex items-center justify-center shrink-0">
              {selected.coverArt ? (
                <img src={selected.coverArt} alt="" className="w-full h-full object-cover" />
              ) : (
                <ListMusic size={20} className="text-zinc-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-zinc-200 font-semibold text-sm truncate">{selected.name}</div>
              <div className="text-zinc-500 text-xs mt-0.5">
                {doneTracks.length} / {selected.totalTracks} tracks
              </div>
            </div>
            {doneTracks.length > 0 && (
              <button
                onClick={() =>
                  playPlaylist({
                    tracks: doneTracks.map((t) => ({
                      track: t,
                      downloadId: selected.id,
                      coverArt: selected.coverArt,
                      albumName: selected.name,
                    })),
                    startIndex: 0,
                  })
                }
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-emerald-400 transition-colors shrink-0"
              >
                <Play size={13} className="fill-current" />
                Play all
              </button>
            )}
          </div>

          {/* Column header */}
          <div className="shrink-0 bg-zinc-800/60 border-b border-zinc-700/60 flex items-center px-3 py-1.5 text-xs text-zinc-500 font-medium select-none">
            <div className="w-8 shrink-0" />
            <div className="flex-1 min-w-0">Title</div>
            <div className="w-32 shrink-0 text-right pr-2">Artist</div>
            <div className="w-7 shrink-0" />
          </div>

          {/* Track list */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {selected.tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                downloadId={selected.id}
                coverArt={selected.coverArt}
                albumName={selected.name}
                allTracks={doneTracks.map((t) => ({
                  track: t,
                  downloadId: selected.id,
                  coverArt: selected.coverArt,
                  albumName: selected.name,
                }))}
              />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
