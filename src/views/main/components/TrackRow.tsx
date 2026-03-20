import { CheckCircle2, AlertCircle, Loader2, Clock, Trash2, Play, ListMusic, Heart } from 'lucide-react';
import type { TrackInfo } from '../../../shared/types';
import { fmtSpeed, fmtEta } from './DownloadRow';
import { useContextMenu } from '../hooks/useContextMenu';
import ContextMenu from './ContextMenu';
import { removeTrackFx } from '../stores/downloads';
import {
  playTrack,
  playPlaylist,
  playNext,
  enqueueTrack,
  $player,
  type PlayingTrack,
} from '../stores/player';
import { useUnit } from 'effector-react';
import { navToAlbum, navToArtist } from '../stores/nav';
import { $favourites, toggleFavourite } from '../stores/favourites';

function TrackIcon({ status }: { status: TrackInfo['status'] }) {
  switch (status) {
    case 'queued':    return <Clock size={11} className="text-zinc-600" />;
    case 'downloading': return <Loader2 size={11} className="text-emerald-400 animate-spin" />;
    case 'converting':  return <Loader2 size={11} className="text-blue-400 animate-spin" />;
    case 'done':      return <CheckCircle2 size={11} className="text-emerald-400" />;
    case 'error':     return <AlertCircle size={11} className="text-red-400" />;
  }
}

interface Props {
  track: TrackInfo;
  downloadId?: string;
  coverArt?: string;
  albumName?: string;
  allTracks?: Array<{ track: TrackInfo; downloadId: string; coverArt?: string; albumName: string }>;
  compact?: boolean;
}

export default function TrackRow({ track, downloadId, coverArt, albumName = '', allTracks, compact }: Props) {
  const isActive = track.status === 'downloading' || track.status === 'converting';
  const isDone = track.status === 'done';
  const showSpeed = track.status === 'downloading' && !!track.speed && track.speed > 0;
  const showEta = track.status === 'downloading' && !!track.eta;
  const { pos, open, close } = useContextMenu();
  const player = useUnit($player);
  const favourites = useUnit($favourites);
  const isNowPlaying = player.current?.track.id === track.id;
  const isFavourited = favourites.includes(track.id);

  const asPlayingTrack = (): PlayingTrack => ({
    track,
    downloadId: downloadId ?? '',
    coverArt,
    albumName: albumName ?? '',
  });

  const handleDoubleClick = () => {
    if (!isDone || !downloadId) return;
    if (allTracks && allTracks.length > 0) {
      const doneTracks = allTracks.filter((t) => t.track.status === 'done');
      const idx = doneTracks.findIndex((t) => t.track.id === track.id);
      if (idx !== -1) {
        playPlaylist({
          tracks: doneTracks.map((t) => ({
            track: t.track,
            downloadId: t.downloadId,
            coverArt: t.coverArt,
            albumName: t.albumName,
          })),
          startIndex: idx,
          pinStartTrack: true,
        });
        return;
      }
    }
    playTrack(asPlayingTrack());
  };

  return (
    <div
      className={`flex items-center gap-2 ${compact ? 'pl-3' : 'pl-14'} pr-3 py-1.5 border-b border-zinc-700/30 last:border-0 group relative ${
        isDone ? 'cursor-pointer hover:bg-zinc-800/40' : ''
      } ${isNowPlaying ? 'bg-emerald-900/10' : ''}`}
      onDoubleClick={handleDoubleClick}
      onContextMenu={downloadId ? open : undefined}
    >
      {/* Now-playing indicator */}
      {isNowPlaying ? (
        <span className="w-[11px] h-[11px] flex items-center justify-center">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </span>
      ) : isDone ? (
        <span className="w-[11px] h-[11px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Play size={9} className="text-zinc-400 fill-zinc-400" />
        </span>
      ) : (
        <TrackIcon status={track.status} />
      )}

      {/* Title + artist */}
      <div className="flex-1 min-w-0">
        <div className="truncate text-xs leading-tight">
          <span className={isNowPlaying ? 'text-emerald-400' : 'text-zinc-300'}>{track.title}</span>
          <span className="text-zinc-600"> — {track.artist}</span>
        </div>
      </div>

      {isActive && (
        <div className="ml-auto flex shrink-0 items-center justify-end gap-3 pl-3">
          <div className="w-72 shrink-0 flex items-center gap-2">
            <div className="w-10 shrink-0 text-right text-xs text-zinc-600 font-mono tabular-nums">
              {track.progress}%
            </div>
            <div className="h-1 flex-1 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${track.progress}%` }}
              />
            </div>
            <div className="w-20 shrink-0 text-right font-mono text-xs text-zinc-600 tabular-nums">
              {showSpeed ? fmtSpeed(track.speed!) : ''}
            </div>
          </div>

          <div className="w-16 shrink-0 text-right font-mono text-xs text-zinc-600 tabular-nums">
            {showEta ? fmtEta(track.eta!) : ''}
          </div>
        </div>
      )}

      <div className="w-5 shrink-0 flex items-center justify-end">
        {isDone && (
          <button
            className={`shrink-0 transition-opacity ${isFavourited ? 'opacity-100' : 'opacity-0 group-hover:opacity-40 hover:!opacity-100'}`}
            onClick={(e) => { e.stopPropagation(); toggleFavourite(track.id); }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Heart size={11} className={isFavourited ? 'fill-rose-500 text-rose-500' : 'text-zinc-400'} />
          </button>
        )}
      </div>

      {pos && downloadId && (
        <ContextMenu
          x={pos.x}
          y={pos.y}
          onClose={close}
          items={[
            ...(isDone ? [
              { label: 'Play', icon: <Play size={13} />, onClick: () => playTrack(asPlayingTrack()) },
              { label: 'Play Next', icon: <Play size={13} />, onClick: () => playNext(asPlayingTrack()) },
              { label: 'Enqueue', icon: <ListMusic size={13} />, onClick: () => enqueueTrack(asPlayingTrack()) },
              { separator: true as const },
              { label: 'Go to Artist', onClick: () => navToArtist(track.artist) },
              { separator: true as const },
            ] : []),
            {
              label: 'Remove track',
              icon: <Trash2 size={13} />,
              onClick: () => removeTrackFx({ downloadId, trackId: track.id }),
              danger: true,
            },
          ]}
        />
      )}
    </div>
  );
}
