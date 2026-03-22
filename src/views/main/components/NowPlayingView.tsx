import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useUnit } from 'effector-react';
import {
  Play,
  Pause,
  Heart,
  Music2,
  ListMusic,
  Mic2,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import {
  $player,
  jumpToQueueIndex,
  removeFromQueue,
  pause,
  resume,
} from '../stores/player';
import { navToAlbum, navToArtist, navChanged } from '../stores/nav';
import { $favourites, toggleFavourite } from '../stores/favourites';
import { $search, removeTrackFx } from '../stores/downloads';
import {
  $nowPlayingSpectrumStyle,
  $nowPlayingSpectrumVisible,
  patchAppSettings,
  type NowPlayingSpectrumStyle,
} from '../stores/appSettings';
import { rpc } from '../rpc';
import { createFuzzySearchMatcher } from '../lib/search';
import { confirmQueueRemoval } from '../lib/destructiveActionConfirm';
import type { LyricLine } from '../../../shared/types';
import ContextMenu, { type ContextMenuEntry } from './ContextMenu';
import ResizablePaneLayout from './ResizablePaneLayout';
import SpectrumAnalyzer from './SpectrumAnalyzer';
import { useContextMenu } from '../hooks/useContextMenu';

type Tab = 'queue' | 'lyrics';

const NOW_PLAYING_SPECTRUM_STYLE_OPTIONS: { value: NowPlayingSpectrumStyle; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'dense', label: 'Dense Bands' },
];

interface Props {
  showSidebar: boolean;
  onShowSidebarChange: (visible: boolean) => void;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function NowPlayingView({
  showSidebar,
  onShowSidebarChange: setShowSidebar,
  activeTab: tab,
  onTabChange: setTab,
}: Props) {
  const player = useUnit($player);
  const favourites = useUnit($favourites);
  const search = useUnit($search);
  const nowPlayingSpectrumVisible = useUnit($nowPlayingSpectrumVisible);
  const nowPlayingSpectrumStyle = useUnit($nowPlayingSpectrumStyle);
  const { pos: albumArtMenuPos, open: openAlbumArtMenu, close: closeAlbumArtMenu } = useContextMenu();
  const [showConfig, setShowConfig] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const activeRef = useRef<HTMLDivElement>(null);
  const activeQueueItemRef = useRef<HTMLDivElement>(null);
  const lastQueueScrollTrackIdRef = useRef<string | null>(null);
  const configButtonRef = useRef<HTMLButtonElement>(null);
  const configPanelRef = useRef<HTMLDivElement>(null);
  const current = player.current;

  const titleContainerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [marqueeShift, setMarqueeShift] = useState(0);

  useLayoutEffect(() => {
    const titleEl = titleRef.current;
    const containerEl = titleContainerRef.current;
    if (!titleEl || !containerEl) {
      setMarqueeShift(0);
      return;
    }

    const overflow = titleEl.scrollWidth - containerEl.clientWidth;
    setMarqueeShift(overflow > 4 ? overflow : 0);
  }, [current?.track.title]);

  const [bgState, setBgState] = useState<{
    slots: [string | undefined, string | undefined];
    active: 0 | 1;
  }>({
    slots: [current?.coverArt, undefined],
    active: 0,
  });

  useEffect(() => {
    const art = current?.coverArt;
    setBgState((prev) => {
      const next = prev.active === 0 ? 1 : 0;
      const slots: [string | undefined, string | undefined] = [prev.slots[0], prev.slots[1]];
      slots[next] = art;
      return {
        slots,
        active: next,
      };
    });
  }, [current?.coverArt]);

  useEffect(() => {
    if (!current) {
      setLyrics(null);
      return;
    }

    setLyricsLoading(true);
    setLyrics(null);
    rpc.proxy.request['lyrics:get']({ artist: current.track.artist, title: current.track.title })
      .then((lines) => setLyrics(lines))
      .catch(() => setLyrics(null))
      .finally(() => setLyricsLoading(false));
  }, [current?.track.artist, current?.track.title]);

  const activeLine = useMemo(() => {
    if (!lyrics) return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= player.currentTime) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, player.currentTime]);

  const visibleQueue = useMemo(() => {
    const matchesSearch = createFuzzySearchMatcher(search);
    return player.queue
      .map((item, queueIdx) => ({ item, queueIdx }))
      .filter(({ item, queueIdx }) =>
        queueIdx === player.queueIndex || matchesSearch(item.track.title)
      );
  }, [player.queue, player.queueIndex, search]);

  useEffect(() => {
    if (tab === 'lyrics' && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLine, tab]);

  useEffect(() => {
    closeAlbumArtMenu();
  }, [closeAlbumArtMenu, current?.track.id]);

  useEffect(() => {
    if (!showConfig) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (configPanelRef.current?.contains(target) || configButtonRef.current?.contains(target)) {
        return;
      }
      setShowConfig(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowConfig(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showConfig]);

  const isFav = current ? favourites.includes(current.track.id) : false;

  useLayoutEffect(() => {
    if (!current || !showSidebar || tab !== 'queue') return;

    const activeQueueItem = activeQueueItemRef.current;
    if (!activeQueueItem) return;

    const behavior: ScrollBehavior =
      lastQueueScrollTrackIdRef.current !== null && lastQueueScrollTrackIdRef.current !== current.track.id
        ? 'smooth'
        : 'auto';

    activeQueueItem.scrollIntoView({ behavior, block: 'center' });
    lastQueueScrollTrackIdRef.current = current.track.id;
  }, [current, player.queue.length, player.queueIndex, search, showSidebar, tab]);

  const removeQueueTrack = async (queueIdx: number) => {
    const queued = player.queue[queueIdx];
    if (!queued) return;
    if (!(await confirmQueueRemoval(queued.track))) return;
    removeFromQueue(queueIdx);
  };

  if (!current) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center text-zinc-600"
        style={{ gap: 'clamp(0.9rem, 2.2vmin, 1.4rem)' }}
      >
        <Music2
          strokeWidth={1}
          style={{ width: 'clamp(3rem, 7vmin, 4rem)', height: 'clamp(3rem, 7vmin, 4rem)' }}
        />
        <p style={{ fontSize: 'clamp(0.85rem, 1.5vmin, 1rem)' }}>Nothing is playing yet</p>
        <button
          onClick={() => navChanged('albums')}
          className="text-emerald-400 hover:text-emerald-300 border border-emerald-400/30 hover:border-emerald-400/60 rounded-lg transition-colors"
          style={{
            fontSize: 'clamp(0.7rem, 1vmin, 0.8rem)',
            paddingInline: 'clamp(0.85rem, 2vmin, 1rem)',
            paddingBlock: 'clamp(0.45rem, 1.1vmin, 0.55rem)',
          }}
        >
          Browse Library
        </button>
      </div>
    );
  }

  const albumArtMenuItems: ContextMenuEntry[] = [
    {
      label: player.isPlaying ? 'Pause' : 'Resume',
      icon: player.isPlaying ? <Pause size={13} /> : <Play size={13} className="fill-current" />,
      onClick: () => {
        if (player.isPlaying) pause();
        else resume();
      },
    },
    { separator: true },
    {
      label: isFav ? 'Remove from Favourites' : 'Add to Favourites',
      icon: <Heart size={13} fill={isFav ? 'currentColor' : 'none'} />,
      onClick: () => toggleFavourite(current.track.id),
    },
    { separator: true },
    {
      label: 'Go to Artist',
      icon: <Mic2 size={13} />,
      onClick: () => navToArtist(current.track.artist),
    },
    {
      label: 'Go to Album',
      icon: <Music2 size={13} />,
      onClick: () => {
        if (current.downloadId) navToAlbum(current.downloadId);
      },
      disabled: !current.downloadId,
    },
    { separator: true },
    {
      label: 'Remove track',
      icon: <Trash2 size={13} />,
      onClick: () => {
        if (current.downloadId) {
          removeTrackFx({ downloadId: current.downloadId, trackId: current.track.id });
        }
      },
      disabled: !current.downloadId,
      danger: true,
    },
  ];

  const sidePanel = (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-zinc-950/30 backdrop-blur-md">
      <div className="flex border-b border-zinc-700/60 shrink-0">
        {(['queue', 'lyrics'] as Tab[]).map((panelTab) => (
          <button
            key={panelTab}
            onClick={() => setTab(panelTab)}
            className={`flex flex-1 items-center justify-center font-semibold uppercase leading-none tracking-wider transition-colors ${
              tab === panelTab
                ? 'text-zinc-100 border-b-2 border-emerald-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            style={{
              paddingBlock: 'clamp(0.65rem, 1.3vmin, 0.85rem)',
              fontSize: 'clamp(0.62rem, 0.95vmin, 0.78rem)',
            }}
          >
            {panelTab === 'queue'
              ? `Queue${visibleQueue.length > 0 ? ` · ${visibleQueue.length}` : ''}`
              : 'Lyrics'}
          </button>
        ))}
      </div>

      {tab === 'queue' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibleQueue.length === 0 ? (
            <div className="h-full flex items-center justify-center text-zinc-600" style={{ fontSize: 'clamp(0.8rem, 1.15vmin, 0.95rem)' }}>
              Queue is empty
            </div>
          ) : (
            visibleQueue.map(({ item, queueIdx }) => {
              const isCurrent = queueIdx === player.queueIndex;
              const isPlayed = queueIdx < player.queueIndex;

              return (
                <div
                  key={`${item.track.id}:${queueIdx}`}
                  ref={isCurrent ? activeQueueItemRef : undefined}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={`group flex items-center gap-3 border-b border-zinc-100/5 transition-colors ${
                    isCurrent ? 'bg-emerald-400/10' : 'hover:bg-zinc-100/4'
                  } ${isPlayed ? 'opacity-65' : ''}`}
                  style={{
                    padding: 'clamp(0.75rem, 1.5vmin, 0.95rem)',
                    boxShadow: isCurrent ? 'inset 0 0 0 1px rgba(52, 211, 153, 0.18)' : undefined,
                  }}
                >
                  <button
                    onClick={() => {
                      if (!isCurrent) jumpToQueueIndex(queueIdx);
                    }}
                    className={`shrink-0 h-10 w-10 overflow-hidden rounded bg-zinc-800 transition-all ${
                      isCurrent ? 'ring-1 ring-emerald-400/60' : 'hover:ring-1 hover:ring-emerald-400/60'
                    }`}
                    title={isCurrent ? `${item.track.title} is now playing` : `Play ${item.track.title}`}
                  >
                    {item.coverArt ? (
                      <img src={item.coverArt} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ListMusic size={16} className="text-zinc-600" />
                      </div>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => {
                        if (!isCurrent) jumpToQueueIndex(queueIdx);
                      }}
                      className={`block w-full truncate text-left transition-colors ${
                        isCurrent ? 'text-emerald-100' : 'text-zinc-200 hover:text-zinc-100'
                      }`}
                      style={{ fontSize: 'clamp(0.8rem, 1.05vmin, 0.95rem)' }}
                      title={item.track.title}
                    >
                      {item.track.title}
                    </button>
                    <div className="flex items-center gap-1.5 text-zinc-500" style={{ fontSize: 'clamp(0.72rem, 0.9vmin, 0.82rem)' }}>
                      <button
                        onClick={() => navToArtist(item.track.artist)}
                        className="truncate transition-colors hover:text-zinc-300"
                        title={item.track.artist}
                      >
                        {item.track.artist}
                      </button>
                      <span>·</span>
                      <button
                        onClick={() => item.downloadId && navToAlbum(item.downloadId)}
                        className="truncate transition-colors hover:text-zinc-300"
                        title={item.albumName}
                      >
                        {item.albumName}
                      </button>
                    </div>
                  </div>

                  {isCurrent ? (
                    <div className="flex shrink-0 items-center gap-1.5 text-emerald-200">
                      <button
                        onClick={() => pause()}
                        className="transition-colors hover:text-emerald-100 disabled:cursor-default disabled:text-emerald-200/45"
                        aria-label="Pause current track"
                        disabled={!player.isPlaying}
                      >
                        <Pause size={14} />
                      </button>
                      <button
                        onClick={() => removeQueueTrack(queueIdx)}
                        className="text-zinc-500 transition-colors hover:text-red-400"
                        aria-label="Remove current track from queue"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => jumpToQueueIndex(queueIdx)}
                        className="text-zinc-500 transition-colors hover:text-emerald-300"
                        aria-label="Play queued track"
                      >
                        <Play size={14} className="fill-current" />
                      </button>
                      <button
                        onClick={() => removeQueueTrack(queueIdx)}
                        className="text-zinc-600 transition-colors hover:text-red-400"
                        aria-label="Remove from queue"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'lyrics' && (
        <div
          className="min-h-0 flex-1 overflow-y-auto space-y-1"
          style={{
            padding: 'clamp(0.9rem, 2vmin, 1.3rem)',
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
          }}
        >
          {lyricsLoading && (
            <div className="space-y-2.5 mt-8 pr-2">
              {[75, 55, 88, 45, 68, 82, 50, 72, 60].map((width, i) => (
                <div
                  key={i}
                  className="h-2.5 bg-zinc-700/50 rounded-full animate-pulse"
                  style={{ width: `${width}%`, animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
          )}

          {!lyricsLoading && !lyrics && (
            <p className="text-zinc-600 text-center mt-8" style={{ fontSize: 'clamp(0.8rem, 1.2vmin, 0.95rem)' }}>
              No lyrics found
            </p>
          )}

          {lyrics && lyrics.map((line, i) => {
            const isActive = i === activeLine;
            return (
              <div
                key={i}
                ref={isActive ? activeRef : undefined}
                className={`leading-relaxed transition-all duration-200 origin-left ${
                  isActive
                    ? 'text-zinc-100 font-medium scale-105'
                    : i < activeLine
                    ? 'text-zinc-600'
                    : 'text-zinc-400'
                }`}
                style={{
                  fontSize: 'clamp(0.84rem, 1.2vmin, 1.02rem)',
                  ...(isActive ? { textShadow: 'var(--now-playing-active-lyric-shadow)' } : {}),
                }}
              >
                {line.text || '\u00a0'}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const mainContent = (
    <div className="relative flex h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
      <div
        className="absolute z-20"
        style={{
          top: 'clamp(1rem, 2.4vmin, 1.6rem)',
          right: 'clamp(1rem, 2.8vmin, 1.75rem)',
        }}
      >
        <div className="relative flex justify-end">
          <button
            ref={configButtonRef}
            onClick={() => setShowConfig((visible) => !visible)}
            title={showConfig ? 'Close now playing settings' : 'Configure now playing'}
            className={`flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md transition-colors ${
              showConfig
                ? 'border-emerald-400/60 bg-zinc-950/55 text-zinc-100 shadow-lg shadow-black/30'
                : 'border-zinc-100/10 bg-zinc-950/35 text-zinc-400 hover:border-zinc-100/20 hover:bg-zinc-950/50 hover:text-zinc-100'
            }`}
            aria-label={showConfig ? 'Close now playing settings' : 'Open now playing settings'}
            aria-expanded={showConfig}
            aria-haspopup="dialog"
          >
            <Settings size={18} />
          </button>

          {showConfig && (
            <div
              ref={configPanelRef}
              role="dialog"
              aria-label="Now playing settings"
              className="absolute right-0 top-full mt-3 flex flex-col gap-3 rounded-2xl border border-zinc-100/10 bg-zinc-950/90 p-3 shadow-2xl backdrop-blur-2xl"
              style={{
                width: 'min(22rem, calc(100vw - 2rem))',
              }}
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Now Playing</p>
                <p className="mt-1 text-sm text-zinc-300">Quick controls for the right sidebar.</p>
              </div>

              <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-100/10 bg-zinc-100/[0.03] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">Show sidebar</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Toggle the queue and lyrics panel on the right.</p>
                </div>
                <input
                  type="checkbox"
                  checked={showSidebar}
                  onChange={(e) => setShowSidebar(e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-100/10 bg-zinc-100/[0.03] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">Show spectrum</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Display the live frequency analyzer under track info.</p>
                </div>
                <input
                  type="checkbox"
                  checked={nowPlayingSpectrumVisible}
                  onChange={(e) => patchAppSettings({ nowPlayingSpectrumVisible: e.target.checked })}
                  className="h-4 w-4 shrink-0 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-100/10 bg-zinc-100/[0.03] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">Spectrum style</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Choose the visual style of the analyzer bars.</p>
                </div>
                <div className="relative w-36 shrink-0">
                  <select
                    value={nowPlayingSpectrumStyle}
                    onChange={(e) =>
                      patchAppSettings({
                        nowPlayingSpectrumStyle: e.target.value as NowPlayingSpectrumStyle,
                      })
                    }
                    disabled={!nowPlayingSpectrumVisible}
                    className="w-full rounded-lg border border-zinc-700/70 bg-zinc-900/80 px-2.5 py-1.5 pr-7 text-xs text-zinc-200 outline-none transition-colors hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {NOW_PLAYING_SPECTRUM_STYLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">▾</span>
                </div>
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-full w-full flex-col">
        <div
          className="flex flex-1 w-full flex-col items-center justify-center"
          style={{
            gap: 'clamp(1.1rem, 2.6vmin, 2rem)',
            paddingInline: 'clamp(1rem, 4vmin, 3.25rem)',
            paddingTop: 'clamp(1.35rem, 4.8vmin, 3.4rem)',
            paddingBottom: 0,
          }}
        >
        <div
          className="aspect-square rounded-2xl overflow-hidden shadow-2xl shadow-black/60"
          style={{ width: 'clamp(15rem, 46vmin, 34rem)' }}
          onContextMenu={openAlbumArtMenu}
          title="Right-click for track actions"
        >
          {current.coverArt ? (
            <img
              src={current.coverArt}
              alt="Album art"
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
              <Music2
                strokeWidth={1}
                className="text-zinc-600"
                style={{ width: 'clamp(3rem, 9vmin, 5rem)', height: 'clamp(3rem, 9vmin, 5rem)' }}
              />
            </div>
          )}
        </div>

        {albumArtMenuPos && (
          <ContextMenu
            x={albumArtMenuPos.x}
            y={albumArtMenuPos.y}
            onClose={closeAlbumArtMenu}
            items={albumArtMenuItems}
          />
        )}

        <div className="w-full text-center space-y-1.5" style={{ maxWidth: 'min(38rem, 70vw)' }}>
          <div className="flex items-center justify-center gap-2">
            <div ref={titleContainerRef} className="overflow-hidden min-w-0">
              <h2
                ref={titleRef}
                className="font-bold text-zinc-100 cursor-pointer hover:underline whitespace-nowrap"
                onClick={() => current.downloadId && navToAlbum(current.downloadId)}
                title={current.track.title}
                style={
                  marqueeShift > 0
                    ? ({
                        display: 'inline-block',
                        animation: 'marquee-scroll 8s ease-in-out infinite alternate',
                        '--marquee-shift': `-${marqueeShift}px`,
                        fontSize: 'clamp(1.45rem, 3.8vmin, 3rem)',
                        lineHeight: '1.05',
                      } as React.CSSProperties)
                    : ({
                        fontSize: 'clamp(1.45rem, 3.8vmin, 3rem)',
                        lineHeight: '1.05',
                      } as React.CSSProperties)
                }
              >
                {current.track.title}
              </h2>
            </div>
            <button
              onClick={() => toggleFavourite(current.track.id)}
              className={`shrink-0 transition-colors ${isFav ? 'text-rose-400' : 'text-zinc-600 hover:text-rose-400'}`}
              aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
            >
              <Heart
                fill={isFav ? 'currentColor' : 'none'}
                style={{ width: 'clamp(1rem, 2vmin, 1.35rem)', height: 'clamp(1rem, 2vmin, 1.35rem)' }}
              />
            </button>
          </div>

          <button
            className="text-zinc-400 hover:text-zinc-200 hover:underline flex items-center gap-1.5 mx-auto transition-colors"
            onClick={() => navToArtist(current.track.artist)}
            style={{ fontSize: 'clamp(0.95rem, 1.8vmin, 1.3rem)' }}
          >
            <Mic2
              className="shrink-0"
              style={{ width: 'clamp(0.75rem, 1.2vmin, 0.95rem)', height: 'clamp(0.75rem, 1.2vmin, 0.95rem)' }}
            />
            {current.track.artist}
          </button>

          <button
            className="text-zinc-500 hover:text-zinc-300 hover:underline transition-colors"
            onClick={() => current.downloadId && navToAlbum(current.downloadId)}
            style={{ fontSize: 'clamp(0.78rem, 1.3vmin, 1rem)' }}
          >
            {current.albumName}
          </button>
        </div>
        </div>
        {nowPlayingSpectrumVisible && (
          <SpectrumAnalyzer style={nowPlayingSpectrumStyle} />
        )}
      </div>
    </div>
  );

  return (
    <div className="now-playing-view relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {([0, 1] as const).map((slot) =>
        bgState.slots[slot] ? (
          <img
            key={slot}
            src={bgState.slots[slot]}
            aria-hidden
            className="now-playing-blur-art absolute inset-0 w-full h-full object-cover scale-150 pointer-events-none select-none"
            style={{
              opacity: bgState.active === slot ? 1 : 0,
              transition: 'opacity 0.7s ease-out',
            }}
          />
        ) : null
      )}

      <div className="now-playing-overlay absolute inset-0 pointer-events-none" />

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {showSidebar ? (
          <ResizablePaneLayout
            side="right"
            storageKey="reel:now-playing-panel-width"
            defaultWidth={360}
            minPaneWidth={240}
            maxPaneWidth={520}
            minContentWidth={480}
            pane={sidePanel}
          >
            {mainContent}
          </ResizablePaneLayout>
        ) : (
          <div className="flex-1 min-w-0 min-h-0 overflow-hidden">{mainContent}</div>
        )}
      </div>
    </div>
  );
}
