import { useUnit } from 'effector-react';
import { useState, useRef, useEffect } from 'react';
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
  Cast,
  Loader2,
  Heart,
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
import { $cast, devicesDiscovered, discoveringStarted, deviceSelected } from '../stores/cast';
import { navToAlbum, navToArtist } from '../stores/nav';
import { $favourites, toggleFavourite } from '../stores/favourites';
import { rpc } from '../rpc';
// Ensure audio engine is initialized
import '../audio/engine';

interface Props {
  onLyricsToggle: () => void;
  lyricsOpen: boolean;
}

export default function PlayerPanel({ onLyricsToggle, lyricsOpen }: Props) {
  const player = useUnit($player);
  const cast = useUnit($cast);
  const favourites = useUnit($favourites);
  const [castOpen, setCastOpen] = useState(false);
  const castRef = useRef<HTMLDivElement>(null);

  // Close the cast popover when clicking outside
  useEffect(() => {
    if (!castOpen) return;
    const handler = (e: MouseEvent) => {
      if (castRef.current && !castRef.current.contains(e.target as Node)) {
        setCastOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [castOpen]);

  const handleCastClick = async () => {
    if (cast.isCasting) {
      // Already casting — toggle the popover to show stop option
      setCastOpen((v) => !v);
      return;
    }
    setCastOpen(true);
    discoveringStarted();
    try {
      const devices = await rpc.proxy.request['cast:discover'](undefined as any);
      devicesDiscovered(devices);
    } catch {
      devicesDiscovered([]);
    }
  };

  const handleSelectDevice = async (device: import('../stores/cast').DLNADevice) => {
    deviceSelected(device);
    setCastOpen(false);
    if (player.current?.track.filePath) {
      try {
        await rpc.proxy.request['cast:start']({
          deviceId: device.id,
          streamPath: player.current.track.filePath,
          title: player.current.track.title,
          artist: player.current.track.artist,
        });
      } catch {}
    }
  };

  const handleStopCasting = async () => {
    if (cast.activeDevice) {
      try { await rpc.proxy.request['cast:stop']({ deviceId: cast.activeDevice.id }); } catch {}
    }
    deviceSelected(null);
    setCastOpen(false);
  };

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
        <button
          onClick={() => toggleFavourite(player.current!.track.id)}
          className={`shrink-0 transition-colors ${
            favourites.includes(player.current.track.id)
              ? 'text-rose-500'
              : 'text-zinc-600 hover:text-zinc-300'
          }`}
          title={favourites.includes(player.current.track.id) ? 'Remove from favourites' : 'Add to favourites'}
        >
          <Heart
            size={13}
            className={favourites.includes(player.current.track.id) ? 'fill-rose-500' : ''}
          />
        </button>
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

      {/* Volume + lyrics + cast */}
      <div className="flex items-center gap-2 w-36 justify-end shrink-0">
        <button
          onClick={() => setVolume(player.volume > 0 ? 0 : (player.lastVolume || 0.8))}
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
          disabled={cast.isCasting}
          className={`w-18 h-1 appearance-none rounded-full volume-slider ${
            cast.isCasting ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
          }`}
          style={{ '--progress': `${player.volume * 100}%`, width: '72px' } as React.CSSProperties}
          title={cast.isCasting ? 'Local volume disabled while casting' : 'Volume'}
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

        {/* Cast button + popover */}
        <div className="relative shrink-0" ref={castRef}>
          <button
            onClick={handleCastClick}
            className={`transition-colors ${
              cast.isCasting ? 'text-emerald-500' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title={cast.isCasting ? `Casting to ${cast.activeDevice?.name}` : 'Cast to device'}
          >
            <Cast size={14} />
          </button>

          {castOpen && (
            <div className="absolute bottom-8 right-0 w-52 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50">
              {cast.isCasting ? (
                <>
                  <div className="px-3 py-1.5 text-[11px] text-zinc-400 border-b border-zinc-700">
                    Casting to <span className="text-zinc-200">{cast.activeDevice?.name}</span>
                  </div>
                  <button
                    onClick={handleStopCasting}
                    className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-zinc-700 transition-colors"
                  >
                    Stop casting
                  </button>
                </>
              ) : cast.isDiscovering ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-400">
                  <Loader2 size={12} className="animate-spin" />
                  Scanning for devices…
                </div>
              ) : cast.devices.length === 0 ? (
                <div className="px-3 py-2 text-xs text-zinc-500">No devices found</div>
              ) : (
                <>
                  <div className="px-3 py-1 text-[11px] text-zinc-500">Select a device</div>
                  {cast.devices.map((device) => (
                    <button
                      key={device.id}
                      onClick={() => handleSelectDevice(device)}
                      className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors truncate"
                      title={device.name}
                    >
                      {device.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
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
