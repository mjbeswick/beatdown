import { CheckCircle2, AlertCircle, Loader2, Clock, Trash2, Play, ListMusic, Heart, RotateCcw } from 'lucide-react';
import type { TrackInfo } from '../../../shared/types';
import { fmtSpeed, fmtEta } from './DownloadRow';
import { useContextMenu } from '../hooks/useContextMenu';
import ContextMenu from './ContextMenu';
import { removeTrackFx, retryTrackFx } from '../stores/downloads';
import {
  playTrack,
  playPlaylist,
  playNext,
  enqueueTrack,
  $player,
  type PlayingTrack,
} from '../stores/player';
import { useUnit, useStoreMap } from 'effector-react';
import { navToAlbum, navToArtist } from '../stores/nav';
import { $favourites, toggleFavourite } from '../stores/favourites';

function TrackIcon({ status, error }: { status: TrackInfo['status']; error?: string }) {
  switch (status) {
    case 'queued':    return <Clock size={11} className="text-zinc-600" />;
    case 'downloading': return <Loader2 size={11} className="text-emerald-400 animate-spin" />;
    case 'converting':  return <Loader2 size={11} className="text-blue-400 animate-spin" />;
    case 'done':      return <CheckCircle2 size={11} className="text-emerald-400" />;
    case 'error':     return <span title={error}><AlertCircle size={11} className="text-red-400" /></span>;
  }
}

function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className="flex items-end gap-[2px] h-3" aria-hidden>
      {([0, 0.2, 0.1] as const).map((delay, i) => (
        <span
          key={i}
          className="w-[3px] bg-emerald-400 rounded-sm h-full"
          style={{
            transformOrigin: 'bottom',
            animation: playing ? `soundbar 0.6s ease-in-out ${delay}s infinite alternate` : 'none',
            transform: playing ? undefined : 'scaleY(0.45)',
          }}
        />
      ))}
    </span>
  );
}

interface Props {
  track: TrackInfo;
  downloadId?: string;
  coverArt?: string;
  albumName?: string;
  allTracks?: Array<{ track: TrackInfo; downloadId: string; coverArt?: string; albumName: string }>;
  compact?: boolean;
  progressStyle?: 'inline' | 'background';
}

export default function TrackRow({
  track,
  downloadId,
  coverArt,
  albumName = '',
  allTracks,
  compact,
  progressStyle = 'inline',
}: Props) {
  const isConverting = track.status === 'converting';
  const isActive = track.status === 'downloading' || track.status === 'converting';
  const isDone = track.status === 'done';
  const isPendingDownload = !isDone;
  const showSpeed = track.status === 'downloading' && !!track.speed && track.speed > 0;
  const showEta = track.status === 'downloading' && !!track.eta;
  const useBackgroundProgress = isActive && progressStyle === 'background';
  const displayProgress = isConverting ? 100 : track.progress;
  const progressLabel = isConverting ? 'Finalizing' : `${track.progress}%`;
  const formattedDuration = formatTrackDuration(track.durationSeconds);
  const showDuration = !isActive && !!formattedDuration;
  const { pos, open, close } = useContextMenu();
  const isNowPlaying = useStoreMap({
    store: $player,
    keys: [track.id],
    fn: (p, [id]) => p.current?.track.id === id,
  });
  const isPlaying = useStoreMap({ store: $player, keys: [], fn: (p) => p.isPlaying });
  const favourites = useUnit($favourites);
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

  const contextMenuItems = [
    ...(isDone ? [
      { label: 'Play', icon: <Play size={13} />, onClick: () => playTrack(asPlayingTrack()) },
      { label: 'Play Next', icon: <Play size={13} />, onClick: () => playNext(asPlayingTrack()) },
      { label: 'Enqueue', icon: <ListMusic size={13} />, onClick: () => enqueueTrack(asPlayingTrack()) },
      { separator: true as const },
      { label: 'Go to Artist', onClick: () => navToArtist(track.artist) },
      { separator: true as const },
    ] : []),
    ...(track.status === 'error' && downloadId ? [
      {
        label: 'Retry',
        icon: <RotateCcw size={13} />,
        onClick: () => retryTrackFx({ downloadId, trackId: track.id }),
      },
      { separator: true as const },
    ] : []),
    {
      label: 'Remove track',
      icon: <Trash2 size={13} />,
      onClick: () => removeTrackFx({ downloadId: downloadId!, trackId: track.id }),
      danger: true,
    },
  ];

  // ── Compact mode (used in PlaylistsView, ArtistsView, GenresView) ────────────
  if (compact) {
    return (
      <>
        <div
          className={`relative flex items-center gap-2 pl-3 pr-3 py-1.5 border-b border-zinc-700/30 last:border-0 group ${
            isDone ? 'cursor-pointer hover:bg-zinc-800/40' : ''
          } ${isNowPlaying ? 'bg-emerald-950/40' : ''}`}
          onDoubleClick={handleDoubleClick}
          onContextMenu={downloadId ? open : undefined}
        >
          {/* Left playing border */}
          {isNowPlaying && (
            <span className="absolute left-0 inset-y-0 w-[2px] bg-emerald-400 rounded-r-sm" />
          )}

          {/* Background download progress overlay */}
          {useBackgroundProgress && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `linear-gradient(to right, ${isConverting ? 'rgba(96,165,250,0.14)' : 'rgba(16,185,129,0.14)'} ${displayProgress}%, transparent ${displayProgress}%)`,
              }}
            />
          )}

          {/* Index / play / equalizer column */}
          <div className="relative z-10 w-8 shrink-0 flex items-center justify-center">
            {isNowPlaying ? (
              <Equalizer playing={isPlaying} />
            ) : isDone ? (
              <>
                <span className="group-hover:hidden text-zinc-600 text-[10px] tabular-nums font-mono select-none leading-none">
                  {track.index}
                </span>
                <Play size={10} className="hidden group-hover:block text-zinc-400 fill-zinc-400" />
              </>
            ) : (
            <TrackIcon status={track.status} error={track.error} />
          )}
        </div>

          {/* Title column */}
          <div className="relative z-10 flex-[3] min-w-0">
            <span className={`block truncate text-xs leading-tight ${
              isNowPlaying ? 'text-emerald-400 font-medium' : isPendingDownload ? 'text-zinc-500' : 'text-zinc-200'
            }`}>
              {track.title}
            </span>
          </div>

          {/* Artist column */}
          <div className="relative z-10 flex-[2] min-w-0">
            <span className={`block truncate text-xs leading-tight ${
              isPendingDownload ? 'text-zinc-700' : 'text-zinc-500'
            }`}>
              {track.artist}
            </span>
          </div>

          {/* Inline progress (downloading) */}
          {isActive && progressStyle === 'inline' && (
            <div className="relative z-10 ml-auto flex shrink-0 items-center justify-end gap-3 pl-3">
              <div className="w-52 shrink-0 flex items-center gap-2">
                <div className={`shrink-0 text-right ${
                  isConverting
                    ? 'w-20 text-[10px] font-medium uppercase tracking-[0.08em] text-blue-400'
                    : 'w-10 text-xs text-zinc-600 font-mono tabular-nums'
                }`}>
                  {progressLabel}
                </div>
                <div className="h-1 flex-1 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${isConverting ? 'bg-blue-400' : 'bg-emerald-500'}`}
                    style={{ width: `${displayProgress}%` }}
                  />
                </div>
              </div>
              <div className="w-14 shrink-0 text-right font-mono text-xs text-zinc-600 tabular-nums">
                {showSpeed ? fmtSpeed(track.speed!) : showEta ? fmtEta(track.eta!) : ''}
              </div>
            </div>
          )}

          {/* Trailing: progress label (background mode) or heart (done) */}
          <div className="relative z-10 w-24 shrink-0 flex items-center justify-end gap-3">
            {useBackgroundProgress ? (
              <span className={isConverting
                ? 'text-[10px] font-medium uppercase tracking-[0.08em] text-blue-400'
                : 'text-xs text-zinc-500 font-mono tabular-nums'}>
                {progressLabel}
              </span>
            ) : (
              <>
                {showDuration && (
                  <span className={`text-xs font-mono tabular-nums ${isNowPlaying ? 'text-emerald-300' : isPendingDownload ? 'text-zinc-600' : 'text-zinc-500'}`}>
                    {formattedDuration}
                  </span>
                )}
                {isDone ? (
                  <button
                    className={`shrink-0 transition-opacity ${isFavourited ? 'opacity-100' : 'opacity-0 group-hover:opacity-40 hover:!opacity-100'}`}
                    onClick={(e) => { e.stopPropagation(); toggleFavourite(track.id); }}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <Heart size={11} className={isFavourited ? 'fill-rose-500 text-rose-500' : 'text-zinc-400'} />
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>

        {pos && downloadId && (
          <ContextMenu x={pos.x} y={pos.y} onClose={close} items={contextMenuItems} />
        )}
      </>
    );
  }

  // ── Standard mode (used in AlbumsView, FavouritesView, DownloadRow) ──────────
  const trailingSlotWidth = useBackgroundProgress ? 'w-20' : showDuration || isDone ? 'w-24' : 'w-5';

  return (
    <div
      className={`flex items-center gap-2 pl-14 pr-3 py-1.5 border-b border-zinc-700/30 last:border-0 group relative ${
        isDone ? 'cursor-pointer hover:bg-zinc-800/40' : ''
      } ${isNowPlaying ? 'bg-emerald-900/10' : ''}`}
      onDoubleClick={handleDoubleClick}
      onContextMenu={downloadId ? open : undefined}
    >
      {useBackgroundProgress && (
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage: `linear-gradient(to right, ${isConverting ? 'rgba(96, 165, 250, 0.18)' : 'rgba(16, 185, 129, 0.18)'} 0%, ${isConverting ? 'rgba(96, 165, 250, 0.18)' : 'rgba(16, 185, 129, 0.18)'} ${displayProgress}%, ${isConverting ? 'rgba(96, 165, 250, 0.04)' : 'rgba(16, 185, 129, 0.04)'} ${displayProgress}%, ${isConverting ? 'rgba(96, 165, 250, 0.04)' : 'rgba(16, 185, 129, 0.04)'} 100%)`,
          }}
        />
      )}

      {/* Now-playing indicator */}
      {isNowPlaying ? (
        <span className="relative z-10 w-[11px] h-[11px] flex items-center justify-center">
          <Equalizer playing={isPlaying} />
        </span>
      ) : isDone ? (
        <span className="relative z-10 w-[11px] h-[11px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Play size={9} className="text-zinc-400 fill-zinc-400" />
        </span>
      ) : (
        <span className="relative z-10">
          <TrackIcon status={track.status} error={track.error} />
        </span>
      )}

      {/* Title + artist */}
      <div className="relative z-10 flex-1 min-w-0">
        <div className="truncate text-xs leading-tight">
          <span className={isNowPlaying ? 'text-emerald-400' : isPendingDownload ? 'text-zinc-500' : 'text-zinc-300'}>{track.title}</span>
          <span className={isPendingDownload ? 'text-zinc-700' : 'text-zinc-600'}> — {track.artist}</span>
        </div>
      </div>

      {isActive && progressStyle === 'inline' && (
        <div className="ml-auto flex shrink-0 items-center justify-end gap-3 pl-3">
          <div className="w-72 shrink-0 flex items-center gap-2">
            <div className={`shrink-0 text-right ${
              isConverting
                ? 'w-20 text-[10px] font-medium uppercase tracking-[0.08em] text-blue-400'
                : 'w-10 text-xs text-zinc-600 font-mono tabular-nums'
            }`}>
              {progressLabel}
            </div>
            <div className="h-1 flex-1 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${isConverting ? 'bg-blue-400' : 'bg-emerald-500'}`}
                style={{ width: `${displayProgress}%` }}
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

      {useBackgroundProgress && (
        <div className="relative z-10 ml-auto flex shrink-0 items-center justify-end gap-3 pl-3">
          <div className="w-20 shrink-0 text-right font-mono text-xs text-zinc-500 tabular-nums">
            {showSpeed ? fmtSpeed(track.speed!) : ''}
          </div>
          <div className="w-16 shrink-0 text-right font-mono text-xs text-zinc-500 tabular-nums">
            {showEta ? fmtEta(track.eta!) : ''}
          </div>
        </div>
      )}

      <div className={`relative z-10 ${trailingSlotWidth} shrink-0 flex items-center justify-end`}>
        {useBackgroundProgress ? (
          <span className={isConverting
            ? 'truncate text-right text-[10px] font-medium uppercase tracking-[0.08em] text-blue-400'
            : 'text-right text-xs text-zinc-500 font-mono tabular-nums'}>
            {progressLabel}
          </span>
        ) : (
          <div className="flex items-center justify-end gap-3">
            {showDuration && (
              <span className={`text-right text-xs font-mono tabular-nums ${isNowPlaying ? 'text-emerald-300' : isPendingDownload ? 'text-zinc-600' : 'text-zinc-500'}`}>
                {formattedDuration}
              </span>
            )}
            {isDone ? (
              <button
                className={`shrink-0 transition-opacity ${isFavourited ? 'opacity-100' : 'opacity-0 group-hover:opacity-40 hover:!opacity-100'}`}
                onClick={(e) => { e.stopPropagation(); toggleFavourite(track.id); }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <Heart size={11} className={isFavourited ? 'fill-rose-500 text-rose-500' : 'text-zinc-400'} />
              </button>
            ) : null}
          </div>
        )}
      </div>

      {pos && downloadId && (
        <ContextMenu x={pos.x} y={pos.y} onClose={close} items={contextMenuItems} />
      )}
    </div>
  );
}

function formatTrackDuration(seconds?: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '';

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}
