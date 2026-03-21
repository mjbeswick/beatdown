import { useUnit } from 'effector-react';
import { Disc3 } from 'lucide-react';
import { $appSettings, patchAppSettings } from '../stores/appSettings';
import type { DjMode } from '../stores/appSettings';

interface Props {
  className?: string;
}

const SELECT_CLASS = 'w-full bg-zinc-700/60 border border-zinc-600/50 rounded-lg text-sm text-zinc-300 px-3 py-1.5 pr-7 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none outline-none';
const SELECT_WRAP_CLASS = 'relative w-[clamp(12rem,34%,18rem)] shrink-0';

const DJ_MODES: { value: DjMode; label: string; description: string }[] = [
  { value: 'off', label: 'Off', description: '' },
  { value: 'gapless', label: 'Gapless', description: 'Preloads the next track for seamless, gap-free transitions' },
  { value: 'crossfade', label: 'Crossfade', description: 'Smooth gain fade between tracks' },
  {
    value: 'beatmatch',
    label: 'Beatmatch',
    description: 'Tempo-match + crossfade; falls back to crossfade when BPM is unavailable',
  },
];

export default function DjSettingsCard({
  className = 'bg-zinc-800/50 border border-zinc-700/60 rounded-xl overflow-hidden',
}: Props) {
  const settings = useUnit($appSettings);
  const activeMode = DJ_MODES.find((m) => m.value === settings.djMode)!;

  return (
    <div className={className}>
      <div className="px-4 pt-3 pb-1">
        <div className="mb-2 flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Auto DJing
          </p>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-300">
            Beta
          </span>
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-700/40">
        <div className="flex items-center gap-2">
          <Disc3 size={13} className="text-zinc-500" />
          <span className="text-zinc-300 text-sm">Mode</span>
        </div>
        <div className={SELECT_WRAP_CLASS}>
          <select
            value={settings.djMode}
            onChange={(e) => patchAppSettings({ djMode: e.target.value as DjMode })}
            className={SELECT_CLASS}
          >
            {DJ_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">
            ▾
          </span>
        </div>
      </div>

      {/* Description */}
      {activeMode.description && (
        <p className="px-4 pb-2 text-[11px] text-zinc-500 leading-snug">
          {activeMode.description}
        </p>
      )}

      {/* Crossfade duration — only shown for crossfade/beatmatch modes */}
      {settings.djMode !== 'off' && settings.djMode !== 'gapless' && (
        <div className="px-4 py-3 border-t border-zinc-700/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-300 text-sm">Crossfade duration</span>
            <span className="text-zinc-500 text-xs font-mono">{settings.crossfadeDuration}s</span>
          </div>
          <input
            type="range"
            min={2}
            max={16}
            step={1}
            value={settings.crossfadeDuration}
            onChange={(e) => patchAppSettings({ crossfadeDuration: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </div>
      )}
    </div>
  );
}
