import { useEffect, useRef } from 'react';
import { useUnit } from 'effector-react';
import { AudioWaveform } from 'lucide-react';
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const presetNames = useRef<string[]>([]);
  const presetIdx = useRef(0);
  const presetTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!butterchurn || !butterchurnPresets || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const audioCtx = getAudioContext();
    const analyser = getAnalyserNode();

    if (!audioCtx || !analyser) return;

    // Create visualizer
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

    presetNames.current = Object.keys(presets);

    vizRef.current = butterchurn.createVisualizer(audioCtx, canvas, {
      width: canvas.offsetWidth || 800,
      height: canvas.offsetHeight || 600,
    });

    vizRef.current.connectAudio(analyser);

    // Load first preset
    if (presetNames.current.length > 0) {
      vizRef.current.loadPreset(presets[presetNames.current[0]], 0);
    }

    const cyclePreset = () => {
      if (!vizRef.current || presetNames.current.length === 0) return;
      presetIdx.current = (presetIdx.current + 1) % presetNames.current.length;
      vizRef.current.loadPreset(presets[presetNames.current[presetIdx.current]], 2.0);
      presetTimer.current = setTimeout(cyclePreset, 30_000);
    };

    presetTimer.current = setTimeout(cyclePreset, 30_000);

    // Animation loop
    const render = () => {
      if (vizRef.current) vizRef.current.render();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (vizRef.current && canvas) {
        vizRef.current.setRendererSize(canvas.offsetWidth, canvas.offsetHeight);
      }
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(presetTimer.current);
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
    <main className="flex-1 relative overflow-hidden bg-black">
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
    </main>
  );
}
