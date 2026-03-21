import { useUnit } from 'effector-react';
import { $filteredDownloads, $showResumeBanner, resumeBannerDismissed, resumeInterruptedFx } from '../stores/downloads';
import { createFuzzySearchMatcher } from '../lib/search';
import DownloadRow from './DownloadRow';
import { Music2, RefreshCw, X } from 'lucide-react';

interface Props {
  searchQuery?: string;
}

export default function DownloadList({ searchQuery = '' }: Props) {
  const allDownloads = useUnit($filteredDownloads);
  const showResumeBanner = useUnit($showResumeBanner);
  const matchesSearch = createFuzzySearchMatcher(searchQuery);
  const downloads = allDownloads.filter((d) => matchesSearch(d.name));

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {showResumeBanner && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-900/40 border-b border-amber-700/50 text-sm shrink-0">
          <RefreshCw size={14} className="text-amber-400 shrink-0" />
          <span className="text-amber-200 flex-1">
            Some downloads were interrupted. Resume them?
          </span>
          <button
            onClick={() => resumeInterruptedFx()}
            className="text-xs font-medium bg-amber-700 hover:bg-amber-600 text-white px-3 py-1 rounded transition-colors"
          >
            Resume
          </button>
          <button
            onClick={() => resumeBannerDismissed()}
            className="text-amber-500 hover:text-amber-300 transition-colors"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {downloads.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Music2 size={40} className="mx-auto mb-3 text-zinc-700" />
            <p className="text-zinc-600 text-sm">{searchQuery ? 'No matches' : 'No downloads'}</p>
            <p className="text-zinc-700 text-xs mt-1">
              {searchQuery ? 'Try a different search' : 'Paste a Spotify URL or YouTube Music playlist URL to get started'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {downloads.map((item) => (
            <DownloadRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}
