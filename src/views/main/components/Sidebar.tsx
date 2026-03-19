import { useUnit } from 'effector-react';
import { ListMusic, Disc3, Mic2, Tag, AudioWaveform, Settings } from 'lucide-react';
import { $nav, navChanged } from '../stores/nav';
import type { NavSection } from '../stores/nav';

const LIBRARY_NAV: { key: NavSection; label: string; Icon: React.ElementType }[] = [
  { key: 'playlists', label: 'Playlists', Icon: ListMusic },
  { key: 'albums', label: 'Albums', Icon: Disc3 },
  { key: 'artists', label: 'Artists', Icon: Mic2 },
  { key: 'genres', label: 'Genres', Icon: Tag },
  { key: 'visualizer', label: 'Visualizer', Icon: AudioWaveform },
];

export default function Sidebar() {
  const nav = useUnit($nav);

  return (
    <aside className="w-52 bg-zinc-800/50 border-r border-zinc-700/60 shrink-0 flex flex-col select-none">
      {/* Library section */}
      <div className="flex-1 pt-3 pb-1 overflow-y-auto">
        <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Library
        </p>
        {LIBRARY_NAV.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => navChanged(key)}
            className={`w-full flex items-center gap-2.5 px-4 py-1.5 text-sm transition-colors ${
              nav === key
                ? 'bg-zinc-700/70 text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/30'
            }`}
          >
            <Icon size={14} className="shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Bottom: Settings */}
      <div className="border-t border-zinc-700/60 py-1">
        <button
          onClick={() => navChanged('settings')}
          className={`w-full flex items-center gap-2.5 px-4 py-1.5 text-sm transition-colors ${
            nav === 'settings'
              ? 'bg-zinc-700/70 text-zinc-100 font-medium'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/30'
          }`}
        >
          <Settings size={14} className="shrink-0" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
