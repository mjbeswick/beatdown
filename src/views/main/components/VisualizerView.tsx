import { useEffect, useRef, useState } from 'react';
import { useUnit } from 'effector-react';
import { AudioWaveform, ChevronLeft, ChevronRight, Settings, Maximize, Minimize } from 'lucide-react';
import { $player } from '../stores/player';
import {
  $visualizerSettings,
  setVisualizerAutoCycle,
  setVisualizerBlendSeconds,
  setVisualizerCycleSeconds,
  setVisualizerPresetName,
} from '../stores/visualizer';
import { getAnalyserNode, getAudioContext } from '../audio/engine';
import {
  getButterchurnLibrary,
  getVisualizerRenderOptions,
  loadVisualizerPresets,
} from '../lib/visualizer';

export default function VisualizerView() {
  const [player, visualizerSettings] = useUnit([$player, $visualizerSettings]);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const presetsRef = useRef<Record<string, unknown>>({});
  const presetNamesRef = useRef<string[]>([]);
  const presetIdxRef = useRef(0);
  const presetTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Mutable config kept in refs so callbacks never go stale
  const presetNameRef = useRef(visualizerSettings.presetName);
  const autoCycleRef = useRef(visualizerSettings.autoCycle);
  const cycleSecsRef = useRef(visualizerSettings.cycleSeconds);
  const blendSecsRef = useRef(visualizerSettings.blendSeconds);
  const qualityRef = useRef(visualizerSettings.quality);
  const fxaaRef = useRef(visualizerSettings.fxaa);
  const meshDensityRef = useRef(visualizerSettings.meshDensity);

  // React state for rendering
  const [presetNames, setPresetNames] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const butterchurn = getButterchurnLibrary();

  const doLoadPreset = (idx: number, persist = true) => {
    const names = presetNamesRef.current;
    if (!vizRef.current || names.length === 0) return;
    const i = ((idx % names.length) + names.length) % names.length;
    const presetName = names[i];
    vizRef.current.loadPreset(presetsRef.current[presetName], blendSecsRef.current);
    presetIdxRef.current = i;
    setCurrentIdx(i);
    if (persist) setVisualizerPresetName(presetName);
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
    cancelAnimationFrame(rafRef.current);
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    vizRef.current = null;
  };

  const scheduleAutoCycle = () => {
    clearTimeout(presetTimerRef.current);
    if (!autoCycleRef.current) return;
    presetTimerRef.current = setTimeout(() => {
      doLoadPreset(presetIdxRef.current + 1);
      scheduleAutoCycle();
    }, cycleSecsRef.current * 1000);
  };

  const handleNext = () => {
    doLoadPreset(presetIdxRef.current + 1);
    scheduleAutoCycle();
  };

  const handlePrev = () => {
    doLoadPreset(presetIdxRef.current - 1);
    scheduleAutoCycle();
  };

  const handleSelectPreset = (idx: number) => {
    doLoadPreset(idx);
    scheduleAutoCycle();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    presetNameRef.current = visualizerSettings.presetName;
    autoCycleRef.current = visualizerSettings.autoCycle;
    cycleSecsRef.current = visualizerSettings.cycleSeconds;
    blendSecsRef.current = visualizerSettings.blendSeconds;
    qualityRef.current = visualizerSettings.quality;
    fxaaRef.current = visualizerSettings.fxaa;
    meshDensityRef.current = visualizerSettings.meshDensity;
  }, [
    visualizerSettings.presetName,
    visualizerSettings.autoCycle,
    visualizerSettings.cycleSeconds,
    visualizerSettings.blendSeconds,
    visualizerSettings.quality,
    visualizerSettings.fxaa,
    visualizerSettings.meshDensity,
  ]);

  useEffect(() => {
    if (vizRef.current) scheduleAutoCycle();
  }, [visualizerSettings.autoCycle, visualizerSettings.cycleSeconds]);

  useEffect(() => {
    if (vizRef.current) applyRendererSettings();
  }, [visualizerSettings.quality, visualizerSettings.fxaa, visualizerSettings.meshDensity]);

  useEffect(() => {
    const names = presetNamesRef.current;
    if (!vizRef.current || names.length === 0 || !visualizerSettings.presetName) return;

    const idx = names.indexOf(visualizerSettings.presetName);
    if (idx !== -1 && idx !== presetIdxRef.current) {
      doLoadPreset(idx, false);
    }
  }, [visualizerSettings.presetName]);

  useEffect(() => {
    if (!butterchurn || !canvasRef.current || vizRef.current) return;
    if (!player.current || !player.isPlaying) return;

    const frameId = requestAnimationFrame(() => {
      if (vizRef.current || !canvasRef.current) return;

      const audioCtx = getAudioContext();
      const analyser = getAnalyserNode();
      if (!audioCtx || !analyser) return;

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
      const presets = loadVisualizerPresets();

      presetsRef.current = presets;
      presetNamesRef.current = Object.keys(presets);
      setPresetNames(presetNamesRef.current);

      vizRef.current = butterchurn.createVisualizer(audioCtx, canvas, renderOptions);

      vizRef.current.connectAudio(analyser);

      if (presetNamesRef.current.length > 0) {
        const requestedPreset = presetNameRef.current;
        const initialPresetName = requestedPreset && presetNamesRef.current.includes(requestedPreset)
          ? requestedPreset
          : presetNamesRef.current[0];
        const initialIdx = presetNamesRef.current.indexOf(initialPresetName);
        doLoadPreset(initialIdx, requestedPreset !== initialPresetName);
      }

      scheduleAutoCycle();

      const render = () => {
        if (vizRef.current) vizRef.current.render();
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);

      resizeObserverRef.current = new ResizeObserver(() => {
        if (vizRef.current) {
          applyRendererSettings();
        }
      });
      resizeObserverRef.current.observe(canvas);
    });

    return () => cancelAnimationFrame(frameId);
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
    <main ref={containerRef} className="flex-1 relative overflow-hidden bg-black group">
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
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
            <option key={name} value={i}>{name}</option>
          ))}
        </select>

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
      {showConfig && (
        <div className="absolute bottom-12 right-3 bg-zinc-900/95 border border-white/10 rounded-lg p-4 text-white text-xs flex flex-col gap-3 w-56 shadow-xl">
          <p className="font-medium text-white/60 uppercase tracking-wider text-[10px]">Visualizer Settings</p>

          <label className="flex items-center justify-between gap-2">
            <span>Auto-cycle presets</span>
            <input
              type="checkbox"
              checked={visualizerSettings.autoCycle}
              onChange={(e) => setVisualizerAutoCycle(e.target.checked)}
              className="accent-violet-500"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between">
              <span>Cycle duration</span>
              <span className="text-white/50">{visualizerSettings.cycleSeconds}s</span>
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
              <span className="text-white/50">{visualizerSettings.blendSeconds}s</span>
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
