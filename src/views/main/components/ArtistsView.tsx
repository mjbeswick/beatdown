import { useEffect, useMemo, useState } from 'react';
import { useUnit } from 'effector-react';
import { ExternalLink, Mic2, Play, RefreshCw } from 'lucide-react';
import { $downloads, $search } from '../stores/downloads';
import { $focusedArtist } from '../stores/nav';
import { playPlaylist } from '../stores/player';
import { rpc } from '../rpc';
import { getTrackAlbumName } from '../../../shared/track-metadata';
import { createFuzzySearchMatcher } from '../lib/search';
import ResizablePaneLayout from './ResizablePaneLayout';
import TrackRow from './TrackRow';
import type { ArtistInfo, TrackInfo } from '../../../shared/types';

type ArtistInfoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: ArtistInfo | null };

function loadArtistInfo(
  artist: string,
  setArtistInfoState: React.Dispatch<React.SetStateAction<ArtistInfoState>>,
  options?: { forceRefresh?: boolean }
) {
  let disposed = false;
  setArtistInfoState({ status: 'loading' });

  rpc.proxy.request['artist:getInfo']({ artist, forceRefresh: options?.forceRefresh })
    .then((data) => {
      if (!disposed) setArtistInfoState({ status: 'ready', data });
    })
    .catch(() => {
      if (!disposed) setArtistInfoState({ status: 'ready', data: null });
    });

  return () => {
    disposed = true;
  };
}

export default function ArtistsView() {
  const downloads = useUnit($downloads);
  const focusedArtist = useUnit($focusedArtist);
  const search = useUnit($search);

  const artistMap = useMemo(() => {
    const map = new Map<string, Array<{ track: TrackInfo; downloadId: string; coverArt?: string; albumName: string }>>();
    for (const item of downloads) {
      for (const track of item.tracks) {
        if (track.status === 'done') {
          if (!map.has(track.artist)) map.set(track.artist, []);
          map.get(track.artist)!.push({
            track,
            downloadId: item.id,
            coverArt: item.coverArt,
            albumName: getTrackAlbumName(track, item.name),
          });
        }
      }
    }
    return map;
  }, [downloads]);

  const artists = useMemo(() => {
    const matchesSearch = createFuzzySearchMatcher(search);
    return [...artistMap.entries()]
      .filter(([artist]) => matchesSearch(artist))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [artistMap, search]);

  const [selectedArtist, setSelectedArtist] = useState<string | null>(focusedArtist ?? null);
  const [artistInfoState, setArtistInfoState] = useState<ArtistInfoState>({ status: 'idle' });
  const resolvedArtist = (selectedArtist && artistMap.has(selectedArtist) ? selectedArtist : artists[0]?.[0]) ?? null;
  const selectedTracks = resolvedArtist ? (artistMap.get(resolvedArtist) ?? []) : [];

  useEffect(() => {
    if (!resolvedArtist) {
      setArtistInfoState({ status: 'idle' });
      return;
    }

    return loadArtistInfo(resolvedArtist, setArtistInfoState);
  }, [resolvedArtist]);

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

  const artistInfo = artistInfoState.status === 'ready' ? artistInfoState.data : null;
  const artistMeta = [artistInfo?.type, artistInfo?.area, artistInfo?.activeYears].filter(Boolean);
  const artistTags = artistInfo?.tags ?? [];
  const externalArtistUrl = artistInfo?.wikipediaUrl ?? artistInfo?.musicBrainzUrl;
  const isArtistInfoLoading = artistInfoState.status === 'loading';

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
            <div className="shrink-0 flex items-start gap-4 px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700/80 shadow-[0_12px_30px_rgba(0,0,0,0.28)] flex items-center justify-center shrink-0 text-zinc-300 text-3xl font-semibold">
                {artistInfo?.imageUrl ? (
                  <img src={artistInfo.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  resolvedArtist.charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-zinc-200 font-semibold text-sm truncate">{resolvedArtist}</div>
                    <div className="text-zinc-500 text-xs mt-0.5">
                      {selectedTracks.length} tracks · {albumGroups.size} {albumGroups.size === 1 ? 'album' : 'albums'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => loadArtistInfo(resolvedArtist, setArtistInfoState, { forceRefresh: true })}
                      disabled={isArtistInfoLoading}
                      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:text-zinc-600 transition-colors"
                    >
                      <RefreshCw size={13} className={isArtistInfoLoading ? 'animate-spin' : undefined} />
                      Refresh
                    </button>
                    {externalArtistUrl && (
                      <button
                        onClick={() => rpc.proxy.request['app:openExternal']({ url: externalArtistUrl })}
                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        <ExternalLink size={13} />
                        More info
                      </button>
                    )}
                    {selectedTracks.length > 0 && (
                      <button
                        onClick={() =>
                          playPlaylist({
                            tracks: selectedTracks.map((t) => ({ track: t.track, downloadId: t.downloadId, coverArt: t.coverArt, albumName: t.albumName })),
                            startIndex: 0,
                          })
                        }
                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
                      >
                        <Play size={13} className="fill-current" />
                        Play all
                      </button>
                    )}
                  </div>
                </div>

                {artistMeta.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {artistMeta.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-zinc-700/80 bg-zinc-800/70 px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-zinc-400"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                )}

                {artistTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {artistTags.map((tag) => (
                      <span key={tag} className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="text-xs text-zinc-500 min-h-[2.5rem]">
                  {isArtistInfoLoading ? (
                    <span>Looking up artist details online…</span>
                  ) : artistInfo?.summary ? (
                    <p
                      style={{
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 3,
                        overflow: 'hidden',
                      }}
                    >
                      {artistInfo.summary}
                    </p>
                  ) : (
                    <span>No online artist profile found for this artist.</span>
                  )}
                </div>
              </div>
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
