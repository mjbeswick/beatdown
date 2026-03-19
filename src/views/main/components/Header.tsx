import { useUnit } from 'effector-react';
import { Search, X } from 'lucide-react';
import { rpc } from '../rpc';
import { $search, searchChanged, fetchPreviewFx } from '../stores/downloads';
import { $nav } from '../stores/nav';

function isUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://');
}

export default function Header() {
  const search = useUnit($search);
  const nav = useUnit($nav);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = search.trim();
    if (!trimmed) return;
    if (isUrl(trimmed)) {
      fetchPreviewFx(trimmed);
      searchChanged('');
    }
  };

  return (
    <header
      className="bg-zinc-800 border-b border-zinc-700 flex items-center shrink-0 h-12 relative"
      style={{ WebkitAppRegion: 'drag', WebkitUserSelect: 'none', cursor: 'default' } as React.CSSProperties}
      onDoubleClick={() => rpc.proxy.request['window:zoom'](undefined as any)}
    >
      {/* Left spacer to clear macOS traffic light buttons (~80px) */}
      <div className="w-20 shrink-0" />

      {/* Search — centered in the title bar, only on playlists view */}
      {nav === 'playlists' && (
        <form
          onSubmit={handleSubmit}
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 w-[480px] bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1 focus-within:border-zinc-500"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Search size={12} className="text-zinc-500 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => searchChanged(e.target.value)}
            placeholder="Search downloads or paste a Spotify URL…"
            className="flex-1 min-w-0 bg-transparent text-sm placeholder:text-zinc-600 text-zinc-300 outline-none"
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
