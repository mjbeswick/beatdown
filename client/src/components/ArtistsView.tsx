import { useUnit } from 'effector-react';
import { Mic2 } from 'lucide-react';
import { $downloads } from '../stores/downloads';

export default function ArtistsView() {
  const downloads = useUnit($downloads);

  const artistMap = new Map<string, number>();
  for (const item of downloads) {
    for (const track of item.tracks) {
      if (track.status === 'done') {
        artistMap.set(track.artist, (artistMap.get(track.artist) ?? 0) + 1);
      }
    }
  }

  const artists = [...artistMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  if (artists.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Mic2 size={40} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-600 text-sm">No artists yet</p>
          <p className="text-zinc-700 text-xs mt-1">Artists will appear here once tracks are downloaded</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="sticky top-0 z-10 bg-zinc-800/95 backdrop-blur border-b border-zinc-700 flex items-center px-4 py-1.5 text-xs text-zinc-600 font-medium uppercase tracking-wide select-none">
        <div className="flex-1">Artist</div>
        <div className="w-20 text-right">Tracks</div>
      </div>
      {artists.map(([artist, count]) => (
        <div
          key={artist}
          className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 text-zinc-400 text-xs font-medium">
            {artist.charAt(0).toUpperCase()}
          </div>
          <span className="flex-1 text-zinc-300 text-sm">{artist}</span>
          <span className="text-zinc-500 text-xs font-mono tabular-nums">{count}</span>
        </div>
      ))}
    </main>
  );
}
