import { useUnit } from 'effector-react';
import {
  ChevronRight,
  ChevronDown,
  X,
  Music2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Clock,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { $expandedRows, rowToggled, removeDownloadFx, redownloadFx } from '../stores/downloads';
import type { DownloadItem } from '../types';
import TrackRow from './TrackRow';
import { useContextMenu } from '../hooks/useContextMenu';
import ContextMenu from './ContextMenu';
import { confirmDownloadRemoval } from '../lib/destructiveActionConfirm';

export function fmtSpeed(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${bps} B/s`;
}

export function fmtEta(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function StatusDot({ status }: { status: DownloadItem['status'] }) {
  switch (status) {
    case 'fetching':
      return <Loader2 size={13} className="text-blue-400 animate-spin" />;
    case 'active':
      return <Loader2 size={13} className="text-emerald-400 animate-spin" />;
    case 'queued':
      return <Clock size={13} className="text-zinc-500" />;
    case 'done':
      return <CheckCircle2 size={13} className="text-emerald-400" />;
    case 'error':
      return <AlertCircle size={13} className="text-red-400" />;
  }
}

interface Props {
  item: DownloadItem;
}

export default function DownloadRow({ item }: Props) {
  const expandedRows = useUnit($expandedRows);
  const isExpanded = expandedRows.has(item.id);
  const canExpand = item.tracks.length > 1;
  const isActive = item.status === 'active' || item.status === 'fetching';
  const isDone = item.status === 'done';
  const { pos, open, close } = useContextMenu();

  const progressColor =
    item.status === 'error'
      ? 'bg-red-500'
      : isDone
      ? 'bg-emerald-500'
      : 'bg-emerald-500';

  const removeItem = () => {
    if (!confirmDownloadRemoval(item)) return;
    removeDownloadFx(item.id);
  };

  return (
    <div className="border-b border-zinc-800 last:border-b-0">
      {/* Main row */}
      <div
        className={`flex items-center gap-0 px-3 py-2 transition-colors group select-none ${
          canExpand ? 'cursor-pointer' : ''
        } ${isExpanded ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/30'}`}
        onClick={() => canExpand && rowToggled(item.id)}
        onContextMenu={open}
      >
        {/* Expand toggle */}
        <div className="w-5 shrink-0 flex items-center justify-center text-zinc-600">
          {canExpand ? (
            isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
          ) : null}
        </div>

        {/* Cover art */}
        <div className="w-9 shrink-0 flex items-center justify-start">
          <div className="w-7 h-7 rounded overflow-hidden bg-zinc-700 flex items-center justify-center shrink-0">
            {item.coverArt ? (
              <img src={item.coverArt} alt="" className="w-full h-full object-cover" />
            ) : (
              <Music2 size={11} className="text-zinc-500" />
            )}
          </div>
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-1.5">
            <StatusDot status={item.status} />
            <span className="text-zinc-200 font-medium truncate text-sm leading-tight">
              {item.name}
            </span>
          </div>
          <div className="text-zinc-600 text-xs mt-0.5 truncate">
            {item.type} &middot; {item.format.toUpperCase()} &middot; {item.quality === 'auto' ? 'auto' : `${item.quality} kbps`}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-44 shrink-0 pr-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-500 font-mono tabular-nums">{item.progress}%</span>
          </div>
          <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
              style={{ width: `${item.progress}%` }}
            />
          </div>
        </div>

        {/* Speed */}
        <div className="w-24 shrink-0 text-right font-mono text-xs text-zinc-500 tabular-nums">
          {isActive && item.speed && item.speed > 0 ? fmtSpeed(item.speed) : isDone ? '—' : ''}
        </div>

        {/* ETA */}
        <div className="w-16 shrink-0 text-right font-mono text-xs text-zinc-500 tabular-nums">
          {isActive && item.eta ? fmtEta(item.eta) : ''}
        </div>

        {/* Track count */}
        <div className="w-20 shrink-0 text-right font-mono text-xs tabular-nums">
          <span className="text-zinc-400">{item.completedTracks}</span>
          <span className="text-zinc-600">/{item.totalTracks}</span>
          {item.failedTracks > 0 && (
            <span className="text-red-500 ml-1">{item.failedTracks}✗</span>
          )}
        </div>

        {/* Remove */}
        <div className="w-7 shrink-0 flex items-center justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeItem();
            }}
            className="w-5 h-5 flex items-center justify-center text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {pos && (
        <ContextMenu
          x={pos.x}
          y={pos.y}
          onClose={close}
          items={[
            {
              label: 'Re-download',
              icon: <RefreshCw size={13} />,
              onClick: () => redownloadFx(item.id),
              disabled: item.status === 'active' || item.status === 'fetching',
            },
            { separator: true },
            {
              label: 'Remove',
              icon: <Trash2 size={13} />,
              onClick: removeItem,
              danger: true,
            },
          ]}
        />
      )}

      {/* Track list */}
      {isExpanded && (
        <div className="bg-zinc-900/60">
          {item.tracks.map((track) => (
            <TrackRow key={track.id} track={track} downloadId={item.id} />
          ))}
        </div>
      )}
    </div>
  );
}
