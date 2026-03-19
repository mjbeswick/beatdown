import { useUnit } from 'effector-react';
import { AlertTriangle } from 'lucide-react';
import {
  $closeRequested,
  closeRequestDismissed,
  forceQuitFx,
  cancelCloseFx,
} from '../stores/downloads';

export default function CloseConfirmModal() {
  const closeReq = useUnit($closeRequested);

  if (!closeReq) return null;

  const handleCloseAnyway = async () => {
    await forceQuitFx();
  };

  const handleContinue = async () => {
    await cancelCloseFx();
    closeRequestDismissed();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleContinue}
    >
      <div
        className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl w-full max-w-sm mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 text-amber-400 mb-3">
          <AlertTriangle size={18} />
          <span className="font-semibold text-base">Downloads in Progress</span>
        </div>
        <p className="text-zinc-300 text-sm leading-relaxed mb-5">
          {closeReq.activeCount === 1
            ? '1 download is'
            : `${closeReq.activeCount} downloads are`}{' '}
          still in progress. Closing the app will interrupt them — you can resume when you reopen.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={handleContinue}
            className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium px-4 py-1.5 rounded transition-colors"
          >
            Continue Downloading
          </button>
          <button
            onClick={handleCloseAnyway}
            className="bg-red-700 hover:bg-red-600 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
          >
            Close Anyway
          </button>
        </div>
      </div>
    </div>
  );
}
