import { useUnit } from 'effector-react';
import { $stats } from '../stores/downloads';
import { fmtSpeed } from './DownloadRow';

export default function StatusBar() {
  const stats = useUnit($stats);

  return (
    <footer className="bg-zinc-800 border-t border-zinc-700 px-4 py-1 flex items-center gap-3 text-xs text-zinc-600 font-mono shrink-0 h-7 tabular-nums">
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
    </footer>
  );
}
