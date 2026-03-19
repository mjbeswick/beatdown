import { useState } from 'react';
import { useUnit } from 'effector-react';
import { Mic2, Play, ChevronRight, ChevronDown } from 'lucide-react';
import { $downloads } from '../stores/downloads';
import { $focusedArtist } from '../stores/nav';
import { playPlaylist, playTrack } from '../stores/player';
import TrackRow from './TrackRow';
import type { TrackInfo } from '../../../shared/types';

export default function ArtistsView() {
  const downloads = useUnit($downloads);
  const focusedArtist = useUnit($focusedArtist);
  const [expanded, setExpanded] = useState<Set<string>>(
    focusedArtist ? new Set([focusedArtist]) : new Set()
  );

  const artistMap = new Map<string, Array<{ track: TrackInfo; downloadId: string; coverArt?: string; albumName: string }>>();
  for (const item of downloads) {
    for (const track of item.tracks) {
      if (track.status === 'done') {
        if (!artistMap.has(track.artist)) artistMap.set(track.artist, []);
        artistMap.get(track.artist)!.push({
          track,
          downloadId: item.id,
          coverArt: item.coverArt,
          albumName: item.name,
        });
      }
    }
  }

  const artists = [...artistMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  if (artists.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Mic2 size={40} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-600 text-sm">No artists yet</p>
          <p className="text-zinc-700 text-xs mt-1">Artists appear here once tracks are downloaded</p>
        </div>
      </main>
    );
  }

  const toggle = (artist: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(artist) ? next.delete(artist) : next.add(artist);
      return next;
    });
  };

  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="sticky top-0 z-10 bg-zinc-800/95 backdrop-blur border-b border-zinc-700 flex items-center px-4 py-1.5 text-xs text-zinc-600 font-medium uppercase tracking-wide select-none">
        <div className="w-5 shrink-0" />
        <div className="flex-1">Artist</div>
        <div className="w-20 text-right">Tracks</div>
      </div>

      {artists.map(([artist, tracks]) => {
        const isExpanded = expanded.has(artist);
        return (
          <div key={artist} className="border-b border-zinc-800 last:border-b-0">
            <div
              className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/30 transition-colors cursor-pointer group"
              onClick={() => toggle(artist)}
            >
              <div className="w-5 shrink-0 flex items-center justify-center text-zinc-600">
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </div>
              <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 text-zinc-400 text-xs font-medium">
                {artist.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 text-zinc-300 text-sm">{artist}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  playPlaylist({
                    tracks: tracks.map((t) => ({ track: t.track, downloadId: t.downloadId, coverArt: t.coverArt, albumName: t.albumName })),
                    startIndex: 0,
                  });
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-zinc-400 hover:text-emerald-400"
              >
                <Play size={11} className="fill-current" />
                Play all
              </button>
              <span className="text-zinc-500 text-xs font-mono tabular-nums w-20 text-right">{tracks.length}</span>
            </div>
            {isExpanded && (
              <div className="bg-zinc-900/60">
                {tracks.map(({ track, downloadId, coverArt, albumName }) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    downloadId={downloadId}
                    coverArt={coverArt}
                    albumName={albumName}
                    allTracks={tracks}
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
