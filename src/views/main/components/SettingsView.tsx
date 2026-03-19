import { FolderOpen, Moon, Sun } from 'lucide-react';
import { usePersistedState } from '../hooks/usePersistedState';
import { useEffect } from 'react';

export default function SettingsView() {
  const [theme, setTheme] = usePersistedState<'dark' | 'light'>('reel:theme', 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', theme === 'light');
  }, [theme]);

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <h2 className="text-zinc-300 text-base font-semibold mb-4">Settings</h2>
      <div className="space-y-3 max-w-lg">
        <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <FolderOpen size={14} className="text-zinc-500" />
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
              Music Library
            </span>
          </div>
          <code className="text-zinc-300 text-sm font-mono">~/Music/Reel/Library/</code>
          <p className="text-zinc-600 text-xs mt-1">Organized by artist: Library/{'{Artist}'}/{'{track}.ext'}</p>
        </div>

        <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <FolderOpen size={14} className="text-zinc-500" />
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
              Playlists
            </span>
          </div>
          <code className="text-zinc-300 text-sm font-mono">~/Music/Reel/Playlists/</code>
          <p className="text-zinc-600 text-xs mt-1">M3U files with relative paths to Library</p>
        </div>

        <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Theme</span>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded text-sm text-zinc-300 transition-colors"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
              {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
            </button>
          </div>
        </div>

        <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Dependencies</span>
          </div>
          <ul className="space-y-1 text-sm text-zinc-400">
            <li><span className="text-zinc-300 font-mono">yt-dlp</span> — audio downloader</li>
            <li><span className="text-zinc-300 font-mono">ffmpeg</span> — audio conversion</li>
          </ul>
          <p className="text-zinc-600 text-xs mt-3">
            Run <code className="text-zinc-500">yt-dlp --update</code> to update the downloader.
          </p>
        </div>

        <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Keyboard Shortcuts</span>
          </div>
          <ul className="space-y-1 text-xs text-zinc-500 font-mono">
            <li><span className="text-zinc-400">Space</span> — Play / Pause</li>
            <li><span className="text-zinc-400">← / →</span> — Seek ±5s (Shift: ±30s)</li>
            <li><span className="text-zinc-400">N</span> — Next track</li>
            <li><span className="text-zinc-400">P</span> — Previous track</li>
            <li><span className="text-zinc-400">M</span> — Mute / Unmute</li>
            <li><span className="text-zinc-400">Cmd+F</span> — Focus URL input</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
