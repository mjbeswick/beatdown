import { useUnit } from 'effector-react';
import { $stats, retryAllFailedFx } from '../stores/downloads';
import { fmtSpeed } from './DownloadRow';
import { $player } from '../stores/player';
import { RefreshCw } from 'lucide-react';

export default function StatusBar() {
  const stats = useUnit($stats);
  const player = useUnit($player);
  const hasPlayer = !!player.current;

  return (
    <footer
      className={`bg-zinc-950 border-t border-zinc-800 px-4 py-1 flex items-center gap-3 text-xs text-zinc-500 font-mono shrink-0 tabular-nums transition-all ${
        hasPlayer ? 'h-7 opacity-0 pointer-events-none' : 'h-7'
      }`}
    >
      <span>
        {stats.total} {stats.total === 1 ? 'item' : 'items'}
      </span>

      {stats.active > 0 && (
        <>
          <span className="text-zinc-700">·</span>
          <span className="text-emerald-500">{stats.active} active</span>
        </>
      )}

      {stats.done > 0 && (
        <>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-500">{stats.done} done</span>
        </>
      )}

      {stats.error > 0 && (
        <>
          <span className="text-zinc-700">·</span>
          <span className="text-red-500">{stats.error} failed</span>
        </>
      )}

      {stats.totalSpeed > 0 && (
        <>
          <span className="text-zinc-700">·</span>
          <span className="text-emerald-500">↓ {fmtSpeed(stats.totalSpeed)}</span>
        </>
      )}

      {stats.failedTracks > 0 && (
        <>
          <span className="text-zinc-700">·</span>
          <button
            onClick={() => retryAllFailedFx()}
            className="flex items-center gap-1 text-amber-500 hover:text-amber-400 transition-colors cursor-pointer"
          >
            <RefreshCw size={10} />
            Retry {stats.failedTracks} failed track{stats.failedTracks !== 1 ? 's' : ''}
          </button>
        </>
      )}
    </footer>
  );
}
