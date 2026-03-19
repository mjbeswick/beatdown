import { useEffect, useRef, useState } from 'react';
import { useUnit } from 'effector-react';
import { AudioWaveform, ChevronLeft, ChevronRight, Settings, Maximize, Minimize } from 'lucide-react';
import { $player } from '../stores/player';
import { getAnalyserNode, getAudioContext } from '../audio/engine';

// butterchurn and presets may not be tree-shaken, import carefully
let butterchurn: any = null;
let butterchurnPresets: any = null;

try {
  butterchurn = require('butterchurn').default ?? require('butterchurn');
  butterchurnPresets = require('butterchurn-presets').default ?? require('butterchurn-presets');
} catch {
  // gracefully degrade if butterchurn unavailable
}

export default function VisualizerView() {
  const player = useUnit($player);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const presetsRef = useRef<Record<string, unknown>>({});
  const presetNamesRef = useRef<string[]>([]);
  const presetIdxRef = useRef(0);
  const presetTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Mutable config kept in refs so callbacks never go stale
  const autoCycleRef = useRef(true);
  const cycleSecsRef = useRef(30);
  const blendSecsRef = useRef(2.0);

  // React state for rendering
  const [presetNames, setPresetNames] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [autoCycle, setAutoCycle] = useState(true);
  const [cycleSecs, setCycleSecs] = useState(30);
  const [blendSecs, setBlendSecs] = useState(2.0);

  const doLoadPreset = (idx: number) => {
    const names = presetNamesRef.current;
    if (!vizRef.current || names.length === 0) return;
    const i = ((idx % names.length) + names.length) % names.length;
    vizRef.current.loadPreset(presetsRef.current[names[i]], blendSecsRef.current);
    presetIdxRef.current = i;
    setCurrentIdx(i);
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
    if (!butterchurn || !butterchurnPresets || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const audioCtx = getAudioContext();
    const analyser = getAnalyserNode();

    if (!audioCtx || !analyser) return;

    let presets: Record<string, unknown> = {};
    try {
      if (typeof butterchurnPresets.getPresets === 'function') {
        presets = butterchurnPresets.getPresets();
      } else if (typeof butterchurnPresets === 'object') {
        presets = butterchurnPresets as Record<string, unknown>;
      }
    } catch {
      presets = {};
    }

    presetsRef.current = presets;
    presetNamesRef.current = Object.keys(presets);
    setPresetNames(presetNamesRef.current);

    vizRef.current = butterchurn.createVisualizer(audioCtx, canvas, {
      width: canvas.offsetWidth || 800,
      height: canvas.offsetHeight || 600,
    });

    vizRef.current.connectAudio(analyser);

    if (presetNamesRef.current.length > 0) {
      vizRef.current.loadPreset(presets[presetNamesRef.current[0]], 0);
    }

    scheduleAutoCycle();

    const render = () => {
      if (vizRef.current) vizRef.current.render();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    const ro = new ResizeObserver(() => {
      if (vizRef.current && canvas) {
        vizRef.current.setRendererSize(canvas.offsetWidth, canvas.offsetHeight);
      }
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(presetTimerRef.current);
      ro.disconnect();
      vizRef.current = null;
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
              checked={autoCycle}
              onChange={e => {
                setAutoCycle(e.target.checked);
                autoCycleRef.current = e.target.checked;
                scheduleAutoCycle();
              }}
              className="accent-violet-500"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between">
              <span>Cycle duration</span>
              <span className="text-white/50">{cycleSecs}s</span>
            </span>
            <input
              type="range"
              min={5}
              max={120}
              step={5}
              value={cycleSecs}
              disabled={!autoCycle}
              onChange={e => {
                const v = Number(e.target.value);
                setCycleSecs(v);
                cycleSecsRef.current = v;
              }}
              className="accent-violet-500 disabled:opacity-40"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex justify-between">
              <span>Blend time</span>
              <span className="text-white/50">{blendSecs}s</span>
            </span>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={blendSecs}
              onChange={e => {
                const v = Number(e.target.value);
                setBlendSecs(v);
                blendSecsRef.current = v;
              }}
              className="accent-violet-500"
            />
          </label>
        </div>
      )}
    </main>
  );
}
