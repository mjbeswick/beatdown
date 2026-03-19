import { useEffect, useRef, useState } from 'react';
import { useUnit } from 'effector-react';
import { rpc } from '../rpc';
import { $player } from '../stores/player';
import type { LyricLine } from '../../../shared/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function LyricsPanel({ isOpen, onClose }: Props) {
  const player = useUnit($player);
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const [loading, setLoading] = useState(false);
  const activeRef = useRef<HTMLDivElement>(null);

  // Fetch lyrics when current track changes
  useEffect(() => {
    const track = player.current;
    if (!track || !isOpen) return;

    const artist = track.track.artist;
    const title = track.track.title;

    setLoading(true);
    setLyrics(null);

    rpc.proxy.request['lyrics:get']({ artist, title })
      .then((lines) => setLyrics(lines))
      .catch(() => setLyrics(null))
      .finally(() => setLoading(false));
  }, [player.current, isOpen]);

  // Scroll active line into view
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [player.currentTime]);

  const getActiveLine = () => {
    if (!lyrics) return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= player.currentTime) idx = i;
      else break;
    }
    return idx;
  };

  const activeLine = getActiveLine();

  return (
    <div
      className={`absolute inset-y-0 right-0 w-72 flex flex-col bg-zinc-800/98 border-l border-zinc-700/60 z-20 transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/60 shrink-0">
        <span className="text-zinc-300 text-sm font-medium">Lyrics</span>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg leading-none"
          aria-label="Close lyrics"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {loading && (
          <p className="text-zinc-600 text-sm text-center mt-8">Loading…</p>
        )}

        {!loading && !lyrics && player.current && (
          <p className="text-zinc-600 text-sm text-center mt-8">No lyrics found</p>
        )}

        {!loading && !player.current && (
          <p className="text-zinc-600 text-sm text-center mt-8">Play a track to see lyrics</p>
        )}

        {lyrics &&
          lyrics.map((line, i) => {
            const isActive = i === activeLine;
            return (
              <div
                key={i}
                ref={isActive ? activeRef : undefined}
                className={`text-sm leading-relaxed transition-colors duration-200 ${
                  isActive
                    ? 'text-white font-medium scale-105 origin-left'
                    : i < activeLine
                    ? 'text-zinc-600'
                    : 'text-zinc-400'
                }`}
              >
                {line.text || '\u00a0'}
              </div>
            );
          })}
      </div>
    </div>
  );
}
