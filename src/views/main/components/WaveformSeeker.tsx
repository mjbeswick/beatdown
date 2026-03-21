import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useUnit } from 'effector-react';
import { $player, seek, getStreamUrl } from '../stores/player';
import { $appSettings, getWaveformBarRadius } from '../stores/appSettings';

const SKELETON_HEIGHTS = Array.from(
  { length: 56 },
  (_, i) => 30 + Math.abs(Math.sin(i * 0.52 + 0.4)) * 52,
);

interface Props {
  className?: string;
}

export default function WaveformSeeker({ className = 'w-full min-w-0' }: Props) {
  const player = useUnit($player);
  const {
    waveformHeight,
    waveformBarWidth,
    waveformBarGap,
    waveformBarRadius,
    waveformBarFullRounding,
  } = useUnit($appSettings);
  const barRadius = getWaveformBarRadius({
    waveformBarWidth,
    waveformBarRadius,
    waveformBarFullRounding,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const loadedSourceKeyRef = useRef<string | null>(null);

  // Refs so WaveSurfer event callbacks always see the latest player state
  const playerCurrentTimeRef = useRef(player.currentTime);
  const playerIsPlayingRef = useRef(player.isPlaying);
  playerCurrentTimeRef.current = player.currentTime;
  playerIsPlayingRef.current = player.isPlaying;
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // WaveSurfer scales barWidth/barGap by devicePixelRatio internally but does
    // NOT scale barRadius — compensate so rounding is consistent on retina displays.
    const dpr = window.devicePixelRatio || 1;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'rgba(113, 113, 122, 0.42)',
      progressColor: 'rgba(16, 185, 129, 0.96)',
      cursorWidth: 0,
      barWidth: waveformBarWidth,
      barGap: waveformBarGap,
      barRadius: barRadius * dpr,
      height: waveformHeight,
      normalize: true,
      interact: true,
      dragToSeek: true,
      autoplay: false,
    });

    ws.setVolume(0);

    ws.on('load', () => { setReady(false); setLoading(true); });

    ws.on('ready', () => {
      ws.setTime(playerCurrentTimeRef.current);
      if (playerIsPlayingRef.current) {
        ws.play().catch(() => {});
      }

      setReady(true);
      setLoading(false);
    });

    ws.on('error', () => setLoading(false));
    ws.on('interaction', (time) => seekToTime(time));

    wsRef.current = ws;

    if (player.current?.track.filePath && player.streamPort) {
      const sourceKey = `${player.current.track.id}:${player.streamPort}`;
      loadedSourceKeyRef.current = sourceKey;
      ws.load(getStreamUrl(player.current.track.filePath, player.streamPort)).catch(() => {});
    }

    return () => {
      ws.destroy();
      wsRef.current = null;
      loadedSourceKeyRef.current = null;
      setReady(false);
      setLoading(false);
    };
  }, [waveformBarWidth, waveformBarGap, barRadius, waveformHeight, player.duration]);

  useEffect(() => {
    const ws = wsRef.current;
    const { current, streamPort } = player;
    if (!ws || !current || !streamPort || !current.track.filePath) return;
    const sourceKey = `${current.track.id}:${streamPort}`;
    if (loadedSourceKeyRef.current === sourceKey) return;

    loadedSourceKeyRef.current = sourceKey;
    ws.load(getStreamUrl(current.track.filePath, streamPort)).catch(() => {});
  }, [player.current?.track.id, player.streamPort]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !ready) return;
    if (player.isPlaying) {
      ws.setTime(playerCurrentTimeRef.current);
      ws.play().catch(() => {});
    } else {
      ws.pause();
    }
  }, [player.isPlaying, ready]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !ready) return;
    if (Math.abs(ws.getCurrentTime() - player.currentTime) > 0.35) {
      ws.setTime(player.currentTime);
    }
  }, [player.currentTime, ready]);

  const seekToTime = (nextTime: number) => {
    const duration = player.duration || 0;
    seek(Math.max(0, Math.min(nextTime, duration)));
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = Math.max(1, Math.min(10, Math.floor((player.duration || 0) / 50) || 5));

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault();
        seekToTime(player.currentTime - step);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault();
        seekToTime(player.currentTime + step);
        break;
      case 'Home':
        event.preventDefault();
        seekToTime(0);
        break;
      case 'End':
        event.preventDefault();
        seekToTime(player.duration || 0);
        break;
      default:
        break;
    }
  };

  return (
    <div
      className={`${className} relative overflow-hidden rounded-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/70`}
      style={{ height: waveformHeight }}
      tabIndex={0}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={player.duration || 0}
      aria-valuenow={Math.min(player.currentTime, player.duration || 0)}
      aria-valuetext={`${formatTime(player.currentTime)} of ${formatTime(player.duration)}`}
      onKeyDown={handleKeyDown}
    >
      {loading && (
        <div className="absolute inset-0 flex items-end gap-px overflow-hidden">
          {SKELETON_HEIGHTS.map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-emerald-400/15 rounded-sm animate-pulse"
              style={{ height: `${h}%`, animationDelay: `${(i % 8) * 80}ms` }}
            />
          ))}
        </div>
      )}
      <div
        ref={containerRef}
        className={`h-full w-full transition-opacity duration-200 ${ready ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
      />
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}
