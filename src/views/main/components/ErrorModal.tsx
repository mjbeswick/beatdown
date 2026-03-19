import { useEffect } from 'react';
import { useUnit } from 'effector-react';
import { AlertCircle, X } from 'lucide-react';
import { $addStatus, addPhaseSet } from '../stores/downloads';

export default function ErrorModal() {
  const addStatus = useUnit($addStatus);
  const isOpen = addStatus.phase === 'error' && !!addStatus.message;

  const dismiss = () => addPhaseSet({ phase: 'idle' });

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={dismiss}
    >
      <div
        className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl w-full max-w-md mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 text-red-400">
            <AlertCircle size={18} />
            <span className="font-semibold text-base">Download Failed</span>
          </div>
          <button onClick={dismiss} className="text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5">
            <X size={16} />
          </button>
        </div>
        <p className="text-zinc-300 text-sm leading-relaxed">{addStatus.message}</p>
        <div className="mt-5 flex justify-end">
          <button
            onClick={dismiss}
            className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium px-4 py-1.5 rounded transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
