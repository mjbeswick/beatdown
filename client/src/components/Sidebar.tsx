import { useUnit } from 'effector-react';
import { ListMusic, Mic2, Tag, Settings } from 'lucide-react';
import { $nav, navChanged } from '../stores/nav';
import type { NavSection } from '../stores/nav';

const NAV: { key: NavSection; label: string; Icon: React.ElementType }[] = [
  { key: 'playlists', label: 'Playlists', Icon: ListMusic },
  { key: 'artists', label: 'Artists', Icon: Mic2 },
  { key: 'genres', label: 'Genres', Icon: Tag },
];

export default function Sidebar() {
  const nav = useUnit($nav);

  return (
    <aside className="w-40 bg-zinc-800/60 border-r border-zinc-700 shrink-0 pt-1 flex flex-col">
      <div className="flex-1">
        {NAV.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => navChanged(key)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-none ${
              nav === key
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/40'
            }`}
          >
            <Icon size={13} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div>
        <button
          onClick={() => navChanged('settings')}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-none ${
            nav === 'settings'
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/40'
          }`}
        >
          <Settings size={13} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
