import { useEffect, useRef, useState } from 'react';
import { useUnit } from 'effector-react';
import {
  AudioWaveform,
  ChevronLeft,
  ChevronRight,
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
  setVisualizerCycleSeconds,
  setVisualizerFps,
  setVisualizerPresetPreference,
  setVisualizerPresetName,
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

  // React state for rendering
  const [presetNames, setPresetNames] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);

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

    await Promise.resolve(vizRef.current.loadPreset(preset, blendSecsRef.current));
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
    const renderOptions = getVisualizerRenderOptions(
      {
        quality: qualityRef.current,
        fxaa: fxaaRef.current,
        meshDensity: meshDensityRef.current,
      },
      canvas.offsetWidth || 800,
      canvas.offsetHeight || 600
    );

    vizRef.current.setOutputAA(renderOptions.outputFXAA);
    vizRef.current.setRendererSize(renderOptions.width, renderOptions.height, renderOptions);
  };

  const teardownVisualizer = () => {
    clearTimeout(presetTimerRef.current);
    clearTimeout(overlayTimerRef.current);
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
          visualizerSettings
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
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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
  }, [
    visualizerSettings.presetName,
    visualizerSettings.autoCycle,
    visualizerSettings.cycleSeconds,
    visualizerSettings.blendSeconds,
    visualizerSettings.quality,
    visualizerSettings.fxaa,
    visualizerSettings.meshDensity,
    visualizerSettings.fps,
  ]);

  useEffect(() => {
    if (vizRef.current) scheduleAutoCycle();
  }, [
    visualizerSettings.autoCycle,
    visualizerSettings.cycleSeconds,
    visualizerSettings.cycleOrder,
    visualizerSettings.presetPreferences,
  ]);

  useEffect(() => {
    if (vizRef.current) applyRendererSettings();
  }, [visualizerSettings.quality, visualizerSettings.fxaa, visualizerSettings.meshDensity]);

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
          {presetNames.map((name, i) => (
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
          <EyeOff size={16} />
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
        </div>
      )}
    </main>
  );
}
