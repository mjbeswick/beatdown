import { CheckCircle2, AlertCircle, Loader2, Clock, Trash2 } from 'lucide-react';
import type { TrackInfo } from '../types';
import { fmtSpeed, fmtEta } from './DownloadRow';
import { useContextMenu } from '../hooks/useContextMenu';
import ContextMenu from './ContextMenu';
import { removeTrackFx } from '../stores/downloads';
import { confirmTrackRemoval } from '../lib/destructiveActionConfirm';

function TrackIcon({ status }: { status: TrackInfo['status'] }) {
  switch (status) {
    case 'queued':
      return <Clock size={11} className="text-zinc-600" />;
    case 'downloading':
      return <Loader2 size={11} className="text-emerald-400 animate-spin" />;
    case 'converting':
      return <Loader2 size={11} className="text-blue-400 animate-spin" />;
    case 'done':
      return <CheckCircle2 size={11} className="text-emerald-400" />;
    case 'error':
      return <AlertCircle size={11} className="text-red-400" />;
  }
}

function StatusLabel({ track }: { track: TrackInfo }) {
  switch (track.status) {
    case 'queued':
      return <span className="text-zinc-600">Queued</span>;
    case 'downloading':
      return <span className="text-emerald-400">Downloading</span>;
    case 'converting':
      return <span className="text-blue-400">Converting</span>;
    case 'done':
      return <span className="text-emerald-400">Done</span>;
    case 'error':
      return (
        <span className="text-red-400 cursor-help" title={track.error}>
          Error
        </span>
      );
  }
}

interface Props {
  track: TrackInfo;
  downloadId?: string;
}

export default function TrackRow({ track, downloadId }: Props) {
  const isActive = track.status === 'downloading' || track.status === 'converting';
  const { pos, open, close } = useContextMenu();

  return (
    <div
      className="flex items-center gap-2 pl-14 pr-3 py-1.5 border-b border-zinc-800/40 last:border-0"
      onContextMenu={downloadId ? open : undefined}
    >
      <TrackIcon status={track.status} />

      {/* Title + artist */}
      <div className="flex-1 min-w-0 pr-3">
        <span className="text-zinc-300 text-xs truncate">{track.title}</span>
        <span className="text-zinc-600 text-xs"> — {track.artist}</span>
      </div>

      {/* Progress bar */}
      <div className="w-44 shrink-0 pr-2">
        {isActive && (
          <>
            <div className="text-xs text-zinc-600 font-mono tabular-nums mb-0.5">
              {track.progress}%
            </div>
            <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${track.progress}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Speed */}
      <div className="w-24 shrink-0 text-right font-mono text-xs text-zinc-600 tabular-nums">
        {track.status === 'downloading' && track.speed && track.speed > 0
          ? fmtSpeed(track.speed)
          : ''}
      </div>

      {/* ETA */}
      <div className="w-16 shrink-0 text-right font-mono text-xs text-zinc-600 tabular-nums">
        {track.status === 'downloading' && track.eta ? fmtEta(track.eta) : ''}
      </div>

      {/* Status */}
      <div className="w-20 shrink-0 text-right text-xs">
        <StatusLabel track={track} />
      </div>

      {/* Remove button placeholder (keep alignment) */}
      <div className="w-7 shrink-0" />

      {pos && downloadId && (
        <ContextMenu
          x={pos.x}
          y={pos.y}
          onClose={close}
          items={[
            {
              label: 'Remove track',
              icon: <Trash2 size={13} />,
              onClick: () => {
                if (!confirmTrackRemoval(track)) return;
                removeTrackFx({ downloadId, trackId: track.id });
              },
              danger: true,
            },
          ]}
        />
      )}
    </div>
  );
}
