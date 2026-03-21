import { useState, useMemo } from 'react';
import { useUnit } from 'effector-react';
import { Disc3, Play, Music2 } from 'lucide-react';
import { $downloads, $search } from '../stores/downloads';
import { $focusedAlbum } from '../stores/nav';
import { playPlaylist } from '../stores/player';
import { createFuzzySearchMatcher } from '../lib/search';
import ResizablePaneLayout from './ResizablePaneLayout';
import TrackRow from './TrackRow';

export default function AlbumsView() {
  const downloads = useUnit($downloads);
  const focusedAlbum = useUnit($focusedAlbum);
  const search = useUnit($search);

  const albums = useMemo(() => {
    const matchesSearch = createFuzzySearchMatcher(search);
    return downloads
      .filter((d) => d.type === 'album' && d.tracks.length > 0)
      .filter((d) => matchesSearch(d.name));
  }, [downloads, search]);

  const [selectedId, setSelectedId] = useState<string | null>(focusedAlbum ?? null);
  const selected = albums.find((a) => a.id === selectedId) ?? albums[0] ?? null;

  if (albums.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Disc3 size={40} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-600 text-sm">No albums yet</p>
          <p className="text-zinc-700 text-xs mt-1">Album downloads appear here</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex overflow-hidden">
      <ResizablePaneLayout
        storageKey="reel:albums-list-width"
        defaultWidth={224}
        minPaneWidth={200}
        maxPaneWidth={420}
        minContentWidth={420}
        pane={
          <div className="flex h-full flex-col overflow-hidden">
            <div className="bg-zinc-800/60 backdrop-blur border-b border-zinc-700/60 px-3 py-1.5 text-xs text-zinc-500 font-medium select-none flex items-center justify-between shrink-0">
              <span>Album</span>
              <span>Tracks</span>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {albums.map((item) => {
                const doneTracks = item.tracks.filter((t) => t.status === 'done');
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
                      {doneTracks.length}/{item.totalTracks}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        }
      >
        {selected && (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
              <div className="w-14 h-14 rounded overflow-hidden bg-zinc-700 flex items-center justify-center shrink-0">
                {selected.coverArt ? (
                  <img src={selected.coverArt} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music2 size={20} className="text-zinc-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-zinc-200 font-semibold text-sm truncate">{selected.name}</div>
                <div className="text-zinc-500 text-xs mt-0.5">
                  {selected.tracks.filter((t) => t.status === 'done').length}/{selected.totalTracks} tracks · {selected.format.toUpperCase()}
                </div>
              </div>
              {selected.tracks.filter((t) => t.status === 'done').length > 0 && (
                <button
                  onClick={() =>
                    playPlaylist({
                      tracks: selected.tracks
                        .filter((t) => t.status === 'done')
                        .map((t) => ({ track: t, downloadId: selected.id, coverArt: selected.coverArt, albumName: selected.name })),
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

            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {selected.tracks.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  downloadId={selected.id}
                  coverArt={selected.coverArt}
                  albumName={selected.name}
                  allTracks={selected.tracks
                    .filter((t) => t.status === 'done')
                    .map((t) => ({ track: t, downloadId: selected.id, coverArt: selected.coverArt, albumName: selected.name }))}
                />
              ))}
            </div>
          </div>
        )}
      </ResizablePaneLayout>
    </main>
  );
}
