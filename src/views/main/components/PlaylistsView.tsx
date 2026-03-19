import { useUnit } from 'effector-react';
import DownloadList from './DownloadList';
import { $search } from '../stores/downloads';

export default function PlaylistsView() {
  const search = useUnit($search);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Column labels */}
      <div className="shrink-0 bg-zinc-800/95 border-b border-zinc-700 flex items-center px-3 py-1.5 text-xs text-zinc-600 font-medium uppercase tracking-wide select-none">
        <div className="w-5 shrink-0" />
        <div className="w-9 shrink-0" />
        <div className="flex-1 min-w-0">Name</div>
        <div className="w-44 shrink-0 text-right pr-1">Progress</div>
        <div className="w-24 shrink-0 text-right">Speed</div>
        <div className="w-16 shrink-0 text-right">ETA</div>
        <div className="w-20 shrink-0 text-right">Tracks</div>
        <div className="w-7 shrink-0" />
      </div>

      <DownloadList searchQuery={search} />
    </div>
  );
}
