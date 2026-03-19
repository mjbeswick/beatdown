import { useEffect, useRef, useState } from 'react';
import { useUnit } from 'effector-react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Heart,
  Music2,
  ListMusic,
  Mic2,
} from 'lucide-react';
import {
  $player,
  togglePlay,
  next,
  prev,
  seek,
  setVolume,
  toggleShuffle,
  toggleRepeat,
} from '../stores/player';
import { navToAlbum, navToArtist } from '../stores/nav';
import { $favourites, toggleFavourite } from '../stores/favourites';
import { $search } from '../stores/downloads';
import { rpc } from '../rpc';
import type { LyricLine } from '../../../shared/types';

type Tab = 'lyrics' | 'queue';

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function NowPlayingView() {
  const player = useUnit($player);
  const favourites = useUnit($favourites);
  const search = useUnit($search);
  const [tab, setTab] = useState<Tab>('lyrics');
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const activeRef = useRef<HTMLDivElement>(null);
  const current = player.current;

  // Two-slot crossfading ambient backdrop
  const [bgSlots, setBgSlots] = useState<[string | undefined, string | undefined]>(
    [current?.coverArt, undefined]
  );
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);

  useEffect(() => {
    const art = current?.coverArt;
    setActiveSlot((prev) => {
      const next = prev === 0 ? 1 : 0;
      setBgSlots((slots) => {
        const updated: [string | undefined, string | undefined] = [slots[0], slots[1]];
        updated[next] = art;
        return updated;
      });
      return next;
    });
  }, [current?.coverArt]);

  // Fetch lyrics when current track changes
  useEffect(() => {
    if (!current) { setLyrics(null); return; }
    setLyricsLoading(true);
    setLyrics(null);
    rpc.proxy.request['lyrics:get']({ artist: current.track.artist, title: current.track.title })
      .then((lines) => setLyrics(lines))
      .catch(() => setLyrics(null))
      .finally(() => setLyricsLoading(false));
  }, [current?.track.artist, current?.track.title]);

  // Auto-scroll active lyric line into view
  useEffect(() => {
    if (tab === 'lyrics' && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [player.currentTime, tab]);

  const getActiveLine = (): number => {
    if (!lyrics) return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= player.currentTime) idx = i;
      else break;
    }
    return idx;
  };

  const activeLine = getActiveLine();

  const isFav = current ? favourites.includes(current.track.id) : false;

  const repeatIcon =
    player.repeat === 'one' ? (
      <Repeat1 size={16} className="text-emerald-400" />
    ) : (
      <Repeat size={16} className={player.repeat === 'all' ? 'text-emerald-400' : ''} />
    );

  const upcomingQueue = player.queue.slice(player.queueIndex + 1).filter(
    (item) => !search || item.track.title.toLowerCase().includes(search.toLowerCase())
  );

  if (!current) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-600">
        <Music2 size={64} strokeWidth={1} />
        <p className="text-sm">Nothing is playing yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden relative">

      {/* ── Ambient blurred backdrop (two-slot crossfade) ── */}
      {([0, 1] as const).map((slot) =>
        bgSlots[slot] ? (
          <img
            key={slot}
            src={bgSlots[slot]}
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover scale-150 pointer-events-none select-none"
            style={{
              filter: 'blur(80px) saturate(1.6) brightness(0.28)',
              opacity: activeSlot === slot ? 1 : 0,
              transition: 'opacity 1.4s ease',
            }}
          />
        ) : null
      )}
      {/* Radial vignette to deepen edges and keep text readable */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 40% 50%, transparent 20%, rgba(0,0,0,0.55) 100%)' }}
      />

      {/* ── Left panel: art + info + controls ── */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-6 flex-1 min-w-0 px-10 py-8">
        {/* Album art */}
        <div
          className={`relative rounded-xl overflow-hidden shadow-2xl shrink-0 transition-transform duration-500 ${
            player.isPlaying ? 'scale-100' : 'scale-95'
          }`}
          style={{ width: 240, height: 240 }}
        >
          {current.coverArt ? (
            <img
              src={current.coverArt}
              alt="Album art"
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-zinc-700 flex items-center justify-center">
              <Music2 size={64} strokeWidth={1} className="text-zinc-500" />
            </div>
          )}
          {/* Subtle playing shimmer overlay */}
          {player.isPlaying && (
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
          )}
        </div>

        {/* Track info */}
        <div className="w-full max-w-xs text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <h2
              className="text-lg font-semibold text-zinc-100 truncate cursor-pointer hover:underline"
              onClick={() => current.downloadId && navToAlbum(current.downloadId)}
              title={current.track.title}
            >
              {current.track.title}
            </h2>
            <button
              onClick={() => toggleFavourite(current.track.id)}
              className={`shrink-0 transition-colors ${isFav ? 'text-rose-400' : 'text-zinc-600 hover:text-rose-400'}`}
              aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
            >
              <Heart size={16} fill={isFav ? 'currentColor' : 'none'} />
            </button>
          </div>
          <button
            className="text-sm text-zinc-400 hover:text-zinc-200 hover:underline flex items-center gap-1 mx-auto transition-colors"
            onClick={() => navToArtist(current.track.artist)}
          >
            <Mic2 size={12} className="shrink-0" />
            {current.track.artist}
          </button>
          <p className="text-xs text-zinc-500 truncate">{current.albumName}</p>
        </div>

        {/* Seeker */}
        <div className="w-full max-w-xs space-y-1">
          <input
            type="range"
            min={0}
            max={player.duration || 1}
            step={0.1}
            value={player.currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full h-1 accent-emerald-400 cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-zinc-500">
            <span>{formatTime(player.currentTime)}</span>
            <span>{formatTime(player.duration)}</span>
          </div>
        </div>

        {/* Transport controls */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => toggleShuffle()}
            className={`transition-colors ${player.shuffle === 'on' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            aria-label="Shuffle"
          >
            <Shuffle size={16} />
          </button>
          <button
            onClick={() => prev()}
            className="text-zinc-300 hover:text-white transition-colors"
            aria-label="Previous"
          >
            <SkipBack size={22} />
          </button>
          <button
            onClick={() => togglePlay()}
            className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-900 flex items-center justify-center hover:bg-zinc-300 transition-colors shadow-lg shrink-0 ring-1 ring-zinc-300/50"
            aria-label={player.isPlaying ? 'Pause' : 'Play'}
          >
            {player.isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
          </button>
          <button
            onClick={() => next()}
            className="text-zinc-300 hover:text-white transition-colors"
            aria-label="Next"
          >
            <SkipForward size={22} />
          </button>
          <button
            onClick={() => toggleRepeat()}
            className={`transition-colors ${player.repeat !== 'off' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            aria-label="Repeat"
          >
            {repeatIcon}
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2 w-full max-w-xs">
          <button
            onClick={() => setVolume(player.volume > 0 ? 0 : 0.8)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
            aria-label="Mute"
          >
            {player.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={player.volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="flex-1 h-1 accent-emerald-400 cursor-pointer"
          />
        </div>
      </div>

      {/* ── Right panel: lyrics / queue ── */}
      <div className="relative z-10 w-72 shrink-0 flex flex-col border-l border-white/10 bg-black/30 backdrop-blur-md">
        {/* Tabs */}
        <div className="flex border-b border-zinc-700/60 shrink-0">
          {(['lyrics', 'queue'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                tab === t
                  ? 'text-zinc-100 border-b-2 border-emerald-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'lyrics' ? 'Lyrics' : 'Queue'}
            </button>
          ))}
        </div>

        {/* Lyrics tab */}
        {tab === 'lyrics' && (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
            {lyricsLoading && (
              <p className="text-zinc-600 text-sm text-center mt-8">Loading…</p>
            )}
            {!lyricsLoading && !lyrics && (
              <p className="text-zinc-600 text-sm text-center mt-8">No lyrics found</p>
            )}
            {lyrics &&
              lyrics.map((line, i) => {
                const isActive = i === activeLine;
                return (
                  <div
                    key={i}
                    ref={isActive ? activeRef : undefined}
                    className={`text-sm leading-relaxed transition-all duration-200 origin-left ${
                      isActive
                        ? 'text-white font-medium scale-105'
                        : i < activeLine
                        ? 'text-zinc-600'
                        : 'text-zinc-400'
                    }`}
                  >
                    {line.text || '\u00a0'}
                  </div>
                );
              })}
          </div>
        )}

        {/* Queue tab */}
        {tab === 'queue' && (
          <div className="flex-1 overflow-y-auto py-2">
            {upcomingQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-600">
                <ListMusic size={32} strokeWidth={1} />
                <p className="text-xs">Queue is empty</p>
              </div>
            ) : (
              upcomingQueue.map((item, i) => (
                <div
                  key={`${item.downloadId}-${i}`}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-700/30 transition-colors cursor-default"
                >
                  <span className="text-[11px] text-zinc-600 w-4 text-right shrink-0">
                    {player.queueIndex + 2 + i}
                  </span>
                  {item.coverArt ? (
                    <img
                      src={item.coverArt}
                      alt=""
                      className="w-8 h-8 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-zinc-700 flex items-center justify-center shrink-0">
                      <Music2 size={12} className="text-zinc-500" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-200 truncate">{item.track.title}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{item.track.artist}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
