import { useState } from 'react';
import { useUnit } from 'effector-react';
import { Disc3, Play, ChevronDown, ChevronRight, Music2 } from 'lucide-react';
import { $downloads } from '../stores/downloads';
import { $focusedAlbum } from '../stores/nav';
import { playPlaylist } from '../stores/player';
import TrackRow from './TrackRow';

export default function AlbumsView() {
  const downloads = useUnit($downloads);
  const focusedAlbum = useUnit($focusedAlbum);
  const [expanded, setExpanded] = useState<Set<string>>(
    focusedAlbum ? new Set([focusedAlbum]) : new Set()
  );

  // Albums = downloads with multiple tracks (album/playlist types with cover art)
  const albums = downloads.filter((d) => d.tracks.length > 0);

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

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="sticky top-0 z-10 bg-zinc-800/95 backdrop-blur border-b border-zinc-700 flex items-center px-4 py-1.5 text-xs text-zinc-600 font-medium uppercase tracking-wide select-none">
        <div className="flex-1">Album / Playlist</div>
        <div className="w-20 text-right">Tracks</div>
      </div>

      {albums.map((item) => {
        const isExpanded = expanded.has(item.id);
        const doneTracks = item.tracks.filter((t) => t.status === 'done');

        return (
          <div key={item.id} className="border-b border-zinc-800 last:border-b-0">
            <div
              className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/30 transition-colors cursor-pointer group"
              onClick={() => toggle(item.id)}
            >
              <div className="w-5 shrink-0 flex items-center justify-center text-zinc-600">
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </div>

              {/* Cover art */}
              <div className="w-10 h-10 rounded overflow-hidden bg-zinc-700 flex items-center justify-center shrink-0 relative group/cover">
                {item.coverArt ? (
                  <img src={item.coverArt} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music2 size={14} className="text-zinc-500" />
                )}
                {doneTracks.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playPlaylist({
                        tracks: doneTracks.map((t) => ({
                          track: t,
                          downloadId: item.id,
                          coverArt: item.coverArt,
                          albumName: item.name,
                        })),
                        startIndex: 0,
                      });
                    }}
                    className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover/cover:opacity-100 transition-opacity"
                  >
                    <Play size={12} className="text-white fill-white" />
                  </button>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-zinc-300 text-sm truncate">{item.name}</div>
                <div className="text-zinc-600 text-xs">
                  {item.type} · {item.format.toUpperCase()}
                </div>
              </div>

              <span className="text-zinc-500 text-xs font-mono tabular-nums w-20 text-right">
                {doneTracks.length}/{item.totalTracks}
              </span>
            </div>

            {isExpanded && (
              <div className="bg-zinc-900/60">
                {item.tracks.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    downloadId={item.id}
                    coverArt={item.coverArt}
                    albumName={item.name}
                    allTracks={item.tracks.map((t) => ({
                      track: t,
                      downloadId: item.id,
                      coverArt: item.coverArt,
                      albumName: item.name,
                    }))}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </main>
  );
}
