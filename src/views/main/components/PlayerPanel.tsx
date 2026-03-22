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
  getStreamUrl,
} from '../stores/player';
import { $cast, devicesDiscovered, discoveringStarted, deviceSelected } from '../stores/cast';
import { navToAlbum, navToArtist } from '../stores/nav';
import { $favourites, toggleFavourite } from '../stores/favourites';
import { $appSettings } from '../stores/appSettings';
import { rpc } from '../rpc';
import WaveformSeeker from './WaveformSeeker';
import { getActiveDeck, getAnalyserNode } from '../audio/engine';
import { detectBpm, getCachedBpm, type DetectedBeat } from '../audio/bpmDetector';

// Height of the controls row content (buttons + time display), excluding padding
const CONTROLS_ROW_HEIGHT = 52;
const CONTROLS_ROW_PADDING = 12;
// Regular seeker bar row height — matches the visual track height;
// the thumb overflows via overflow-visible on the container
const REGULAR_SEEKER_HEIGHT = 3;
const WAVEFORM_SEEKER_TOP_PADDING = 12;
const WAVEFORM_SEEKER_SIDE_PADDING = 16;
const VOLUME_SLIDER_WIDTH = 84;
const VOLUME_SLIDER_THUMB_SIZE = 12;
// Half the thumb dot diameter (h-3.5 = 14px) — used to centre translateX on the bar
const THUMB_HALF_PX = 7;
const THUMB_PULSE_MIN_SCALE = 0.88;
const THUMB_PULSE_MAX_BOOST = 0.56;
const THUMB_PULSE_DECAY_RATIO = 0.42;
const THUMB_PULSE_MIN_DECAY_SECS = 0.12;
const THUMB_PULSE_MAX_DECAY_SECS = 0.24;

interface Props {
  onLyricsToggle: () => void;
  lyricsOpen: boolean;
}

function getBeatPulseStrength(currentTime: number, beat: DetectedBeat | null): number {
  if (!beat || !Number.isFinite(currentTime) || !Number.isFinite(beat.bpm) || beat.bpm <= 0) {
    return 0;
  }

  const beatPeriod = 60 / beat.bpm;
  if (!Number.isFinite(beatPeriod) || beatPeriod <= 0) return 0;

  const phase = currentTime - beat.firstBeatOffset;
  if (phase < 0) return 0;

  const beatAge = ((phase % beatPeriod) + beatPeriod) % beatPeriod;
  const decaySecs = Math.min(
    THUMB_PULSE_MAX_DECAY_SECS,
    Math.max(THUMB_PULSE_MIN_DECAY_SECS, beatPeriod * THUMB_PULSE_DECAY_RATIO),
  );

  return Math.exp(-beatAge / decaySecs);
}

export default function PlayerPanel({ onLyricsToggle, lyricsOpen }: Props) {
  const player = useUnit($player);
  const cast = useUnit($cast);
  const favourites = useUnit($favourites);
  const appSettings = useUnit($appSettings);
  const isWaveformSeeker = appSettings.playerSeekerStyle === 'waveform';
  const [castOpen, setCastOpen] = useState(false);
  const castRef = useRef<HTMLDivElement>(null);
  const seekerTooltipRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const isScrubbingRef = useRef(false);
  const scrubRectRef = useRef<DOMRect | null>(null);

  const applyScrubPosition = (progress: number, time: number) => {
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${progress})`;
    if (thumbRef.current) thumbRef.current.style.transform = `translate3d(${progress * seekerWidthRef.current - THUMB_HALF_PX}px, -50%, 0)`;
    if (timeElapsedRef.current) timeElapsedRef.current.textContent = formatTime(time);
    if (rangeRef.current) rangeRef.current.value = String(time);
  };

  // DOM refs for animation — bypasses React re-renders for smooth 60fps updates.
  // fill and thumb are driven by the position RAF loop;
  // thumbDot is driven by the pulse RAF loop (bar fill is never touched by pulse).
  const seekerContainerRef = useRef<HTMLDivElement>(null);
  const seekerWidthRef = useRef(0);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const thumbDotRef = useRef<HTMLDivElement>(null);
  const timeElapsedRef = useRef<HTMLSpanElement>(null);

  // Cache the seeker container width so the RAF loop never reads clientWidth
  // (a read after a style write forces a layout reflow every frame).
  useEffect(() => {
    const el = seekerContainerRef.current;
    if (!el) return;
    seekerWidthRef.current = el.clientWidth;
    const ro = new ResizeObserver(([entry]) => {
      seekerWidthRef.current = entry.contentRect.width;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const playerDurationRef = useRef(player.duration);
  playerDurationRef.current = player.duration;
  const prevTrackIdRef = useRef<string | null | undefined>(player.current?.track.id);
  const rangeRef = useRef<HTMLInputElement>(null);

  const [beatTiming, setBeatTiming] = useState<DetectedBeat | null>(null);

  useEffect(() => {
    if (isWaveformSeeker || !appSettings.playerSeekerBeatPulse) {
      setBeatTiming(null);
      return;
    }

    const track = player.current?.track;
    if (!track?.id || !track.filePath || !player.streamPort) {
      setBeatTiming(null);
      return;
    }

    const cachedBeat = getCachedBpm(track.id);
    setBeatTiming(cachedBeat);
    if (cachedBeat) return;

    let cancelled = false;

    detectBpm(track.id, getStreamUrl(track.filePath, player.streamPort))
      .then((detectedBeat) => {
        if (!cancelled) {
          setBeatTiming(detectedBeat);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBeatTiming(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    appSettings.playerSeekerBeatPulse,
    isWaveformSeeker,
    player.current?.track.id,
    player.current?.track.filePath,
    player.streamPort,
  ]);

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

  // ── Seeker position ───────────────────────────────────────────────────────
  // During playback a CSS linear transition bridges the ~250 ms gaps between
  // timeupdate ticks, giving smooth visual movement with no RAF overhead.
  // Transition is suppressed on track change and while scrubbing so those
  // updates are always instant.
  useEffect(() => {
    if (isWaveformSeeker) return;

    const fill = fillRef.current;
    const thumb = thumbRef.current;
    if (!fill || !thumb) return;

    const trackChanged = player.current?.track.id !== prevTrackIdRef.current;
    prevTrackIdRef.current = player.current?.track.id;

    // While scrubbing, onChange owns all DOM updates — bail out here so
    // timeupdate ticks don't overwrite the dragged position with a stale value.
    if (isScrubbing) return;

    const progress = player.duration > 0
      ? Math.max(0, Math.min(player.currentTime / player.duration, 1))
      : 0;

    fill.style.transition = trackChanged ? 'none' : 'transform 0.25s linear';
    thumb.style.transition = trackChanged ? 'none' : 'transform 0.25s linear';
    fill.style.transform = `scaleX(${progress})`;
    thumb.style.transform = `translate3d(${progress * seekerWidthRef.current - THUMB_HALF_PX}px, -50%, 0)`;
    if (thumb.style.visibility === 'hidden') thumb.style.visibility = 'visible';
    if (timeElapsedRef.current) timeElapsedRef.current.textContent = formatTime(player.currentTime);
    if (rangeRef.current) rangeRef.current.value = String(player.currentTime);
  }, [isWaveformSeeker, isScrubbing, player.currentTime, player.duration, player.current?.track.id]);

  // ── Pulse loop ───────────────────────────────────────────────────────────
  // Drives only the thumb dot (scale + glow). The bar fill is never affected.
  useEffect(() => {
    const resetDot = () => {
      if (thumbDotRef.current) {
        thumbDotRef.current.style.transform = 'scale(1)';
        thumbDotRef.current.style.boxShadow = '';
      }
    };

    if (isWaveformSeeker || !appSettings.playerSeekerBeatPulse || isScrubbing || !player.isPlaying) {
      resetDot();
      return;
    }

    const analyser = beatTiming ? null : getAnalyserNode();
    if (!beatTiming && !analyser) { resetDot(); return; }

    const frequencyData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let raf = 0;
    let smoothedScale = 1;
    let fastBass = 0;
    let slowBass = 0;
    let pulseEnv = 0;
    let priorTransient = 0;
    let lastPulseAt = 0;

    const tick = () => {
      const deck = getActiveDeck();
      const deckTime = deck.currentTime;
      const currentTime = Number.isFinite(deckTime) ? deckTime : player.currentTime;

      if (beatTiming) {
        const pulseStrength = getBeatPulseStrength(currentTime, beatTiming);
        smoothedScale = THUMB_PULSE_MIN_SCALE + Math.min(pulseStrength, 1) * THUMB_PULSE_MAX_BOOST;
      } else if (analyser && frequencyData) {
        analyser.getByteFrequencyData(frequencyData);

        const sampleBins = Math.max(12, Math.min(48, Math.floor(frequencyData.length * 0.14)));
        let weightedEnergy = 0;
        let totalWeight = 0;
        let peakEnergy = 0;
        for (let i = 0; i < sampleBins; i++) {
          const norm = frequencyData[i] / 255;
          const w = 1 - (i / sampleBins) * 0.7;
          weightedEnergy += norm * w;
          totalWeight += w;
          if (norm > peakEnergy) peakEnergy = norm;
        }

        const avg = totalWeight > 0 ? weightedEnergy / totalWeight : 0;
        const bassEnergy = avg * 0.65 + peakEnergy * 0.35;
        fastBass += (bassEnergy - fastBass) * 0.52;
        slowBass += (bassEnergy - slowBass) * 0.05;

        const transient = Math.max(0, fastBass - slowBass * 0.98);
        const normEnergy = Math.max(0, Math.min(1, (transient - 0.012) / 0.11));
        const now = performance.now();
        if (normEnergy > 0.16 && normEnergy > priorTransient * 1.08 && now - lastPulseAt > 60) {
          pulseEnv = Math.max(pulseEnv, 0.48 + normEnergy * 0.9);
          lastPulseAt = now;
        }

        priorTransient += (normEnergy - priorTransient) * 0.28;
        pulseEnv = Math.max(0, pulseEnv * 0.8 - 0.02);

        // Fast attack with a lower resting scale gives a more obvious beat-driven
        // shrink/expand cycle without touching the bar fill.
        const target = THUMB_PULSE_MIN_SCALE + Math.min(pulseEnv, 1) * THUMB_PULSE_MAX_BOOST;
        smoothedScale += (target - smoothedScale) * (target > smoothedScale ? 0.72 : 0.24);
      }

      if (thumbDotRef.current) {
        const strength = Math.max(0, smoothedScale - 1) / (THUMB_PULSE_MIN_SCALE + THUMB_PULSE_MAX_BOOST - 1);
        thumbDotRef.current.style.transform = `scale(${smoothedScale})`;
        thumbDotRef.current.style.boxShadow = `0 0 ${3 + strength * 16}px rgba(52, 211, 153, ${0.1 + strength * 0.48})`;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      resetDot();
    };
  }, [appSettings.playerSeekerBeatPulse, beatTiming, isScrubbing, isWaveformSeeker, player.isPlaying]);

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

  const total = formatTime(player.duration);
  // Initial fill position for first render (RAF takes over immediately after mount).
  const initialProgress = player.duration > 0 ? Math.max(0, Math.min(player.currentTime / player.duration, 1)) : 0;
  const normalizedVolume = Math.max(0, Math.min(player.volume, 1));
  const volumeProgressPct = normalizedVolume * 100;
  const volumeTrackProgressPct = Math.max(
    0,
    Math.min(
      100,
      ((VOLUME_SLIDER_THUMB_SIZE / 2 + normalizedVolume * (VOLUME_SLIDER_WIDTH - VOLUME_SLIDER_THUMB_SIZE)) /
        VOLUME_SLIDER_WIDTH) * 100,
    ),
  );

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
        ref={seekerContainerRef}
        className="relative w-full shrink-0 overflow-visible z-10"
        style={{ height: seekerRowHeight, cursor: isWaveformSeeker ? undefined : 'pointer' }}
        onPointerDown={(e) => {
          if (isWaveformSeeker) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubRectRef.current = e.currentTarget.getBoundingClientRect();
          const progress = Math.max(0, Math.min((e.clientX - scrubRectRef.current.left) / scrubRectRef.current.width, 1));
          const time = progress * (playerDurationRef.current || 0);
          if (fillRef.current) fillRef.current.style.transition = 'none';
          if (thumbRef.current) thumbRef.current.style.transition = 'none';
          applyScrubPosition(progress, time);
          isScrubbingRef.current = true;
          setIsScrubbing(true);
          seek(time);
        }}
        onPointerMove={(e) => {
          if (isWaveformSeeker) return;
          if (isScrubbingRef.current && scrubRectRef.current) {
            const progress = Math.max(0, Math.min((e.clientX - scrubRectRef.current.left) / scrubRectRef.current.width, 1));
            const time = progress * (playerDurationRef.current || 0);
            applyScrubPosition(progress, time);
            seek(time);
          } else {
            // Tooltip
            const rect = scrubRectRef.current ?? e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const t = seekerTooltipRef.current;
            if (t) {
              t.style.left = `${x}px`;
              t.textContent = formatTime(Math.max(0, Math.min(1, x / rect.width)) * (playerDurationRef.current || 0));
              t.style.display = 'block';
            }
          }
        }}
        onPointerUp={(e) => {
          if (isWaveformSeeker || !isScrubbingRef.current) return;
          const rect = scrubRectRef.current ?? e.currentTarget.getBoundingClientRect();
          const progress = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
          seek(progress * (playerDurationRef.current || 0));
          scrubRectRef.current = null;
          isScrubbingRef.current = false;
          setIsScrubbing(false);
        }}
        onPointerCancel={() => {
          scrubRectRef.current = null;
          isScrubbingRef.current = false;
          setIsScrubbing(false);
        }}
        onMouseLeave={() => {
          if (seekerTooltipRef.current) seekerTooltipRef.current.style.display = 'none';
        }}
      >
        <div
          ref={seekerTooltipRef}
          className="absolute bottom-full mb-1.5 -translate-x-1/2 bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-[10px] font-mono px-1.5 py-0.5 rounded shadow-lg pointer-events-none z-50 whitespace-nowrap"
          style={{ display: 'none' }}
        />

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
            {/* Progress fill — CSS transition during playback, instant during scrub */}
            <div
              ref={fillRef}
              className="absolute inset-0 origin-left bg-emerald-500 pointer-events-none will-change-transform"
              style={{ transform: `scaleX(${initialProgress})` }}
            />
            {/* Thumb — CSS transition during playback; pulse RAF drives dot scale/glow */}
            <div
              ref={thumbRef}
              className="absolute left-0 top-1/2 pointer-events-none will-change-transform"
              style={{ transform: `translate3d(-${THUMB_HALF_PX}px, -50%, 0)`, visibility: 'hidden' }}
            >
              <div
                ref={thumbDotRef}
                className="h-3.5 w-3.5 rounded-full bg-emerald-400 shadow-sm will-change-transform"
              />
            </div>
            {/* Hidden range input — keyboard accessibility only */}
            <input
              ref={rangeRef}
              type="range"
              min={0}
              max={player.duration || 0}
              step={1}
              defaultValue={player.currentTime}
              onChange={(e) => {
                const time = parseFloat(e.target.value);
                const progress = playerDurationRef.current > 0 ? Math.max(0, Math.min(time / playerDurationRef.current, 1)) : 0;
                applyScrubPosition(progress, time);
                seek(time);
              }}
              onFocus={() => setIsScrubbing(true)}
              onBlur={() => setIsScrubbing(false)}
              className="absolute inset-0 opacity-0 appearance-none"
              style={{ pointerEvents: 'none' }}
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
            <span ref={timeElapsedRef} className="text-zinc-400">{formatTime(player.currentTime)}</span>
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
          <div
            className={`relative shrink-0 ${cast.isCasting ? 'opacity-40' : ''}`}
            style={{ width: `${VOLUME_SLIDER_WIDTH}px`, height: `${VOLUME_SLIDER_THUMB_SIZE}px` }}
          >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-zinc-700 pointer-events-none" />
            <div
              className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-emerald-500 pointer-events-none"
              style={{ width: `${volumeTrackProgressPct}%` }}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={player.volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              disabled={cast.isCasting}
              className={`absolute inset-0 w-full appearance-none bg-transparent volume-slider ${
                cast.isCasting ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
              style={{ '--progress': `${volumeProgressPct}%` } as React.CSSProperties}
              title={cast.isCasting ? 'Local volume disabled while casting' : 'Volume'}
            />
          </div>
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
