import { useUnit } from 'effector-react';
import { Search, X } from 'lucide-react';
import { rpc } from '../rpc';
import { $search, searchChanged, fetchPreviewFx } from '../stores/downloads';
import { $nav, navChanged } from '../stores/nav';
import type { NavSection } from '../stores/nav';

const NAV_TITLES: Record<NavSection, string> = {
  nowplaying: 'Now Playing',
  playlists: 'Playlists',
  albums: 'Albums',
  artists: 'Artists',
  genres: 'Genres',
  favourites: 'Favourites',
  visualizer: 'Visualizer',
  settings: 'Settings',
};

const NAV_PLACEHOLDER: Partial<Record<NavSection, string>> = {
  nowplaying: 'Filter queue by title…',
  playlists: 'Search or paste a Spotify URL or YouTube Music playlist URL…',
  albums: 'Filter albums…',
  artists: 'Filter artists…',
  favourites: 'Filter favourites…',
};

function isUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://');
}

export default function Header() {
  const search = useUnit($search);
  const nav = useUnit($nav);

  const placeholder = NAV_PLACEHOLDER[nav];
  const showSearch = placeholder !== undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = search.trim();
    if (!trimmed) return;
    if (isUrl(trimmed)) {
      navChanged('playlists');
      fetchPreviewFx(trimmed);
      searchChanged('');
    } else {
      navChanged('playlists');
    }
  };

  return (
    <header
      className="electrobun-webkit-app-region-drag bg-zinc-800/80 border-b border-zinc-700/60 flex items-center shrink-0 h-11 relative"
      style={{ WebkitUserSelect: 'none', cursor: 'default' } as React.CSSProperties}
      onDoubleClick={() => rpc.proxy.request['window:zoom'](undefined as any)}
    >
      {/* Left: traffic-light spacer + view title */}
      <div className="flex items-center gap-3 w-64 shrink-0 pl-20">
        <span className="text-zinc-300 text-sm font-semibold truncate">
          {NAV_TITLES[nav]}
        </span>
      </div>

      {/* Centre: context-sensitive search / URL bar */}
      {showSearch && (
        <form
          onSubmit={handleSubmit}
        className="electrobun-webkit-app-region-no-drag absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 w-[440px] bg-zinc-900/80 border border-zinc-700/80 rounded-md px-2.5 py-1 focus-within:border-zinc-500"
        >
          <Search size={12} className="text-zinc-500 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => searchChanged(e.target.value)}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-transparent text-sm placeholder:text-zinc-600 text-zinc-300 outline-none"
            style={{ WebkitUserSelect: 'text', cursor: 'text' } as React.CSSProperties}
          />
          {search && (
            <button
              type="button"
              onClick={() => searchChanged('')}
              className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
  
            >
              <X size={12} />
            </button>
          )}
        </form>
      )}

      {/* Right spacer */}
      <div className="flex-1" />
    </header>
  );
}
