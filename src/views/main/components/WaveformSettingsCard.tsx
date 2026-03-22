import { useUnit } from 'effector-react';
import { Waves } from 'lucide-react';
import {
  $appSettings,
  MAX_WAVEFORM_BAR_WIDTH,
  MAX_WAVEFORM_HEIGHT,
  MIN_WAVEFORM_BAR_WIDTH,
  MIN_WAVEFORM_HEIGHT,
  getWaveformBarMaxRadius,
  getWaveformBarRadius,
  patchAppSettings,
  type PlayerSeekerStyle,
} from '../stores/appSettings';

interface Props {
  className?: string;
}

const SELECT_CLASS = 'w-full bg-zinc-700/60 border border-zinc-600/50 rounded-lg text-sm text-zinc-300 px-3 py-1.5 pr-7 cursor-pointer hover:bg-zinc-700 transition-colors appearance-none outline-none';
const SELECT_WRAP_CLASS = 'relative w-[clamp(12rem,34%,18rem)] shrink-0';

const SEEKER_STYLE_OPTIONS: { value: PlayerSeekerStyle; label: string }[] = [
  { value: 'bar', label: 'Progress bar' },
  { value: 'waveform', label: 'Mini waveform' },
];

export default function WaveformSettingsCard({
  className = 'bg-zinc-800/50 border border-zinc-700/60 rounded-xl overflow-hidden',
}: Props) {
  const appSettings = useUnit($appSettings);
  const maxBarRadius = getWaveformBarMaxRadius(appSettings.waveformBarWidth);
  const barRadius = getWaveformBarRadius(appSettings);
  const showWaveformOptions = appSettings.playerSeekerStyle === 'waveform';

  return (
    <div className={className}>
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Seeker</p>
      </div>

      <div className="px-4 py-3 border-t border-zinc-700/40">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-zinc-300 text-sm">Player seeker</p>
            <p className="mt-0.5 text-zinc-500 text-xs">Choose between the classic progress bar and a compact waveform.</p>
          </div>
          <div className={SELECT_WRAP_CLASS}>
            <select
              value={appSettings.playerSeekerStyle}
              onChange={(e) => patchAppSettings({ playerSeekerStyle: e.target.value as PlayerSeekerStyle })}
              className={SELECT_CLASS}
            >
              {SEEKER_STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">▾</span>
          </div>
        </div>
      </div>

      {!showWaveformOptions && (
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 border-t border-zinc-700/40">
          <div className="min-w-0">
            <p className="text-zinc-300 text-sm">Pulse seeker dot with audio</p>
            <p className="mt-0.5 text-zinc-500 text-xs">Locks to detected beat timing when available, with live audio fallback while timing data loads.</p>
          </div>
          <input
            type="checkbox"
            checked={appSettings.playerSeekerBeatPulse}
            onChange={(e) => patchAppSettings({ playerSeekerBeatPulse: e.target.checked })}
            className="h-4 w-4 shrink-0 accent-emerald-500 cursor-pointer"
          />
        </div>
      )}

      {showWaveformOptions && (
        <>
          <div className="px-4 pt-3 pb-1 border-t border-zinc-700/40">
            <div className="flex items-start gap-2">
              <Waves size={13} className="text-zinc-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-zinc-300 text-sm">Mini waveform appearance</p>
                <p className="mt-0.5 text-zinc-500 text-xs">These controls update the waveform shown in the player panel.</p>
              </div>
            </div>
          </div>

          <div className="px-4 py-3 border-t border-zinc-700/40">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Waves size={13} className="text-zinc-500" />
                <span className="text-zinc-300 text-sm">Bar width</span>
              </div>
              <span className="text-zinc-500 text-xs font-mono">{appSettings.waveformBarWidth}px</span>
            </div>
            <input
              type="range"
              min={MIN_WAVEFORM_BAR_WIDTH}
              max={MAX_WAVEFORM_BAR_WIDTH}
              step={1}
              value={appSettings.waveformBarWidth}
              onChange={(e) => patchAppSettings({ waveformBarWidth: Number(e.target.value) })}
              className="w-full accent-emerald-500"
            />
          </div>

          <div className="px-4 py-3 border-t border-zinc-700/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-zinc-300 text-sm">Waveform height</span>
              <span className="text-zinc-500 text-xs font-mono">{appSettings.waveformHeight}px</span>
            </div>
            <input
              type="range"
              min={MIN_WAVEFORM_HEIGHT}
              max={MAX_WAVEFORM_HEIGHT}
              step={1}
              value={appSettings.waveformHeight}
              onChange={(e) => patchAppSettings({ waveformHeight: Number(e.target.value) })}
              className="w-full accent-emerald-500"
            />
          </div>

          <div className="px-4 py-3 border-t border-zinc-700/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-zinc-300 text-sm">Bar gap</span>
              <span className="text-zinc-500 text-xs font-mono">{appSettings.waveformBarGap}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={4}
              step={1}
              value={appSettings.waveformBarGap}
              onChange={(e) => patchAppSettings({ waveformBarGap: Number(e.target.value) })}
              className="w-full accent-emerald-500"
            />
          </div>

          <div className="px-4 py-3 border-t border-zinc-700/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-zinc-300 text-sm">Bar rounding</span>
              <span className="text-zinc-500 text-xs font-mono">
                {appSettings.waveformBarFullRounding
                  ? 'Full'
                  : `${barRadius}px`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={maxBarRadius}
              step={1}
              value={barRadius}
              onChange={(e) => {
                const nextRadius = Number(e.target.value);
                patchAppSettings({
                  waveformBarRadius: nextRadius,
                  waveformBarFullRounding: nextRadius === maxBarRadius,
                });
              }}
              className="w-full accent-emerald-500"
            />
          </div>
        </>
      )}
    </div>
  );
}
