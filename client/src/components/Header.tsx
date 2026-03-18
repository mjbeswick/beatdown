import { useState } from 'react';
import { useUnit } from 'effector-react';
import { Plus, Music2, Loader2 } from 'lucide-react';
import {
  addDownloadFx,
  $addStatus,
  addPhaseSet,
} from '../stores/downloads';
import { usePersistedState } from '../hooks/usePersistedState';
import type { AudioFormat, QualityPreset } from '../types';

const FORMATS: AudioFormat[] = ['mp3', 'm4a', 'aac', 'flac', 'wav'];
const QUALITIES: { value: QualityPreset; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '320', label: '320 kbps' },
  { value: '256', label: '256 kbps' },
  { value: '192', label: '192 kbps' },
  { value: '128', label: '128 kbps' },
  { value: '96', label: '96 kbps' },
];

export default function Header() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = usePersistedState<AudioFormat>('reel:format', 'm4a');
  const [quality, setQuality] = usePersistedState<QualityPreset>('reel:quality', 'auto');
  const addStatus = useUnit($addStatus);

  const isLoading = addStatus.phase === 'fetching';
  const isError = addStatus.phase === 'error';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || isLoading) return;
    addDownloadFx({ url: trimmed, format, quality });
    setUrl('');
  };

  return (
    <header className="bg-zinc-800 border-b border-zinc-700 px-4 py-2 flex items-center gap-3 shrink-0 h-12">
      {/* Logo */}
      <div className="flex items-center gap-1.5 text-emerald-400 font-semibold w-20 shrink-0">
        <Music2 size={16} />
        <span className="text-base">Reel</span>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1 min-w-0">
        <input
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (isError) addPhaseSet({ phase: 'idle' });
          }}
          placeholder="Paste Spotify URL — track, album, or playlist..."
          disabled={isLoading}
          className={`flex-1 min-w-0 bg-zinc-900 border rounded px-3 py-1 text-sm placeholder:text-zinc-600 outline-none focus:ring-1 transition-colors ${
            isError
              ? 'border-red-500/60 focus:ring-red-500/30'
              : 'border-zinc-700 focus:border-zinc-600 focus:ring-emerald-500/20'
          }`}
        />

        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as AudioFormat)}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300 outline-none focus:border-zinc-600 cursor-pointer"
        >
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>

        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value as QualityPreset)}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300 outline-none focus:border-zinc-600 cursor-pointer"
        >
          {QUALITIES.map((q) => (
            <option key={q.value} value={q.value}>
              {q.label}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={!url.trim() || isLoading}
          className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors shrink-0"
        >
          {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add
        </button>
      </form>

    </header>
  );
}
