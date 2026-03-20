import { useUnit } from 'effector-react';
import { Waves } from 'lucide-react';
import { $appSettings, patchAppSettings } from '../stores/appSettings';

interface Props {
  className?: string;
}

export default function WaveformSettingsCard({
  className = 'bg-zinc-800/50 border border-zinc-700/60 rounded-xl overflow-hidden',
}: Props) {
  const appSettings = useUnit($appSettings);

  return (
    <div className={className}>
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Waveform</p>
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
          min={1}
          max={8}
          step={1}
          value={appSettings.waveformBarWidth}
          onChange={(e) => patchAppSettings({ waveformBarWidth: Number(e.target.value) })}
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
            {appSettings.waveformBarRadius === Math.floor(appSettings.waveformBarWidth / 2)
              ? 'Full'
              : `${appSettings.waveformBarRadius}px`}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.floor(appSettings.waveformBarWidth / 2)}
          step={1}
          value={appSettings.waveformBarRadius}
          onChange={(e) => patchAppSettings({ waveformBarRadius: Number(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>
    </div>
  );
}
