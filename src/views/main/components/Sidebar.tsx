import { useUnit } from 'effector-react';
import { ListMusic, Disc3, Mic2, Tag, Heart, AudioWaveform, Settings, Headphones } from 'lucide-react';
import { $nav, navChanged } from '../stores/nav';
import type { NavSection } from '../stores/nav';
import { $player } from '../stores/player';

const LIBRARY_NAV: { key: NavSection; label: string; Icon: React.ElementType }[] = [
  { key: 'playlists', label: 'Playlists', Icon: ListMusic },
  { key: 'albums', label: 'Albums', Icon: Disc3 },
  { key: 'artists', label: 'Artists', Icon: Mic2 },
  { key: 'genres', label: 'Genres', Icon: Tag },
  { key: 'favourites', label: 'Favourites', Icon: Heart },
  { key: 'visualizer', label: 'Visualizer', Icon: AudioWaveform },
];

export default function Sidebar() {
  const nav = useUnit($nav);
  const player = useUnit($player);
  const isPlaying = !!player.current;

  return (
    <aside className="w-52 bg-zinc-950 border-r border-zinc-800 shrink-0 flex flex-col select-none pt-3 pb-4">
      {/* Now Playing */}
      <div className="px-3">
        <button
          onClick={() => navChanged('nowplaying')}
          className={`w-full flex items-center gap-2 px-2 py-1 text-sm rounded-md transition-colors ${
            nav === 'nowplaying'
              ? 'bg-zinc-800 text-zinc-100 font-medium'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70'
          }`}
        >
          <Headphones size={14} className={`shrink-0 ${isPlaying && nav !== 'nowplaying' ? 'text-emerald-400' : ''}`} />
          <span>Now Playing</span>
          {isPlaying && nav !== 'nowplaying' && (
            <span className="ml-auto flex gap-px items-end h-3">
              <span className="w-0.5 rounded-full bg-emerald-400 animate-[soundbar_0.8s_ease-in-out_infinite_0ms]" style={{ height: '40%' }} />
              <span className="w-0.5 rounded-full bg-emerald-400 animate-[soundbar_0.8s_ease-in-out_infinite_200ms]" style={{ height: '100%' }} />
              <span className="w-0.5 rounded-full bg-emerald-400 animate-[soundbar_0.8s_ease-in-out_infinite_100ms]" style={{ height: '70%' }} />
            </span>
          )}
        </button>
      </div>

      {/* Divider */}
      <div className="mx-4 mt-3 border-t border-zinc-800" />

      {/* Library section */}
      <div className="flex-1 px-3 py-3 overflow-y-auto">
        <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Library
        </p>
        {LIBRARY_NAV.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => navChanged(key)}
            className={`w-full flex items-center gap-2 px-2 py-1 text-sm rounded-md transition-colors ${
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
      <div className="px-3 pt-2">
        <button
          onClick={() => navChanged('settings')}
          className={`w-full flex items-center gap-2 px-2 py-1 text-sm rounded-md transition-colors ${
            nav === 'settings'
              ? 'bg-zinc-800 text-zinc-100 font-medium'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70'
          }`}
        >
          <Settings size={14} className="shrink-0" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
