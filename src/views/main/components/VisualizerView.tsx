import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useUnit } from 'effector-react';
import {
  AudioWaveform,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Heart,
  Maximize,
  Minimize,
  Settings,
} from 'lucide-react';
import { $player } from '../stores/player';
import {
  $visualizerSettings,
  setVisualizerAutoCycle,
  setVisualizerBlendSeconds,
  setVisualizerCycleOrder,
  setVisualizerCycleSeconds,
  setVisualizerFps,
  setVisualizerOnlyFavourites,
  setVisualizerPresetPreference,
  setVisualizerPresetName,
  setVisualizerShowTrackChangeOverlay,
  setVisualizerTrackChangeOverlaySeconds,
  setVisualizerChangePresetOnTrackChange,
} from '../stores/visualizer';
import type { VisualizerFps } from '../stores/visualizer';
import { getAnalyserNode, getAudioContext } from '../audio/engine';
import {
  getAdjacentVisualizerPresetName,
  getButterchurnLibrary,
  getNextAutoCyclePresetName,
  getVisualizerPresetLabel,
  getVisualizerPresetPreference,
  getVisualizerRenderOptions,
  loadVisualizerPresetById,
  loadVisualizerPresetCatalog,
} from '../lib/visualizer';

const OVERLAY_IDLE_MS = 2200;
const MAX_PRESET_HISTORY = 100;

type PresetHistoryMode = 'none' | 'reset' | 'push' | 'back' | 'forward';

export default function VisualizerView() {
  const [player, visualizerSettings] = useUnit([$player, $visualizerSettings]);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const presetNamesRef = useRef<string[]>([]);
  const presetIdxRef = useRef(0);
  const presetHistoryRef = useRef<string[]>([]);
  const presetHistoryIdxRef = useRef(-1);
  const presetLoadSeqRef = useRef(0);
  const presetTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Mutable config kept in refs so callbacks never go stale
  const presetNameRef = useRef(visualizerSettings.presetName);
  const autoCycleRef = useRef(visualizerSettings.autoCycle);
  const cycleSecsRef = useRef(visualizerSettings.cycleSeconds);
  const blendSecsRef = useRef(visualizerSettings.blendSeconds);
  const qualityRef = useRef(visualizerSettings.quality);
  const fxaaRef = useRef(visualizerSettings.fxaa);
  const meshDensityRef = useRef(visualizerSettings.meshDensity);
  const fpsRef = useRef(visualizerSettings.fps);
  const presetPreferencesRef = useRef(visualizerSettings.presetPreferences);
  const cycleOrderRef = useRef(visualizerSettings.cycleOrder);
  const onlyFavouritesRef = useRef(visualizerSettings.onlyFavourites);
  const showTrackChangeOverlayRef = useRef(visualizerSettings.showTrackChangeOverlay);
  const trackChangeOverlaySecondsRef = useRef(visualizerSettings.trackChangeOverlaySeconds);
  const changePresetOnTrackChangeRef = useRef(visualizerSettings.changePresetOnTrackChange);

  // Track-change overlay
  const trackOverlayTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const prevTrackIdRef = useRef<string | null>(null);

  // React state for rendering
  const [presetNames, setPresetNames] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showTrackOverlay, setShowTrackOverlay] = useState(false);

  const butterchurn = getButterchurnLibrary();
  const currentPresetName =
    presetNames[currentIdx] ??
    (visualizerSettings.presetName || presetNamesRef.current[presetIdxRef.current] || '');
  const currentPresetPreference = currentPresetName
    ? getVisualizerPresetPreference(visualizerSettings, currentPresetName)
    : 'default';

  const commitPresetHistory = (presetName: string, mode: PresetHistoryMode) => {
    if (!presetName || mode === 'none') return;

    if (mode === 'reset') {
      presetHistoryRef.current = [presetName];
      presetHistoryIdxRef.current = 0;
      return;
    }

    if (mode === 'push') {
      const nextHistory = presetHistoryRef.current.slice(0, presetHistoryIdxRef.current + 1);
      const currentHistoryPresetName =
        presetHistoryIdxRef.current >= 0 ? nextHistory[presetHistoryIdxRef.current] : null;
      if (currentHistoryPresetName === presetName) return;

      nextHistory.push(presetName);
      if (nextHistory.length > MAX_PRESET_HISTORY) nextHistory.shift();

      presetHistoryRef.current = nextHistory;
      presetHistoryIdxRef.current = nextHistory.length - 1;
      return;
    }

    const direction = mode === 'back' ? -1 : 1;
    const nextHistoryIdx = presetHistoryIdxRef.current + direction;
    if (presetHistoryRef.current[nextHistoryIdx] === presetName) {
      presetHistoryIdxRef.current = nextHistoryIdx;
      return;
    }

    const nextHistory = presetHistoryRef.current.slice(0, presetHistoryIdxRef.current + 1);
    if (nextHistory[nextHistory.length - 1] !== presetName) {
      nextHistory.push(presetName);
      if (nextHistory.length > MAX_PRESET_HISTORY) nextHistory.shift();
    }

    presetHistoryRef.current = nextHistory;
    presetHistoryIdxRef.current = nextHistory.length - 1;
  };

  const getHistoryPresetName = (direction: -1 | 1): string | null => {
    const nextHistoryIdx = presetHistoryIdxRef.current + direction;
    const presetName = presetHistoryRef.current[nextHistoryIdx];
    return presetName && presetNamesRef.current.includes(presetName) ? presetName : null;
  };

  const doLoadPreset = async (
    idx: number,
    persist = true,
    historyMode: PresetHistoryMode = 'push'
  ) => {
    const names = presetNamesRef.current;
    if (!vizRef.current || names.length === 0) return;

    const i = ((idx % names.length) + names.length) % names.length;
    const presetName = names[i];
    const loadSeq = ++presetLoadSeqRef.current;
    const preset = await loadVisualizerPresetById(presetName);
    if (!preset || !vizRef.current || loadSeq !== presetLoadSeqRef.current) return;

    try {
      await vizRef.current.loadPreset(preset, blendSecsRef.current);
    } catch (err) {
      console.error(`[visualizer] Failed to load preset "${presetName}":`, err);
      return;
    }
    if (loadSeq !== presetLoadSeqRef.current) return;

    presetIdxRef.current = i;
    setCurrentIdx(i);
    commitPresetHistory(presetName, historyMode);
    if (persist) setVisualizerPresetName(presetName);
  };

  const loadPresetByName = async (
    presetName: string,
    persist = true,
    historyMode: PresetHistoryMode = 'push'
  ) => {
    const idx = presetNamesRef.current.indexOf(presetName);
    if (idx !== -1) await doLoadPreset(idx, persist, historyMode);
  };

  const applyRendererSettings = () => {
    if (!vizRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const w = canvas.offsetWidth || 800;
    const h = canvas.offsetHeight || 600;

    // Keep the canvas pixel buffer in sync with its display size so butterchurn's
    // drawImage call fills the entire output rather than being clipped to the
    // default 300×150 buffer (which then gets stretched / zoomed by CSS).
    // Only assign if the value changed — reassigning the same size on a canvas
    // with an active WebGL context triggers a context loss in WebKit.
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const renderOptions = getVisualizerRenderOptions(
      {
        quality: qualityRef.current,
        fxaa: fxaaRef.current,
        meshDensity: meshDensityRef.current,
      },
      w,
      h
    );

    vizRef.current.setOutputAA(renderOptions.outputFXAA);
    vizRef.current.setRendererSize(renderOptions.width, renderOptions.height, renderOptions);
  };

  const teardownVisualizer = () => {
    clearTimeout(presetTimerRef.current);
    clearTimeout(overlayTimerRef.current);
    clearTimeout(trackOverlayTimerRef.current);
    cancelAnimationFrame(rafRef.current);
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    vizRef.current = null;
  };

  const scheduleOverlayHide = () => {
    clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => {
      setShowOverlay(false);
    }, OVERLAY_IDLE_MS);
  };

  const revealOverlay = () => {
    setShowOverlay(true);
    scheduleOverlayHide();
  };

  const hideOverlay = () => {
    clearTimeout(overlayTimerRef.current);
    setShowOverlay(false);
  };

  const scheduleTrackOverlayHide = (seconds: number) => {
    clearTimeout(trackOverlayTimerRef.current);
    if (seconds <= 0) return;
    trackOverlayTimerRef.current = setTimeout(() => {
      setShowTrackOverlay(false);
    }, seconds * 1000);
  };

  const scheduleAutoCycle = () => {
    clearTimeout(presetTimerRef.current);
    if (!autoCycleRef.current) return;
    presetTimerRef.current = setTimeout(() => {
      void (async () => {
        const activePresetName = presetNamesRef.current[presetIdxRef.current] ?? presetNameRef.current;
        const nextPresetName = getNextAutoCyclePresetName(
          presetNamesRef.current,
          activePresetName,
          {
            presetPreferences: presetPreferencesRef.current,
            cycleOrder: cycleOrderRef.current,
            onlyFavourites: onlyFavouritesRef.current,
          }
        );
        if (nextPresetName && nextPresetName !== activePresetName) {
          await loadPresetByName(nextPresetName);
        }
        scheduleAutoCycle();
      })();
    }, cycleSecsRef.current * 1000);
  };

  const handleNext = () => {
    const nextHistoryPresetName = getHistoryPresetName(1);
    if (nextHistoryPresetName) {
      void loadPresetByName(nextHistoryPresetName, true, 'forward');
      scheduleAutoCycle();
      return;
    }

    const activePresetName = presetNamesRef.current[presetIdxRef.current] ?? presetNameRef.current;
    const nextPresetName = getAdjacentVisualizerPresetName(
      presetNamesRef.current,
      activePresetName,
      1,
      visualizerSettings
    );
    if (nextPresetName) void loadPresetByName(nextPresetName);
    scheduleAutoCycle();
  };

  const handlePrev = () => {
    const prevHistoryPresetName = getHistoryPresetName(-1);
    if (prevHistoryPresetName) {
      void loadPresetByName(prevHistoryPresetName, true, 'back');
      scheduleAutoCycle();
      return;
    }

    const activePresetName = presetNamesRef.current[presetIdxRef.current] ?? presetNameRef.current;
    const prevPresetName = getAdjacentVisualizerPresetName(
      presetNamesRef.current,
      activePresetName,
      -1,
      visualizerSettings
    );
    if (prevPresetName) void loadPresetByName(prevPresetName);
    scheduleAutoCycle();
  };

  const handleSelectPreset = (idx: number) => {
    void doLoadPreset(idx);
    scheduleAutoCycle();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleVisualizerDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-visualizer-controls]')) {
      return;
    }

    toggleFullscreen();
  };

  const handleToggleFavorite = () => {
    if (!currentPresetName) return;
    const nextPreference =
      currentPresetPreference === 'favorite' ? 'default' : 'favorite';
    setVisualizerPresetPreference({ presetName: currentPresetName, preference: nextPreference });
  };

  const handleToggleHidden = () => {
    if (!currentPresetName) return;

    const nextPreference =
      currentPresetPreference === 'hidden' ? 'default' : 'hidden';
    setVisualizerPresetPreference({ presetName: currentPresetName, preference: nextPreference });

    if (nextPreference === 'hidden') {
      const nextSettings = {
        ...visualizerSettings,
        presetPreferences: {
          ...visualizerSettings.presetPreferences,
          [currentPresetName]: 'hidden' as const,
        },
      };
      const replacementPresetName = getNextAutoCyclePresetName(
        presetNamesRef.current,
        currentPresetName,
        nextSettings
      );
      if (replacementPresetName && replacementPresetName !== currentPresetName) {
        void loadPresetByName(replacementPresetName);
      }
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // The fullscreen layout may not have finished when this event fires, so
      // defer the resize by one frame to get accurate offsetWidth/offsetHeight.
      requestAnimationFrame(() => applyRendererSettings());
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Track-change: show overlay and/or cycle preset
  useEffect(() => {
    const currentTrackId = player.current?.track.id ?? null;
    const isNewTrack = currentTrackId !== null && currentTrackId !== prevTrackIdRef.current;
    prevTrackIdRef.current = currentTrackId;

    if (!isNewTrack) return;

    if (showTrackChangeOverlayRef.current) {
      setShowTrackOverlay(true);
      scheduleTrackOverlayHide(trackChangeOverlaySecondsRef.current);

      const activePresetName = presetNamesRef.current[presetIdxRef.current] ?? presetNameRef.current;
      const nextPresetName = getNextAutoCyclePresetName(
        presetNamesRef.current,
        activePresetName,
        {
          presetPreferences: presetPreferencesRef.current,
          cycleOrder: cycleOrderRef.current,
          onlyFavourites: onlyFavouritesRef.current,
        }
      );
      if (nextPresetName && nextPresetName !== activePresetName) {
        void loadPresetByName(nextPresetName);
        scheduleAutoCycle();
      }
    }
  }, [player.current?.track.id]);

  useEffect(() => {
    revealOverlay();
    return () => clearTimeout(overlayTimerRef.current);
  }, []);

  // Show track info immediately when switching to "always" mode while a track is playing
  useEffect(() => {
    if (!visualizerSettings.showTrackChangeOverlay || !player.current) {
      clearTimeout(trackOverlayTimerRef.current);
      setShowTrackOverlay(false);
      return;
    }

    if (visualizerSettings.trackChangeOverlaySeconds === 0) {
      clearTimeout(trackOverlayTimerRef.current);
      setShowTrackOverlay(true);
      return;
    }

    if (showTrackOverlay) {
      scheduleTrackOverlayHide(visualizerSettings.trackChangeOverlaySeconds);
    }
  }, [
    player.current?.track.id,
    showTrackOverlay,
    visualizerSettings.showTrackChangeOverlay,
    visualizerSettings.trackChangeOverlaySeconds,
  ]);

  useEffect(() => {
    let cancelled = false;

    void loadVisualizerPresetCatalog()
      .then((catalog) => {
        if (cancelled) return;

        const presetIds = catalog.map((preset) => preset.id);
        presetNamesRef.current = presetIds;
        setPresetNames(presetIds);

        if (presetIds.length === 0) {
          presetIdxRef.current = 0;
          presetHistoryRef.current = [];
          presetHistoryIdxRef.current = -1;
          setCurrentIdx(0);
          return;
        }

        const preferredPresetName =
          presetNameRef.current && presetIds.includes(presetNameRef.current)
            ? presetNameRef.current
            : presetIds[0];
        const preferredPresetIdx = presetIds.indexOf(preferredPresetName);
        presetIdxRef.current = preferredPresetIdx;
        setCurrentIdx(preferredPresetIdx);
      })
      .catch(() => {
        if (cancelled) return;
        presetNamesRef.current = [];
        presetIdxRef.current = 0;
        presetHistoryRef.current = [];
        presetHistoryIdxRef.current = -1;
        setPresetNames([]);
        setCurrentIdx(0);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    presetNameRef.current = visualizerSettings.presetName;
    autoCycleRef.current = visualizerSettings.autoCycle;
    cycleSecsRef.current = visualizerSettings.cycleSeconds;
    blendSecsRef.current = visualizerSettings.blendSeconds;
    qualityRef.current = visualizerSettings.quality;
    fxaaRef.current = visualizerSettings.fxaa;
    meshDensityRef.current = visualizerSettings.meshDensity;
    fpsRef.current = visualizerSettings.fps;
    presetPreferencesRef.current = visualizerSettings.presetPreferences;
    cycleOrderRef.current = visualizerSettings.cycleOrder;
    onlyFavouritesRef.current = visualizerSettings.onlyFavourites;
    showTrackChangeOverlayRef.current = visualizerSettings.showTrackChangeOverlay;
    trackChangeOverlaySecondsRef.current = visualizerSettings.trackChangeOverlaySeconds;
    changePresetOnTrackChangeRef.current = visualizerSettings.changePresetOnTrackChange;
  }, [
    visualizerSettings.presetName,
    visualizerSettings.autoCycle,
    visualizerSettings.cycleSeconds,
    visualizerSettings.blendSeconds,
    visualizerSettings.quality,
    visualizerSettings.fxaa,
    visualizerSettings.meshDensity,
    visualizerSettings.fps,
    visualizerSettings.presetPreferences,
    visualizerSettings.cycleOrder,
    visualizerSettings.onlyFavourites,
    visualizerSettings.showTrackChangeOverlay,
    visualizerSettings.trackChangeOverlaySeconds,
    visualizerSettings.changePresetOnTrackChange,
  ]);

  useEffect(() => {
    if (vizRef.current) scheduleAutoCycle();
  }, [
    visualizerSettings.autoCycle,
    visualizerSettings.cycleSeconds,
    visualizerSettings.cycleOrder,
    visualizerSettings.onlyFavourites,
    visualizerSettings.presetPreferences,
  ]);

  useEffect(() => {
    if (vizRef.current) vizRef.current.setOutputAA(visualizerSettings.fxaa);
  }, [visualizerSettings.fxaa]);

  // Butterchurn sets the warp mesh dimensions at creation time only — setRendererSize
  // cannot change tessellation. Recreate the renderer when quality or mesh density
  // changes so the new settings are fully applied.
  useEffect(() => {
    if (!butterchurn || !vizRef.current || !canvasRef.current) return;
    const audioCtx = getAudioContext();
    const analyser = getAnalyserNode();
    if (!audioCtx || !analyser) { applyRendererSettings(); return; }

    cancelAnimationFrame(rafRef.current);
    resizeObserverRef.current?.disconnect();

    const canvas = canvasRef.current;
    const w = canvas.offsetWidth || 800;
    const h = canvas.offsetHeight || 600;
    // Pre-size the canvas before butterchurn creates its WebGL context so the
    // ResizeObserver's initial callback won't trigger a context-losing resize.
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const renderOptions = getVisualizerRenderOptions(
      { quality: qualityRef.current, fxaa: fxaaRef.current, meshDensity: meshDensityRef.current },
      w,
      h
    );

    vizRef.current = butterchurn.createVisualizer(audioCtx, canvas, renderOptions);
    vizRef.current.connectAudio(analyser);
    vizRef.current.setOutputAA(renderOptions.outputFXAA);
    void doLoadPreset(presetIdxRef.current, false, 'none');

    let lastFrameTime = 0;
    const render = (now: number) => {
      const targetFps = fpsRef.current;
      const minInterval = targetFps > 0 ? 1000 / targetFps : 0;
      if (targetFps === 0 || now - lastFrameTime >= minInterval) {
        try {
          if (vizRef.current) vizRef.current.render();
        } catch (err) {
          console.error('[visualizer] render() threw — stopping loop:', err);
          return;
        }
        lastFrameTime = now;
      }
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    resizeObserverRef.current = new ResizeObserver(() => {
      if (vizRef.current) applyRendererSettings();
    });
    resizeObserverRef.current.observe(canvas);
  }, [visualizerSettings.quality, visualizerSettings.meshDensity]);

  useEffect(() => {
    const names = presetNamesRef.current;
    if (!vizRef.current || names.length === 0 || !visualizerSettings.presetName) return;

    const idx = names.indexOf(visualizerSettings.presetName);
    if (idx !== -1 && idx !== presetIdxRef.current) {
      void doLoadPreset(idx, false);
    }
  }, [visualizerSettings.presetName]);

  useEffect(() => {
    if (!butterchurn || !canvasRef.current || vizRef.current) return;
    if (!player.current || !player.isPlaying) return;

    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      void (async () => {
        if (cancelled || vizRef.current || !canvasRef.current) return;

        const audioCtx = getAudioContext();
        const analyser = getAnalyserNode();
        if (!audioCtx || !analyser) return;

        const catalog = await loadVisualizerPresetCatalog();
        if (cancelled || vizRef.current || !canvasRef.current) return;

        const presetIds = catalog.map((preset) => preset.id);
        presetNamesRef.current = presetIds;
        setPresetNames(presetIds);

        const canvas = canvasRef.current;
        const w = canvas.offsetWidth || 800;
        const h = canvas.offsetHeight || 600;
        // Pre-size the canvas before butterchurn creates its WebGL context so the
        // ResizeObserver's initial callback won't trigger a context-losing resize.
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        const renderOptions = getVisualizerRenderOptions(
          {
            quality: qualityRef.current,
            fxaa: fxaaRef.current,
            meshDensity: meshDensityRef.current,
          },
          w,
          h
        );

        vizRef.current = butterchurn.createVisualizer(audioCtx, canvas, renderOptions);
        vizRef.current.connectAudio(analyser);

        if (presetIds.length > 0) {
          const requestedPreset = presetNameRef.current;
          const initialPresetName =
            requestedPreset && presetIds.includes(requestedPreset)
              ? requestedPreset
              : presetIds[0];
          const initialIdx = presetIds.indexOf(initialPresetName);
          await doLoadPreset(initialIdx, requestedPreset !== initialPresetName, 'reset');
        }

        if (cancelled || !vizRef.current) return;

        scheduleAutoCycle();

        let lastFrameTime = 0;
        const render = (now: number) => {
          const targetFps = fpsRef.current;
          const minInterval = targetFps > 0 ? 1000 / targetFps : 0;
          if (targetFps === 0 || now - lastFrameTime >= minInterval) {
            try {
              if (vizRef.current) vizRef.current.render();
            } catch (err) {
              console.error('[visualizer] render() threw — stopping loop:', err);
              return;
            }
            lastFrameTime = now;
          }
          rafRef.current = requestAnimationFrame(render);
        };
        rafRef.current = requestAnimationFrame(render);

        resizeObserverRef.current = new ResizeObserver(() => {
          if (vizRef.current) {
            applyRendererSettings();
          }
        });
        resizeObserverRef.current.observe(canvas);
      })();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [butterchurn, player.current?.track.id, player.isPlaying]);

  useEffect(() => {
    return () => {
      teardownVisualizer();
    };
  }, []);

  if (!butterchurn) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AudioWaveform size={40} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-600 text-sm">Visualizer unavailable</p>
          <p className="text-zinc-700 text-xs mt-1">butterchurn could not be loaded</p>
        </div>
      </main>
    );
  }

  return (
    <main
      ref={containerRef}
      className={`visualizer-view flex-1 relative overflow-hidden bg-black ${
        showOverlay ? '' : 'visualizer-view--controls-hidden'
      }`}
      onPointerMove={revealOverlay}
      onPointerDown={revealOverlay}
      onDoubleClick={handleVisualizerDoubleClick}
      onFocusCapture={revealOverlay}
      onPointerLeave={hideOverlay}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />

      {!player.current && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <AudioWaveform size={36} className="mb-3 text-white/20" />
          <p className="text-white/30 text-sm">Play something to start the visualizer</p>
        </div>
      )}

      {/* Track-change info overlay */}
      {player.current && (() => {
        const alwaysShowTrackInfo = visualizerSettings.showTrackChangeOverlay && visualizerSettings.trackChangeOverlaySeconds === 0;
        const shouldShowTrackInfo = alwaysShowTrackInfo || showTrackOverlay || showOverlay;
        return (
          <div
            className={`absolute flex items-center pointer-events-none transition-opacity duration-700 ease-out ${
              shouldShowTrackInfo ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              top: 'clamp(0.75rem, 2.2vmin, 1.75rem)',
              left: 'clamp(0.75rem, 2.2vmin, 1.75rem)',
              gap: 'clamp(0.75rem, 1.8vmin, 1.25rem)',
              padding: 'clamp(0.85rem, 2vmin, 1.35rem)',
              borderRadius: 'clamp(1rem, 2.6vmin, 1.5rem)',
              background: 'rgba(8,8,10,0.46)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(18px)',
              maxWidth: 'min(42rem, calc(100vw - clamp(1.5rem, 6vw, 4rem)))',
              boxShadow: '0 10px 28px rgba(0,0,0,0.26)',
              willChange: 'opacity',
            }}
          >
            {player.current.coverArt && (
              <img
                src={player.current.coverArt}
                alt="cover"
                className="object-cover flex-shrink-0"
                style={{
                  width: 'clamp(3.5rem, 10vmin, 6.5rem)',
                  height: 'clamp(3.5rem, 10vmin, 6.5rem)',
                  borderRadius: 'clamp(0.8rem, 1.8vmin, 1.1rem)',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.34)',
                }}
              />
            )}
            <div className="min-w-0">
              <div
                className="flex items-center mb-1.5"
                style={{ gap: 'clamp(0.3rem, 0.8vmin, 0.45rem)' }}
              >
                <span
                  className="rounded-full bg-violet-400 animate-pulse flex-shrink-0"
                  style={{ width: 'clamp(0.35rem, 0.8vmin, 0.5rem)', height: 'clamp(0.35rem, 0.8vmin, 0.5rem)' }}
                />
                <span
                  className="text-white/45 uppercase tracking-widest font-semibold"
                  style={{ fontSize: 'clamp(0.48rem, 0.9vmin, 0.62rem)' }}
                >
                  Now Playing
                </span>
              </div>
              <p
                className="text-white font-bold leading-tight truncate"
                style={{
                  fontSize: 'clamp(1rem, 2.7vmin, 1.8rem)',
                  maxWidth: 'min(26rem, 48vw)',
                  textShadow: '0 1px 10px rgba(0,0,0,0.55)',
                }}
              >
                {player.current.track.title}
              </p>
              <p
                className="text-white/75 truncate mt-1.5"
                style={{ fontSize: 'clamp(0.78rem, 1.45vmin, 1rem)' }}
              >
                {player.current.track.artist}
              </p>
              {player.current.albumName && (
                <p
                  className="text-white/45 truncate mt-0.5"
                  style={{ fontSize: 'clamp(0.68rem, 1.1vmin, 0.85rem)' }}
                >
                  {player.current.albumName}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Controls bar — visible on hover */}
      <div
        data-visualizer-controls
        className={`absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-200 ${
          showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          onClick={handlePrev}
          title="Previous preset"
          className="text-white/70 hover:text-white transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={handleNext}
          title="Next preset"
          className="text-white/70 hover:text-white transition-colors"
        >
          <ChevronRight size={20} />
        </button>

        <select
          value={currentIdx}
          onChange={e => handleSelectPreset(Number(e.target.value))}
          className="flex-1 min-w-0 bg-black/50 text-white/80 text-xs rounded px-2 py-1 border border-white/10 truncate cursor-pointer"
        >
          {presetNames
            .map((name, i) => ({ name, i }))
            .filter(({ name }) =>
              !visualizerSettings.onlyFavourites ||
              getVisualizerPresetPreference(visualizerSettings, name) === 'favorite'
            )
            .map(({ name, i }) => (
              <option key={name} value={i}>{getVisualizerPresetLabel(name)}</option>
            ))}
        </select>

        <button
          onClick={handleToggleFavorite}
          title={currentPresetPreference === 'favorite' ? 'Remove favorite' : 'Favorite preset'}
          className={`transition-colors ${
            currentPresetPreference === 'favorite'
              ? 'text-rose-400'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <Heart size={16} className={currentPresetPreference === 'favorite' ? 'fill-rose-400' : ''} />
        </button>

        <button
          onClick={handleToggleHidden}
          title={currentPresetPreference === 'hidden' ? 'Unhide preset' : 'Hide from auto-cycle'}
          className={`transition-colors ${
            currentPresetPreference === 'hidden'
              ? 'text-amber-300'
              : 'text-white/60 hover:text-white'
          }`}
        >
          {currentPresetPreference === 'hidden' ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>

        <button
          onClick={() => setShowConfig(v => !v)}
          title="Configure visualizer"
          className={`transition-colors ${showConfig ? 'text-white' : 'text-white/70 hover:text-white'}`}
        >
          <Settings size={18} />
        </button>

        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="text-white/70 hover:text-white transition-colors"
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      </div>

      {/* Config panel */}
      {showConfig && showOverlay && (
        <div data-visualizer-controls className="absolute bottom-12 right-3 rounded-lg p-4 text-xs flex flex-col gap-3 w-56 shadow-xl" style={{background:'rgba(18,18,20,0.96)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff'}}>
          <p className="font-medium uppercase tracking-wider text-[10px]" style={{color:'rgba(255,255,255,0.6)'}}>Visualizer Settings</p>

          <label className="flex items-center justify-between gap-2">
            <span>Auto-cycle presets</span>
            <input
              type="checkbox"
              checked={visualizerSettings.autoCycle}
              onChange={(e) => setVisualizerAutoCycle(e.target.checked)}
              className="accent-violet-500"
            />
          </label>

          <label className="flex items-center justify-between gap-2">
            <span>Only favourites</span>
            <input
              type="checkbox"
              checked={visualizerSettings.onlyFavourites}
              onChange={(e) => setVisualizerOnlyFavourites(e.target.checked)}
              className="accent-violet-500"
            />
          </label>

          <label className="flex items-center justify-between gap-2">
            <span>Randomize order</span>
            <input
              type="checkbox"
              checked={visualizerSettings.cycleOrder === 'random'}
              onChange={(e) => setVisualizerCycleOrder(e.target.checked ? 'random' : 'sequential')}
              className="accent-violet-500"
            />
          </label>

          <label className="flex items-center justify-between gap-2">
            <span>Frame rate</span>
            <select
              value={visualizerSettings.fps}
              onChange={(e) => setVisualizerFps(Number(e.target.value) as VisualizerFps)}
              style={{background:'rgba(255,255,255,0.1)', color:'#fff', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'4px', padding:'2px 6px', fontSize:'11px'}}
            >
              <option value={24}>24 fps</option>
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
              <option value={0}>Unlimited</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between">
              <span>Cycle duration</span>
              <span style={{color:'rgba(255,255,255,0.5)'}}>{visualizerSettings.cycleSeconds}s</span>
            </span>
            <input
              type="range"
              min={5}
              max={120}
              step={5}
              value={visualizerSettings.cycleSeconds}
              disabled={!visualizerSettings.autoCycle}
              onChange={(e) => setVisualizerCycleSeconds(Number(e.target.value))}
              className="accent-violet-500 disabled:opacity-40"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between">
              <span>Blend time</span>
              <span style={{color:'rgba(255,255,255,0.5)'}}>{visualizerSettings.blendSeconds}s</span>
            </span>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={visualizerSettings.blendSeconds}
              onChange={(e) => setVisualizerBlendSeconds(Number(e.target.value))}
              className="accent-violet-500"
            />
          </label>

          <div style={{borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:'8px'}}>
            <p className="font-medium uppercase tracking-wider text-[10px] mb-2" style={{color:'rgba(255,255,255,0.6)'}}>Track Change</p>

            <label className="flex items-center justify-between gap-2 mb-2">
              <span>Track info display</span>
              <select
                value={
                  !visualizerSettings.showTrackChangeOverlay
                    ? 'hidden'
                    : visualizerSettings.trackChangeOverlaySeconds === 0
                      ? 'always'
                      : String(visualizerSettings.trackChangeOverlaySeconds)
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'hidden') {
                    setVisualizerShowTrackChangeOverlay(false);
                  } else if (v === 'always') {
                    setVisualizerShowTrackChangeOverlay(true);
                    setVisualizerTrackChangeOverlaySeconds(0);
                  } else {
                    setVisualizerShowTrackChangeOverlay(true);
                    setVisualizerTrackChangeOverlaySeconds(Number(v));
                  }
                }}
                style={{background:'rgba(255,255,255,0.1)', color:'#fff', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'4px', padding:'2px 6px', fontSize:'11px'}}
              >
                <option value="hidden">Hidden</option>
                <option value="5">5s</option>
                <option value="10">10s</option>
                <option value="15">15s</option>
                <option value="20">20s</option>
                <option value="25">25s</option>
                <option value="30">30s</option>
                <option value="always">Always</option>
              </select>
            </label>

            <label className="flex items-center justify-between gap-2">
              <span>Change preset</span>
              <input
                type="checkbox"
                checked={visualizerSettings.changePresetOnTrackChange}
                onChange={(e) => setVisualizerChangePresetOnTrackChange(e.target.checked)}
                className="accent-violet-500"
              />
            </label>
          </div>
        </div>
      )}
    </main>
  );
}
