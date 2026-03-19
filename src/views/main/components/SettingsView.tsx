import { AudioWaveform, FolderOpen, Music, Gauge } from 'lucide-react';
import { useUnit } from 'effector-react';
import { usePersistedState } from '../hooks/usePersistedState';
import { useEffect, useState } from 'react';
import { $theme, themeChanged } from '../stores/theme';
import type { AudioFormat, QualityPreset } from '../../../shared/types';
import type { ReelPaths } from '../../../shared/rpc-schema';
import { rpc } from '../rpc';
import {
  $visualizerSettings,
  setVisualizerAutoCycle,
  setVisualizerBlendSeconds,
  setVisualizerCycleSeconds,
  setVisualizerCycleOrder,
  setVisualizerFps,
  setVisualizerFXAA,
  setVisualizerMeshDensity,
  setVisualizerPresetName,
  setVisualizerQuality,
  resetVisualizerFavorites,
  resetVisualizerHidden,
} from '../stores/visualizer';
import type { VisualizerFps } from '../stores/visualizer';
import {
  type VisualizerPresetDescriptor,
  getVisibleVisualizerPresetNames,
  invalidateVisualizerPresetCatalog,
  loadVisualizerPresetCatalog,
} from '../lib/visualizer';

const FORMATS: { value: AudioFormat; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A' },
  { value: 'aac', label: 'AAC' },
  { value: 'flac', label: 'FLAC' },
  { value: 'wav', label: 'WAV' },
];

const QUALITIES: { value: QualityPreset; label: string }[] = [
  { value: 'auto', label: 'Auto (best available)' },
  { value: '320', label: '320 kbps' },
  { value: '256', label: '256 kbps' },
  { value: '192', label: '192 kbps' },
  { value: '128', label: '128 kbps' },
  { value: '96', label: '96 kbps' },
];

import type { ThemeOption } from '../stores/theme';

const THEMES: { value: ThemeOption; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const VISUALIZER_QUALITIES = [
  { value: 'performance', label: 'Performance' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'detail', label: 'High Detail' },
  { value: 'ultra', label: 'Ultra' },
] as const;

const VISUALIZER_MESH_DENSITIES = [
  { value: 'sparse', label: 'Sparse' },
  { value: 'standard', label: 'Standard' },
  { value: 'dense', label: 'Dense' },
  { value: 'extreme', label: 'Extreme' },
] as const;

const VISUALIZER_CYCLE_ORDERS = [
  { value: 'random', label: 'Random' },
  { value: 'sequential', label: 'Sequential' },
] as const;

export default function SettingsView() {
  const theme = useUnit($theme);
  const [format, setFormat] = usePersistedState<AudioFormat>('reel:format', 'm4a');
  const [quality, setQuality] = usePersistedState<QualityPreset>('reel:quality', 'auto');
  const visualizerSettings = useUnit($visualizerSettings);
  const [reelPaths, setReelPaths] = useState<ReelPaths | null>(null);
  const [presetCatalog, setPresetCatalog] = useState<VisualizerPresetDescriptor[]>([]);
  const [loadingPresetCatalog, setLoadingPresetCatalog] = useState(true);
  const [browsing, setBrowsing] = useState<'library' | 'playlists' | 'visualizerPresets' | null>(null);
  const presetIds = presetCatalog.map((preset) => preset.id);
  const visiblePresetCount = getVisibleVisualizerPresetNames(presetIds, visualizerSettings).length;
  const customPresetCount = presetCatalog.filter((preset) => preset.source === 'custom').length;
  const favoritePresetCount = Object.values(visualizerSettings.presetPreferences).filter(
    (preference) => preference === 'favorite'
  ).length;
  const hiddenPresetCount = Object.values(visualizerSettings.presetPreferences).filter(
    (preference) => preference === 'hidden'
  ).length;
  const selectedPresetName =
    presetIds.includes(visualizerSettings.presetName)
      ? visualizerSettings.presetName
      : (presetIds[0] ?? '');

  useEffect(() => {
    rpc.proxy.request['paths:get'](undefined as any).then(setReelPaths).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingPresetCatalog(true);

    void loadVisualizerPresetCatalog(true)
      .then((catalog) => {
        if (!cancelled) setPresetCatalog(catalog);
      })
      .catch(() => {
        if (!cancelled) setPresetCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPresetCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reelPaths?.visualizerPresetsDir]);

  const browsePath = async (type: 'library' | 'playlists' | 'visualizerPresets') => {
    setBrowsing(type);
    try {
      const updated = await rpc.proxy.request['paths:browse']({ type });
      if (updated) {
        if (type === 'visualizerPresets') invalidateVisualizerPresetCatalog();
        setReelPaths(updated);
      }
    } catch {} finally {
      setBrowsing(null);
    }
  };

  const shortenPath = (p: string) => p.replace(/^\/Users\/[^/]+/, '~');

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <h2 className="text-zinc-200 text-base font-semibold mb-5 text-center">Settings</h2>
      <div className="space-y-2 max-w-md mx-auto">

        {/* Appearance */}
        <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Appearance</p>
          </div>
          <div className="flex items-center justify-between px-4 pb-3">
            <span className="text-zinc-300 text-sm">Theme</span>
            <div className="relative">
              <select
                value={theme}
                onChange={(e) => themeChanged(e.target.value as ThemeOption)}
                className="bg-zinc-700/60 border border-zinc-600/50 rounded-lg text-sm text-zinc-300 px-3 py-1.5 pr-7 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none outline-none"
              >
                {THEMES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">▾</span>
            </div>
          </div>
        </div>

        {/* Downloads */}
        <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Downloads</p>
          </div>

          {/* Format */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/40">
            <div className="flex items-center gap-2">
              <Music size={13} className="text-zinc-500" />
              <span className="text-zinc-300 text-sm">Format</span>
            </div>
            <div className="relative">
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as AudioFormat)}
                className="bg-zinc-700/60 border border-zinc-600/50 rounded-lg text-sm text-zinc-300 px-3 py-1.5 pr-7 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none outline-none"
              >
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">▾</span>
            </div>
          </div>

          {/* Quality */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/40">
            <div className="flex items-center gap-2">
              <Gauge size={13} className="text-zinc-500" />
              <span className="text-zinc-300 text-sm">Quality</span>
            </div>
            <div className="relative">
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as QualityPreset)}
                className="bg-zinc-700/60 border border-zinc-600/50 rounded-lg text-sm text-zinc-300 px-3 py-1.5 pr-7 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none outline-none"
              >
                {QUALITIES.map((q) => (
                  <option key={q.value} value={q.value}>{q.label}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">▾</span>
            </div>
          </div>

          {/* Library location */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/40">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen size={13} className="text-zinc-500 shrink-0" />
              <div className="min-w-0">
                <span className="text-zinc-300 text-sm block">Library</span>
                <code className="text-zinc-500 text-[11px] font-mono truncate block max-w-[200px]">
                  {reelPaths ? shortenPath(reelPaths.libraryDir) : '…'}
                </code>
              </div>
            </div>
            <button
              onClick={() => browsePath('library')}
              disabled={browsing === 'library'}
              className="shrink-0 ml-2 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-700/60 border border-zinc-600/50 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
            >
              {browsing === 'library' ? '…' : 'Change'}
            </button>
          </div>

          {/* Playlists location */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/40">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen size={13} className="text-zinc-500 shrink-0" />
              <div className="min-w-0">
                <span className="text-zinc-300 text-sm block">Playlists</span>
                <code className="text-zinc-500 text-[11px] font-mono truncate block max-w-[200px]">
                  {reelPaths ? shortenPath(reelPaths.playlistsDir) : '…'}
                </code>
              </div>
            </div>
            <button
              onClick={() => browsePath('playlists')}
              disabled={browsing === 'playlists'}
              className="shrink-0 ml-2 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-700/60 border border-zinc-600/50 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
            >
              {browsing === 'playlists' ? '…' : 'Change'}
            </button>
          </div>
        </div>

        {/* Visualizer */}
        <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Visualizer</p>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/40">
            <div className="flex items-center gap-2 min-w-0">
              <AudioWaveform size={13} className="text-zinc-500 shrink-0" />
              <span className="text-zinc-300 text-sm">Preset</span>
            </div>
            <div className="relative max-w-[58%]">
              <select
                value={selectedPresetName}
                onChange={(e) => setVisualizerPresetName(e.target.value)}
                className="w-full bg-zinc-700/60 border border-zinc-600/50 rounded-lg text-sm text-zinc-300 px-3 py-1.5 pr-7 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none outline-none truncate"
                disabled={presetCatalog.length === 0 || loadingPresetCatalog}
              >
                {presetCatalog.length === 0 ? (
                  <option value="">Unavailable</option>
                ) : (
                  presetCatalog.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.label}</option>
                  ))
                )}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">▾</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/40">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen size={13} className="text-zinc-500 shrink-0" />
              <div className="min-w-0">
                <span className="text-zinc-300 text-sm block">Custom preset folder</span>
                <code className="text-zinc-500 text-[11px] font-mono truncate block max-w-[160px]">
                  {reelPaths?.visualizerPresetsDir
                    ? shortenPath(reelPaths.visualizerPresetsDir)
                    : 'None'}
                </code>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {reelPaths?.visualizerPresetsDir && (
                <button
                  onClick={async () => {
                    const updated = await rpc.proxy.request['visualizer-presets:clear-folder'](undefined as never).catch(() => null);
                    if (updated) {
                      invalidateVisualizerPresetCatalog();
                      setReelPaths(updated);
                    }
                  }}
                  className="text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-700/60 border border-zinc-600/50 rounded-lg px-2.5 py-1 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => browsePath('visualizerPresets')}
                disabled={browsing === 'visualizerPresets'}
                className="text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-700/60 border border-zinc-600/50 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
              >
                {browsing === 'visualizerPresets' ? '…' : 'Change'}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/40">
            <span className="text-zinc-300 text-sm">Rendering profile</span>
            <div className="relative">
              <select
                value={visualizerSettings.quality}
                onChange={(e) => setVisualizerQuality(e.target.value as typeof visualizerSettings.quality)}
                className="bg-zinc-700/60 border border-zinc-600/50 rounded-lg text-sm text-zinc-300 px-3 py-1.5 pr-7 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none outline-none"
              >
                {VISUALIZER_QUALITIES.map((quality) => (
                  <option key={quality.value} value={quality.value}>{quality.label}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">▾</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/40">
            <span className="text-zinc-300 text-sm">Edge smoothing</span>
            <input
              type="checkbox"
              checked={visualizerSettings.fxaa}
              onChange={(e) => setVisualizerFXAA(e.target.checked)}
              className="h-4 w-4 accent-emerald-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/40">
            <span className="text-zinc-300 text-sm">Mesh detail</span>
            <div className="relative">
              <select
                value={visualizerSettings.meshDensity}
                onChange={(e) => setVisualizerMeshDensity(e.target.value as typeof visualizerSettings.meshDensity)}
                className="bg-zinc-700/60 border border-zinc-600/50 rounded-lg text-sm text-zinc-300 px-3 py-1.5 pr-7 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none outline-none"
              >
                {VISUALIZER_MESH_DENSITIES.map((density) => (
                  <option key={density.value} value={density.value}>{density.label}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">▾</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/40">
            <span className="text-zinc-300 text-sm">Auto-cycle order</span>
            <div className="relative">
              <select
                value={visualizerSettings.cycleOrder}
                onChange={(e) => setVisualizerCycleOrder(e.target.value as typeof visualizerSettings.cycleOrder)}
                className="bg-zinc-700/60 border border-zinc-600/50 rounded-lg text-sm text-zinc-300 px-3 py-1.5 pr-7 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none outline-none"
              >
                {VISUALIZER_CYCLE_ORDERS.map((order) => (
                  <option key={order.value} value={order.value}>{order.label}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">▾</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/40">
            <span className="text-zinc-300 text-sm">Auto-cycle presets</span>
            <input
              type="checkbox"
              checked={visualizerSettings.autoCycle}
              onChange={(e) => setVisualizerAutoCycle(e.target.checked)}
              className="h-4 w-4 accent-emerald-500 cursor-pointer"
            />
          </div>

          <div className="px-4 py-2.5 border-t border-zinc-700/40 flex items-center justify-between text-xs gap-2">
            <span className="text-zinc-500 shrink-0">Favorites / Hidden / Visible</span>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-300 font-mono">
                {favoritePresetCount} / {hiddenPresetCount} / {visiblePresetCount}
              </span>
              {favoritePresetCount > 0 && (
                <button
                  onClick={() => resetVisualizerFavorites()}
                  className="text-zinc-500 hover:text-zinc-300 bg-zinc-700/60 border border-zinc-600/50 rounded px-1.5 py-0.5 transition-colors text-[10px]"
                  title="Clear all favorites"
                >
                  Clear favorites
                </button>
              )}
              {hiddenPresetCount > 0 && (
                <button
                  onClick={() => resetVisualizerHidden()}
                  className="text-zinc-500 hover:text-zinc-300 bg-zinc-700/60 border border-zinc-600/50 rounded px-1.5 py-0.5 transition-colors text-[10px]"
                  title="Unhide all hidden presets"
                >
                  Unhide all
                </button>
              )}
            </div>
          </div>

          <div className="px-4 py-2.5 border-t border-zinc-700/40 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Imported Milkdrop presets</span>
            <span className="text-zinc-300 font-mono">
              {loadingPresetCatalog ? '…' : customPresetCount}
            </span>
          </div>

          <div className="px-4 py-3 border-t border-zinc-700/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-zinc-300 text-sm">Cycle duration</span>
              <span className="text-zinc-500 text-xs font-mono">{visualizerSettings.cycleSeconds}s</span>
            </div>
            <input
              type="range"
              min={5}
              max={120}
              step={5}
              value={visualizerSettings.cycleSeconds}
              disabled={!visualizerSettings.autoCycle}
              onChange={(e) => setVisualizerCycleSeconds(Number(e.target.value))}
              className="w-full accent-emerald-500 disabled:opacity-40"
            />
          </div>

          <div className="px-4 py-3 border-t border-zinc-700/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-zinc-300 text-sm">Blend time</span>
              <span className="text-zinc-500 text-xs font-mono">{visualizerSettings.blendSeconds}s</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={visualizerSettings.blendSeconds}
              onChange={(e) => setVisualizerBlendSeconds(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/40">
            <span className="text-zinc-300 text-sm">Frame rate</span>
            <div className="relative">
              <select
                value={visualizerSettings.fps}
                onChange={(e) => setVisualizerFps(Number(e.target.value) as VisualizerFps)}
                className="bg-zinc-700/60 border border-zinc-600/50 rounded-lg text-sm text-zinc-300 px-3 py-1.5 pr-7 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none outline-none"
              >
                <option value={24}>24 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
                <option value={0}>Unlimited</option>
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">▾</span>
            </div>
          </div>
        </div>

        {/* Dependencies */}
        <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Dependencies</p>
          </div>
          <div className="px-4 pb-3 space-y-1 border-t border-zinc-700/40 pt-2.5">
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 text-sm font-mono">yt-dlp</span>
              <span className="text-zinc-500 text-xs">audio downloader</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 text-sm font-mono">ffmpeg</span>
              <span className="text-zinc-500 text-xs">audio conversion</span>
            </div>
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Keyboard Shortcuts</p>
          </div>
          <div className="px-4 pb-3 border-t border-zinc-700/40 pt-2.5">
            <ul className="space-y-1.5 text-xs text-zinc-500">
              {[
                ['Space', 'Play / Pause'],
                ['← / →', 'Seek ±5s (Shift: ±30s)'],
                ['N', 'Next track'],
                ['M', 'Mute / Unmute'],
              ].map(([key, desc]) => (
                <li key={key} className="flex items-center justify-between">
                  <span className="text-zinc-300 font-mono bg-zinc-700/50 px-1.5 py-0.5 rounded text-[11px]">{key}</span>
                  <span>{desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </main>
  );
}
