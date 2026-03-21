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
import { $appSettings } from '../stores/appSettings';
import { rpc } from '../rpc';
import WaveformSeeker from './WaveformSeeker';
// Ensure audio engine is initialized
import '../audio/engine';

// Height of the controls row content (buttons + time display), excluding padding
const CONTROLS_ROW_HEIGHT = 52;
const CONTROLS_ROW_PADDING = 12;
// Regular seeker bar row height — matches the visual track height;
// the thumb overflows via overflow-visible on the container
const REGULAR_SEEKER_HEIGHT = 3;
const WAVEFORM_SEEKER_TOP_PADDING = 12;
const WAVEFORM_SEEKER_SIDE_PADDING = 16;

interface Props {
  onLyricsToggle: () => void;
  lyricsOpen: boolean;
}

export default function PlayerPanel({ onLyricsToggle, lyricsOpen }: Props) {
  const player = useUnit($player);
  const cast = useUnit($cast);
  const favourites = useUnit($favourites);
  const appSettings = useUnit($appSettings);
  const [castOpen, setCastOpen] = useState(false);
  const castRef = useRef<HTMLDivElement>(null);
  const [seekerHover, setSeekerHover] = useState<{ x: number; time: number } | null>(null);

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
  const isWaveformSeeker = appSettings.playerSeekerStyle === 'waveform';

  const seekerRowHeight = isWaveformSeeker
    ? appSettings.waveformHeight + WAVEFORM_SEEKER_TOP_PADDING
    : REGULAR_SEEKER_HEIGHT;

  const playerPanelHeight = CONTROLS_ROW_HEIGHT + CONTROLS_ROW_PADDING * 2 + seekerRowHeight;

  return (
    <div
      className={`shrink-0 bg-zinc-950 flex flex-col z-10 ${isWaveformSeeker ? 'border-t border-zinc-800' : ''}`}
      style={{ height: playerPanelHeight }}
    >
      {/* ── Full-width seeker ──────────────────────────────────────────────── */}
      <div
        className="relative w-full shrink-0 overflow-visible z-10"
        style={{ height: seekerRowHeight }}
        onMouseMove={(e) => {
          if (isWaveformSeeker) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          setSeekerHover({ x: e.clientX - rect.left, time: pct * (player.duration || 0) });
        }}
        onMouseLeave={() => setSeekerHover(null)}
      >
        {seekerHover !== null && (
          <div
            className="absolute bottom-full mb-1.5 -translate-x-1/2 bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-[10px] font-mono px-1.5 py-0.5 rounded shadow-lg pointer-events-none z-50 whitespace-nowrap"
            style={{ left: seekerHover.x }}
          >
            {formatTime(seekerHover.time)}
          </div>
        )}

        {isWaveformSeeker ? (
          <div
            className="h-full box-border"
            style={{
              paddingTop: WAVEFORM_SEEKER_TOP_PADDING,
              paddingInline: WAVEFORM_SEEKER_SIDE_PADDING,
            }}
          >
            <WaveformSeeker className="w-full min-w-0" />
          </div>
        ) : (
          <>
            {/* Track background */}
            <div className="absolute inset-0 bg-zinc-700/50 pointer-events-none" />
            {/* Progress fill */}
            <div
              className="absolute inset-y-0 left-0 bg-emerald-500 pointer-events-none"
              style={{ width: `${progressPct}%` }}
            />
            {/* Thumb — perfectly aligned since it uses the same progressPct */}
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-sm pointer-events-none"
              style={{ left: `${progressPct}%` }}
            />
            {/* Transparent range input — covers the thumb area for native drag */}
            <input
              type="range"
              min={0}
              max={player.duration || 0}
              step={0.1}
              value={player.currentTime}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="absolute left-0 right-0 opacity-0 cursor-pointer appearance-none"
              style={{ top: -5, height: 13, margin: 0 }}
            />
          </>
        )}
      </div>

      {/* ── Controls row ───────────────────────────────────────────────────── */}
      <div
        className="flex-1 grid items-center gap-x-6 px-5"
        style={{
          paddingBlock: CONTROLS_ROW_PADDING,
          gridTemplateColumns: 'minmax(0, 1fr) minmax(24rem, 48rem) minmax(0, 1fr)',
        }}
      >
        {/* Track info */}
        <div className="flex min-w-0 w-full max-w-[24rem] items-center gap-3 justify-self-start">
          <button
            onClick={() => navToAlbum(player.current!.downloadId)}
            className="w-10 h-10 rounded-md bg-zinc-700 flex items-center justify-center shrink-0 overflow-hidden hover:ring-1 hover:ring-violet-500 transition-all"
            title={`Go to album: ${player.current.albumName}`}
          >
            {player.current.coverArt ? (
              <img src={player.current.coverArt} alt="" className="w-full h-full object-cover" />
            ) : (
              <Music2 size={15} className="text-zinc-500" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <button
              onClick={() => navToAlbum(player.current!.downloadId)}
              className="block text-zinc-100 text-[13px] font-medium truncate max-w-full hover:text-emerald-400 transition-colors text-left leading-snug"
              title={player.current.track.title}
            >
              {player.current.track.title}
            </button>
            <button
              onClick={() => navToArtist(player.current!.track.artist)}
              className="block text-zinc-400 text-xs truncate max-w-full hover:text-emerald-400 transition-colors text-left leading-snug"
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
              size={14}
              className={favourites.includes(player.current.track.id) ? 'fill-rose-500' : ''}
            />
          </button>
        </div>

        {/* Playback controls + time */}
        <div className="flex min-w-0 w-full flex-col items-center gap-1">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => toggleShuffle()}
              className={`transition-colors ${
                player.shuffle === 'on' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Shuffle"
            >
              <Shuffle size={15} />
            </button>

            <button
              onClick={() => prev()}
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Previous"
            >
              <SkipBack size={17} />
            </button>

            <button
              onClick={() => togglePlay()}
              className="w-9 h-9 rounded-full bg-white flex items-center justify-center hover:bg-zinc-200 transition-colors shadow-sm"
              title={player.isPlaying ? 'Pause' : 'Play'}
            >
              {player.isPlaying ? (
                <Pause size={15} className="text-black" />
              ) : (
                <Play size={15} className="text-black fill-black ml-0.5" />
              )}
            </button>

            <button
              onClick={() => next()}
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Next"
            >
              <SkipForward size={17} />
            </button>

            <button
              onClick={() => toggleRepeat()}
              className={`transition-colors ${
                player.repeat !== 'off' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title={player.repeat === 'off' ? 'Repeat off' : player.repeat === 'all' ? 'Repeat all' : 'Repeat one'}
            >
              {player.repeat === 'one' ? <Repeat1 size={15} /> : <Repeat size={15} />}
            </button>
          </div>

          {/* Time display */}
          <div className="flex items-center gap-1 text-[10px] tabular-nums font-mono select-none">
            <span className="text-zinc-400">{elapsed}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-600">{total}</span>
          </div>
        </div>

        {/* Volume + lyrics + cast */}
        <div className="flex min-w-0 w-full max-w-[24rem] items-center justify-end gap-2.5 justify-self-end">
          <button
            onClick={() => setVolume(player.volume > 0 ? 0 : (player.lastVolume || 0.8))}
            className="text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
            title={player.volume === 0 ? 'Unmute' : 'Mute'}
          >
            {player.volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={player.volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            disabled={cast.isCasting}
            className={`h-1 appearance-none rounded-full volume-slider ${
              cast.isCasting ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
            }`}
            style={{ '--progress': `${player.volume * 100}%`, width: '84px' } as React.CSSProperties}
            title={cast.isCasting ? 'Local volume disabled while casting' : 'Volume'}
          />
          <button
            onClick={onLyricsToggle}
            className={`transition-colors shrink-0 ${
              lyricsOpen ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Lyrics"
          >
            <Mic2 size={15} />
          </button>

          {/* Cast button + popover */}
          <div className="relative shrink-0" ref={castRef}>
            <button
              onClick={handleCastClick}
              className={`transition-colors ${
                cast.isCasting ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title={cast.isCasting ? `Casting to ${cast.activeDevice?.name}` : 'Cast to device'}
            >
              <Cast size={15} />
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
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
