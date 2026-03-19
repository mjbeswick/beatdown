import { useUnit } from 'effector-react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Music2,
  Mic2,
} from 'lucide-react';
import {
  $player,
  togglePlay,
  next,
  prev,
  seek,
  setVolume,
  toggleShuffle,
  toggleRepeat,
} from '../stores/player';
import { navToAlbum, navToArtist } from '../stores/nav';
// Ensure audio engine is initialized
import '../audio/engine';

interface Props {
  onLyricsToggle: () => void;
  lyricsOpen: boolean;
}

export default function PlayerPanel({ onLyricsToggle, lyricsOpen }: Props) {
  const player = useUnit($player);

  if (!player.current) return null;

  const elapsed = formatTime(player.currentTime);
  const total = formatTime(player.duration);
  const progressPct = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;

  return (
    <div className="shrink-0 h-16 bg-zinc-800/70 border-t border-zinc-700/60 flex items-center gap-4 px-4 z-10">
      {/* Track info */}
      <div className="flex items-center gap-2.5 w-52 shrink-0 min-w-0">
        <button
          onClick={() => navToAlbum(player.current!.downloadId)}
          className="w-9 h-9 rounded bg-zinc-700 flex items-center justify-center shrink-0 overflow-hidden hover:ring-1 hover:ring-violet-500 transition-all"
          title={`Go to album: ${player.current.albumName}`}
        >
          {player.current.coverArt ? (
            <img src={player.current.coverArt} alt="" className="w-full h-full object-cover" />
          ) : (
            <Music2 size={14} className="text-zinc-500" />
          )}
        </button>
        <div className="min-w-0">
          <button
            onClick={() => navToAlbum(player.current!.downloadId)}
            className="block text-zinc-200 text-xs font-medium truncate max-w-full hover:text-emerald-500 transition-colors text-left"
            title={player.current.track.title}
          >
            {player.current.track.title}
          </button>
          <button
            onClick={() => navToArtist(player.current!.track.artist)}
            className="block text-zinc-500 text-[11px] truncate max-w-full hover:text-emerald-500 transition-colors text-left"
            title={player.current.track.artist}
          >
            {player.current.track.artist}
          </button>
        </div>
      </div>

      {/* Controls + seeker */}
      <div className="flex-1 flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => toggleShuffle()}
            className={`transition-colors ${
              player.shuffle === 'on' ? 'text-emerald-500' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Shuffle"
          >
            <Shuffle size={14} />
          </button>

          <button
            onClick={() => prev()}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Previous"
          >
            <SkipBack size={16} />
          </button>

          <button
            onClick={() => togglePlay()}
            className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-zinc-200 transition-colors"
            title={player.isPlaying ? 'Pause' : 'Play'}
          >
            {player.isPlaying ? (
              <Pause size={14} className="text-black" />
            ) : (
              <Play size={14} className="text-black fill-black ml-0.5" />
            )}
          </button>

          <button
            onClick={() => next()}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Next"
          >
            <SkipForward size={16} />
          </button>

          <button
            onClick={() => toggleRepeat()}
            className={`transition-colors ${
              player.repeat !== 'off' ? 'text-emerald-500' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title={player.repeat === 'off' ? 'Repeat off' : player.repeat === 'all' ? 'Repeat all' : 'Repeat one'}
          >
            {player.repeat === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}
          </button>
        </div>

        {/* Seeker */}
        <div className="flex items-center gap-2 w-full max-w-md">
          <span className="text-zinc-600 text-[10px] tabular-nums font-mono w-8 text-right shrink-0">
            {elapsed}
          </span>
          <div className="relative flex-1 h-3 flex items-center group">
            <input
              type="range"
              min={0}
              max={player.duration || 0}
              step={0.1}
              value={player.currentTime}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="w-full h-1 appearance-none rounded-full cursor-pointer seeker"
              style={{ '--progress': `${progressPct}%` } as React.CSSProperties}
            />
          </div>
          <span className="text-zinc-600 text-[10px] tabular-nums font-mono w-8 shrink-0">
            {total}
          </span>
        </div>
      </div>

      {/* Volume + lyrics */}
      <div className="flex items-center gap-2 w-36 justify-end shrink-0">
        <button
          onClick={() => setVolume(player.volume > 0 ? 0 : 0.8)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
          title={player.volume === 0 ? 'Unmute' : 'Mute'}
        >
          {player.volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={player.volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-18 h-1 appearance-none rounded-full cursor-pointer volume-slider"
          style={{ '--progress': `${player.volume * 100}%`, width: '72px' } as React.CSSProperties}
          title="Volume"
        />
        <button
          onClick={onLyricsToggle}
          className={`transition-colors shrink-0 ${
            lyricsOpen ? 'text-emerald-500' : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Lyrics"
        >
          <Mic2 size={14} />
        </button>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
