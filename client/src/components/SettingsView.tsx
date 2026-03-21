import { FolderOpen, Trash2 } from 'lucide-react';
import { usePersistedState } from '../hooks/usePersistedState';
import { getConfirmDeleteActionsKey } from '../lib/destructiveActionConfirm';

export default function SettingsView() {
  const [confirmDeleteActions, setConfirmDeleteActions] = usePersistedState(
    getConfirmDeleteActionsKey(),
    true
  );

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <h2 className="text-zinc-300 text-base font-semibold mb-4">Settings</h2>
      <div className="space-y-3 max-w-lg">
        <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <FolderOpen size={14} className="text-zinc-500" />
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
              Output Directory
            </span>
          </div>
          <code className="text-zinc-300 text-sm font-mono">~/Music/Reel</code>
        </div>
        <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
              Dependencies
            </span>
          </div>
          <ul className="space-y-1 text-sm text-zinc-400">
            <li>
              <span className="text-zinc-300 font-mono">yt-dlp</span> — audio downloader
            </li>
            <li>
              <span className="text-zinc-300 font-mono">ffmpeg</span> — audio conversion
            </li>
          </ul>
          <p className="text-zinc-600 text-xs mt-3">
            Run <code className="text-zinc-500">yt-dlp --update</code> to update the downloader.
          </p>
        </div>
        <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-4 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Trash2 size={14} className="text-zinc-500" />
              <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
                Delete Confirmations
              </span>
            </div>
            <p className="text-zinc-300 text-sm">Confirm before deleting tracks or playlists</p>
          </div>
          <input
            type="checkbox"
            checked={confirmDeleteActions}
            onChange={(event) => setConfirmDeleteActions(event.target.checked)}
            className="h-4 w-4 accent-emerald-500 cursor-pointer shrink-0"
          />
        </div>
      </div>
    </main>
  );
}
