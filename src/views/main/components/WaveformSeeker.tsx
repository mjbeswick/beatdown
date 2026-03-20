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

// Height scales with available width, clamped to reasonable limits
function calcHeight(width: number): number {
  return Math.round(Math.max(80, Math.min(160, width * 0.15)));
}

export default function WaveformSeeker() {
  const player = useUnit($player);
  const { waveformBarWidth, waveformBarGap, waveformBarRadius } = useUnit($appSettings);

  // outerRef: full-width layout div measured by ResizeObserver
  // containerRef: fixed-pixel-width div that WaveSurfer lives in — only updated after debounce
  //   so WaveSurfer never sees continuous resize, eliminating re-render lag
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const seekingFromWS = useRef(false);
  const loadedTrackId = useRef<string | null>(null);
  const defaultPxPerSecRef = useRef(0);
  const isZoomedRef = useRef(false);
  const isZoomingRef = useRef(false);
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const scrollRafRef = useRef<number | null>(null);
  // Refs for values needed inside resize callback (avoids stale closures)
  const waveHeightRef = useRef(80);
  const currentTimeRef = useRef(0);
  currentTimeRef.current = player.currentTime;

  const [zoomMultiplier, setZoomMultiplier] = usePersistedState('reel:waveform-zoom', 1);
  const zoomMultiplierRef = useRef(zoomMultiplier);
  zoomMultiplierRef.current = zoomMultiplier;

  const [waveHeight, setWaveHeight] = useState(80);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  // Measure container on mount and watch for resizes.
  // WaveSurfer's container width is set as a fixed pixel value updated only after debounce,
  // so WaveSurfer doesn't continuously re-render during panel drags.
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

      // Re-sync scroll position after WaveSurfer re-renders to new width
      if (isZoomedRef.current && wsRef.current) {
        if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = requestAnimationFrame(() => {
          scrollRafRef.current = null;
          const ws = wsRef.current;
          if (!ws) return;
          const duration = ws.getDuration();
          if (duration <= 0) return;
          const progress = currentTimeRef.current / duration;
          const scrollEl = ws.getWrapper().parentElement;
          if (!scrollEl) return;
          scrollEl.scrollLeft = Math.max(0, progress * scrollEl.scrollWidth - scrollEl.clientWidth / 2);
        });
      }
    };

    // Set initial size immediately (synchronous, before first paint)
    applySize(outer.clientWidth);

    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      clearTimeout(resizeDebounceRef.current);
      resizeDebounceRef.current = setTimeout(() => applySize(w), 150);
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
      autoScroll: false,
      autoCenter: false,
      plugins: [
        ZoomPlugin.create({
          scale: 0.5,
          maxZoom: 200,
        }),
      ],
    });

    ws.on('load', () => {
      setReady(false);
      setLoading(true);
    });

    ws.on('ready', () => {
      const width = containerRef.current?.clientWidth ?? 0;
      const duration = ws.getDuration();
      const defaultPps = duration > 0 ? width / duration : 50;
      defaultPxPerSecRef.current = defaultPps;

      if (zoomMultiplierRef.current > 1) {
        ws.zoom(defaultPps * zoomMultiplierRef.current);
        isZoomedRef.current = true;
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
      isZoomingRef.current = true;
      clearTimeout(zoomDebounceRef.current);
      zoomDebounceRef.current = setTimeout(() => {
        isZoomingRef.current = false;
      }, 400);
    });

    ws.on('interaction', (time) => {
      seekingFromWS.current = true;
      seek(time);
      setTimeout(() => { seekingFromWS.current = false; }, 300);
    });

    wsRef.current = ws;

    return () => {
      clearTimeout(zoomDebounceRef.current);
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
      ws.destroy();
      wsRef.current = null;
      loadedTrackId.current = null;
      setReady(false);
      setLoading(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveformBarWidth, waveformBarGap, waveformBarRadius]);

  // Load waveform when track changes
  useEffect(() => {
    const ws = wsRef.current;
    const { current, streamPort } = player;
    if (!ws || !current || !streamPort || !current.track.filePath) return;
    if (loadedTrackId.current === current.track.id) return;

    loadedTrackId.current = current.track.id;
    isZoomedRef.current = false;
    ws.load(getStreamUrl(current.track.filePath, streamPort)).catch(() => {});
  }, [player.current?.track.id, player.streamPort]);

  // Sync cursor and scroll to follow playhead when zoomed
  useEffect(() => {
    if (!ready) return;
    const ws = wsRef.current;
    if (!ws) return;

    if (!seekingFromWS.current) {
      ws.setTime(player.currentTime);
    }

    if (isZoomedRef.current && !isZoomingRef.current) {
      const duration = ws.getDuration();
      if (duration <= 0) return;
      const progress = player.currentTime / duration;
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const scrollEl = ws.getWrapper().parentElement;
        if (!scrollEl) return;
        scrollEl.scrollLeft = Math.max(
          0,
          progress * scrollEl.scrollWidth - scrollEl.clientWidth / 2,
        );
      });
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
