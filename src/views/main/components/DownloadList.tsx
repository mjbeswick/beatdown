import { useUnit } from 'effector-react';
import { $filteredDownloads } from '../stores/downloads';
import DownloadRow from './DownloadRow';
import { Music2 } from 'lucide-react';

export default function DownloadList() {
  const downloads = useUnit($filteredDownloads);

  if (downloads.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Music2 size={40} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-600 text-sm">No downloads</p>
          <p className="text-zinc-700 text-xs mt-1">Paste a Spotify URL to get started</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="sticky top-0 z-10 bg-zinc-800/95 backdrop-blur border-b border-zinc-700 flex items-center px-3 py-1.5 text-xs text-zinc-600 font-medium uppercase tracking-wide select-none">
        <div className="w-5 shrink-0" />
        <div className="w-9 shrink-0" />
        <div className="flex-1 min-w-0">Name</div>
        <div className="w-44 shrink-0 text-right pr-1">Progress</div>
        <div className="w-24 shrink-0 text-right">Speed</div>
        <div className="w-16 shrink-0 text-right">ETA</div>
        <div className="w-20 shrink-0 text-right">Tracks</div>
        <div className="w-7 shrink-0" />
      </div>
      {downloads.map((item) => (
        <DownloadRow key={item.id} item={item} />
      ))}
    </main>
  );
}
