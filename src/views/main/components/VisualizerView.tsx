import { useEffect, useRef, useState } from 'react';
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

export default function VisualizerView() {
  const [player, visualizerSettings] = useUnit([$player, $visualizerSettings]);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const presetNamesRef = useRef<string[]>([]);
  const presetIdxRef = useRef(0);
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

  const doLoadPreset = async (idx: number, persist = true) => {
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
    if (persist) setVisualizerPresetName(presetName);
  };

  const loadPresetByName = async (presetName: string, persist = true) => {
    const idx = presetNamesRef.current.indexOf(presetName);
    if (idx !== -1) await doLoadPreset(idx, persist);
  };

  const applyRendererSettings = () => {
    if (!vizRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const w = canvas.offsetWidth || 800;
    const h = canvas.offsetHeight || 600;

    // Keep the canvas pixel buffer in sync with its display size so butterchurn's
    // drawImage call fills the entire output rather than being clipped to the
    // default 300×150 buffer (which then gets stretched / zoomed by CSS).
    canvas.width = w;
    canvas.height = h;

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
      clearTimeout(trackOverlayTimerRef.current);
      setShowTrackOverlay(true);
      trackOverlayTimerRef.current = setTimeout(() => {
        setShowTrackOverlay(false);
      }, trackChangeOverlaySecondsRef.current * 1000);
    }

    if (changePresetOnTrackChangeRef.current && vizRef.current && presetNamesRef.current.length > 0) {
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
    const renderOptions = getVisualizerRenderOptions(
      { quality: qualityRef.current, fxaa: fxaaRef.current, meshDensity: meshDensityRef.current },
      canvas.offsetWidth || 800,
      canvas.offsetHeight || 600
    );

    vizRef.current = butterchurn.createVisualizer(audioCtx, canvas, renderOptions);
    vizRef.current.connectAudio(analyser);
    vizRef.current.setOutputAA(renderOptions.outputFXAA);
    void doLoadPreset(presetIdxRef.current, false);

    let lastFrameTime = 0;
    const render = (now: number) => {
      const targetFps = fpsRef.current;
      const minInterval = targetFps > 0 ? 1000 / targetFps : 0;
      if (targetFps === 0 || now - lastFrameTime >= minInterval) {
        if (vizRef.current) vizRef.current.render();
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
        const renderOptions = getVisualizerRenderOptions(
          {
            quality: qualityRef.current,
            fxaa: fxaaRef.current,
            meshDensity: meshDensityRef.current,
          },
          canvas.offsetWidth || 800,
          canvas.offsetHeight || 600
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
          await doLoadPreset(initialIdx, requestedPreset !== initialPresetName);
        }

        if (cancelled || !vizRef.current) return;

        scheduleAutoCycle();

        let lastFrameTime = 0;
        const render = (now: number) => {
          const targetFps = fpsRef.current;
          const minInterval = targetFps > 0 ? 1000 / targetFps : 0;
          if (targetFps === 0 || now - lastFrameTime >= minInterval) {
            if (vizRef.current) vizRef.current.render();
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
      className="flex-1 relative overflow-hidden bg-black"
      onPointerMove={revealOverlay}
      onPointerDown={revealOverlay}
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
      {player.current && (
        <div
          className={`absolute top-6 left-6 flex items-center gap-3 rounded-xl px-4 py-3 shadow-2xl pointer-events-none transition-all duration-500 ${
            showTrackOverlay ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}
          style={{ background: 'rgba(10,10,12,0.82)', border: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(12px)', maxWidth: '320px' }}
        >
          {player.current.coverArt && (
            <img
              src={player.current.coverArt}
              alt="cover"
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
            />
          )}
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate leading-tight">{player.current.track.title}</p>
            <p className="text-white/60 text-xs truncate mt-0.5">{player.current.track.artist}</p>
            {player.current.albumName && (
              <p className="text-white/40 text-xs truncate mt-0.5">{player.current.albumName}</p>
            )}
          </div>
        </div>
      )}

      {/* Controls bar — visible on hover */}
      <div
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
        <div className="absolute bottom-12 right-3 rounded-lg p-4 text-xs flex flex-col gap-3 w-56 shadow-xl" style={{background:'rgba(18,18,20,0.96)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff'}}>
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
              <span>Show track info</span>
              <input
                type="checkbox"
                checked={visualizerSettings.showTrackChangeOverlay}
                onChange={(e) => setVisualizerShowTrackChangeOverlay(e.target.checked)}
                className="accent-violet-500"
              />
            </label>

            <label className="flex flex-col gap-1 mb-2">
              <span className="flex justify-between">
                <span style={{opacity: visualizerSettings.showTrackChangeOverlay ? 1 : 0.4}}>Info duration</span>
                <span style={{color:'rgba(255,255,255,0.5)', opacity: visualizerSettings.showTrackChangeOverlay ? 1 : 0.4}}>{visualizerSettings.trackChangeOverlaySeconds}s</span>
              </span>
              <input
                type="range"
                min={2}
                max={10}
                step={1}
                value={visualizerSettings.trackChangeOverlaySeconds}
                disabled={!visualizerSettings.showTrackChangeOverlay}
                onChange={(e) => setVisualizerTrackChangeOverlaySeconds(Number(e.target.value))}
                className="accent-violet-500 disabled:opacity-40"
              />
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
