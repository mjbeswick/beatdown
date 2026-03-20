import { useState } from 'react';
import { useUnit } from 'effector-react';
import { Mic2, Play } from 'lucide-react';
import { $downloads, $search } from '../stores/downloads';
import { $focusedArtist } from '../stores/nav';
import { playPlaylist } from '../stores/player';
import ResizablePaneLayout from './ResizablePaneLayout';
import TrackRow from './TrackRow';
import type { TrackInfo } from '../../../shared/types';

export default function ArtistsView() {
  const downloads = useUnit($downloads);
  const focusedArtist = useUnit($focusedArtist);
  const search = useUnit($search);

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

  const q = search.trim().toLowerCase();
  const artists = [...artistMap.entries()]
    .filter(([artist]) => !q || artist.toLowerCase().includes(q))
    .sort((a, b) => a[0].localeCompare(b[0]));

  const [selectedArtist, setSelectedArtist] = useState<string | null>(focusedArtist ?? null);
  const resolvedArtist = (selectedArtist && artistMap.has(selectedArtist) ? selectedArtist : artists[0]?.[0]) ?? null;
  const selectedTracks = resolvedArtist ? (artistMap.get(resolvedArtist) ?? []) : [];

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

  // Group selected artist's tracks by album
  const albumGroups = new Map<string, typeof selectedTracks>();
  for (const t of selectedTracks) {
    if (!albumGroups.has(t.albumName)) albumGroups.set(t.albumName, []);
    albumGroups.get(t.albumName)!.push(t);
  }

  return (
    <main className="flex-1 flex overflow-hidden">
      <ResizablePaneLayout
        storageKey="reel:artists-list-width"
        defaultWidth={208}
        minPaneWidth={184}
        maxPaneWidth={360}
        minContentWidth={420}
        pane={
          <div className="flex h-full flex-col overflow-hidden">
            <div className="bg-zinc-800/60 backdrop-blur border-b border-zinc-700/60 px-3 py-1.5 text-xs text-zinc-500 font-medium select-none flex items-center justify-between shrink-0">
              <span>Artist</span>
              <span>Tracks</span>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {artists.map(([artist, tracks]) => {
                const isSelected = artist === resolvedArtist;
                return (
                  <div
                    key={artist}
                    onClick={() => setSelectedArtist(artist)}
                    className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-zinc-800/60 last:border-b-0 transition-colors ${
                      isSelected ? 'bg-zinc-700/50' : 'hover:bg-zinc-800/30'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 text-zinc-400 text-xs font-medium">
                      {artist.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 min-w-0 text-zinc-300 text-xs truncate">{artist}</span>
                    <span className="text-zinc-500 text-xs font-mono tabular-nums shrink-0">{tracks.length}</span>
                  </div>
                );
              })}
            </div>
          </div>
        }
      >
        {resolvedArtist && (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
              <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 text-zinc-300 text-xl font-semibold">
                {resolvedArtist.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-zinc-200 font-semibold text-sm truncate">{resolvedArtist}</div>
                <div className="text-zinc-500 text-xs mt-0.5">
                  {selectedTracks.length} tracks · {albumGroups.size} {albumGroups.size === 1 ? 'album' : 'albums'}
                </div>
              </div>
              {selectedTracks.length > 0 && (
                <button
                  onClick={() =>
                    playPlaylist({
                      tracks: selectedTracks.map((t) => ({ track: t.track, downloadId: t.downloadId, coverArt: t.coverArt, albumName: t.albumName })),
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
              {[...albumGroups.entries()].map(([albumName, albumTracks]) => (
                <div key={albumName}>
                  <div className="sticky top-0 bg-zinc-800/60 backdrop-blur border-b border-zinc-700/60 flex items-center justify-between px-4 py-1.5 text-xs text-zinc-500 font-medium select-none z-10">
                    <span>{albumName}</span>
                    <span>{albumTracks.length}</span>
                  </div>
                  {albumTracks.map(({ track, downloadId, coverArt, albumName: aName }) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      downloadId={downloadId}
                      coverArt={coverArt}
                      albumName={aName}
                      compact
                      allTracks={selectedTracks.map((t) => ({ track: t.track, downloadId: t.downloadId, coverArt: t.coverArt, albumName: t.albumName }))}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </ResizablePaneLayout>
    </main>
  );
}
