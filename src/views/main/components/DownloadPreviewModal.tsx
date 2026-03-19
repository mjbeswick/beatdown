import { useUnit } from 'effector-react';
import { X, Download, Music2, Disc3, ListMusic, Loader2, AlertCircle } from 'lucide-react';
import { $preview, previewClosed, addDownloadFx } from '../stores/downloads';
import { usePersistedState } from '../hooks/usePersistedState';
import type { AudioFormat, QualityPreset } from '../../../shared/types';

const TYPE_LABEL: Record<string, string> = {
  track: 'Track',
  album: 'Album',
  playlist: 'Playlist',
};

const TYPE_ICON: Record<string, React.ElementType> = {
  track: Music2,
  album: Disc3,
  playlist: ListMusic,
};

export default function DownloadPreviewModal() {
  const preview = useUnit($preview);
  const [format] = usePersistedState<AudioFormat>('reel:format', 'm4a');
  const [quality] = usePersistedState<QualityPreset>('reel:quality', 'auto');

  if (!preview) return null;

  const handleDownload = () => {
    if (preview.phase !== 'ready') return;
    addDownloadFx({ url: preview.url, format, quality });
  };

  const TypeIcon = preview.phase === 'ready' ? (TYPE_ICON[preview.data.type] ?? Music2) : Music2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => previewClosed()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative z-10 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-96 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={() => previewClosed()}
          className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 transition-colors z-10"
        >
          <X size={16} />
        </button>

        {/* Loading state */}
        {preview.phase === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6">
            <Loader2 size={28} className="text-emerald-400 animate-spin" />
            <p className="text-zinc-400 text-sm">Fetching details…</p>
          </div>
        )}

        {/* Error state */}
        {preview.phase === 'error' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <AlertCircle size={28} className="text-red-400" />
            <p className="text-zinc-300 text-sm font-medium">Couldn't load details</p>
            <p className="text-zinc-500 text-xs">{preview.message}</p>
            <button
              onClick={() => previewClosed()}
              className="mt-2 px-4 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Ready state */}
        {preview.phase === 'ready' && (() => {
          const { data } = preview;
          const Icon = TypeIcon;
          return (
            <>
              {/* Cover art */}
              <div className="w-full aspect-square bg-zinc-800 flex items-center justify-center overflow-hidden">
                {data.coverArt ? (
                  <img src={data.coverArt} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Icon size={64} className="text-zinc-600" />
                )}
              </div>

              {/* Details */}
              <div className="p-5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={11} className="text-zinc-500" />
                  <span className="text-zinc-500 text-xs uppercase tracking-wide">
                    {TYPE_LABEL[data.type] ?? data.type}
                  </span>
                </div>
                <h2 className="text-zinc-100 text-base font-semibold leading-snug mb-1 truncate">
                  {data.name}
                </h2>
                <p className="text-zinc-500 text-xs mb-5">
                  {data.tracks.length} {data.tracks.length === 1 ? 'track' : 'tracks'}
                  {' · '}{format.toUpperCase()}{' · '}{quality === 'auto' ? 'Auto quality' : quality + ' kbps'}
                </p>

                <button
                  onClick={handleDownload}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Download size={14} />
                  Download
                </button>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
