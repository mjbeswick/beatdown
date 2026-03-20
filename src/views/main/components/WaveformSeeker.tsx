import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import ZoomPlugin from 'wavesurfer.js/dist/plugins/zoom.esm.js';
import { useUnit } from 'effector-react';
import { $player, seek, getStreamUrl } from '../stores/player';
import { $appSettings } from '../stores/appSettings';
import { usePersistedState } from '../hooks/usePersistedState';

const SKELETON_HEIGHTS = Array.from(
  { length: 64 },
  (_, i) => 25 + Math.abs(Math.sin(i * 0.45 + 0.3)) * 60,
);

function calcHeight(width: number): number {
  return Math.round(Math.max(80, Math.min(160, width * 0.15)));
}

export default function WaveformSeeker() {
  const player = useUnit($player);
  const { waveformBarWidth, waveformBarGap, waveformBarRadius } = useUnit($appSettings);

  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const loadedTrackId = useRef<string | null>(null);
  const defaultPxPerSecRef = useRef(0);
  const isZoomedRef = useRef(false);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const waveHeightRef = useRef(80);

  // Refs so WaveSurfer event callbacks always see the latest player state
  const playerCurrentTimeRef = useRef(player.currentTime);
  const playerIsPlayingRef = useRef(player.isPlaying);
  playerCurrentTimeRef.current = player.currentTime;
  playerIsPlayingRef.current = player.isPlaying;

  const [zoomMultiplier, setZoomMultiplier] = usePersistedState('reel:waveform-zoom', 1);
  const zoomMultiplierRef = useRef(zoomMultiplier);
  zoomMultiplierRef.current = zoomMultiplier;

  const [waveHeight, setWaveHeight] = useState(80);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fixed-pixel-width container updated only after resize settles — prevents
  // WaveSurfer's internal ResizeObserver from re-rendering on every drag pixel.
  useLayoutEffect(() => {
    const outer = outerRef.current;
    const container = containerRef.current;
    if (!outer || !container) return;

    const applySize = (w: number) => {
      const h = calcHeight(w);
      container.style.width = `${w}px`;
      waveHeightRef.current = h;
      setWaveHeight(h);
      wsRef.current?.setOptions({ height: h });
    };

    applySize(outer.clientWidth);

    const observer = new ResizeObserver(([entry]) => {
      clearTimeout(resizeDebounceRef.current);
      resizeDebounceRef.current = setTimeout(
        () => applySize(Math.round(entry.contentRect.width)),
        150,
      );
    });

    observer.observe(outer);
    return () => {
      observer.disconnect();
      clearTimeout(resizeDebounceRef.current);
    };
  }, []);

  // Recreate WaveSurfer when bar style settings change
  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'rgba(52, 211, 153, 0.28)',
      progressColor: 'rgba(52, 211, 153, 0.88)',
      cursorColor: 'rgba(255, 255, 255, 0.55)',
      cursorWidth: 1,
      barWidth: waveformBarWidth,
      barGap: waveformBarGap,
      barRadius: waveformBarRadius,
      height: waveHeightRef.current,
      normalize: true,
      interact: true,
      autoplay: false,
      // Let WaveSurfer's own timer drive rendering at 60fps — this is what
      // makes the examples smooth. It fires when ws.play() is called.
      autoScroll: true,
      autoCenter: true,
      plugins: [ZoomPlugin.create({ scale: 0.5, maxZoom: 200 })],
    });

    // WaveSurfer plays its own muted audio solely to keep its internal RAF
    // timer alive. The timer calls renderProgress() once per frame (no double-
    // render from seeked events) and drives autoScroll/autoCenter natively.
    ws.setVolume(0);

    ws.on('load', () => { setReady(false); setLoading(true); });

    ws.on('ready', () => {
      const width = containerRef.current?.clientWidth ?? 0;
      const duration = ws.getDuration();
      const defaultPps = duration > 0 ? width / duration : 50;
      defaultPxPerSecRef.current = defaultPps;

      if (zoomMultiplierRef.current > 1) {
        ws.zoom(defaultPps * zoomMultiplierRef.current);
        isZoomedRef.current = true;
      }

      // Sync to the engine's current position before starting playback
      ws.setTime(playerCurrentTimeRef.current);
      if (playerIsPlayingRef.current) {
        ws.play().catch(() => {});
      }

      setReady(true);
      setLoading(false);
    });

    ws.on('error', () => setLoading(false));

    ws.on('zoom', (pxPerSec) => {
      const defaultPps = defaultPxPerSecRef.current;
      isZoomedRef.current = pxPerSec > defaultPps + 1;
      if (defaultPps > 0) {
        setZoomMultiplier(isZoomedRef.current ? pxPerSec / defaultPps : 1);
      }
    });

    // Seek the engine when the user clicks/drags the waveform
    ws.on('interaction', (time) => seek(time));

    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
      loadedTrackId.current = null;
      setReady(false);
      setLoading(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveformBarWidth, waveformBarGap, waveformBarRadius]);

  // Load waveform data when track changes
  useEffect(() => {
    const ws = wsRef.current;
    const { current, streamPort } = player;
    if (!ws || !current || !streamPort || !current.track.filePath) return;
    if (loadedTrackId.current === current.track.id) return;

    loadedTrackId.current = current.track.id;
    isZoomedRef.current = false;
    ws.load(getStreamUrl(current.track.filePath, streamPort)).catch(() => {});
  }, [player.current?.track.id, player.streamPort]);

  // Mirror engine play/pause → WaveSurfer (keeps its internal timer running)
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !ready) return;
    if (player.isPlaying) {
      // Re-sync position in case of pause → seek → resume
      ws.setTime(playerCurrentTimeRef.current);
      ws.play().catch(() => {});
    } else {
      ws.pause();
    }
  }, [player.isPlaying, ready]);

  // Correct drift when the engine seeks (e.g. user drags the seek bar)
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !ready) return;
    if (Math.abs(ws.getCurrentTime() - player.currentTime) > 0.5) {
      ws.setTime(player.currentTime);
    }
  }, [player.currentTime, ready]);

  return (
    <div ref={outerRef} className="w-full relative overflow-hidden">
      {loading && (
        <div className="flex items-end gap-[2px] overflow-hidden" style={{ height: waveHeight }}>
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
        className={`transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
      />
    </div>
  );
}
