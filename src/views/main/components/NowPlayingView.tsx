import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useUnit } from 'effector-react';
import {
  Play,
  Pause,
  Heart,
  Music2,
  ListMusic,
  Mic2,
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
import { rpc } from '../rpc';
import type { LyricLine } from '../../../shared/types';
import ContextMenu, { type ContextMenuEntry } from './ContextMenu';
import ResizablePaneLayout from './ResizablePaneLayout';
import WaveformSeeker from './WaveformSeeker';
import { useContextMenu } from '../hooks/useContextMenu';

type Tab = 'lyrics' | 'queue';

export default function NowPlayingView() {
  const player = useUnit($player);
  const favourites = useUnit($favourites);
  const search = useUnit($search);
  const { pos: albumArtMenuPos, open: openAlbumArtMenu, close: closeAlbumArtMenu } = useContextMenu();
  const [tab, setTab] = useState<Tab>('lyrics');
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const activeRef = useRef<HTMLDivElement>(null);
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

  const [bgSlots, setBgSlots] = useState<[string | undefined, string | undefined]>([
    current?.coverArt,
    undefined,
  ]);
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

  useEffect(() => {
    if (tab === 'lyrics' && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [player.currentTime, tab]);

  useEffect(() => {
    closeAlbumArtMenu();
  }, [closeAlbumArtMenu, current?.track.id]);

  const getActiveLine = (): number => {
    if (!lyrics) return -1;

    let activeIndex = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= player.currentTime) activeIndex = i;
      else break;
    }

    return activeIndex;
  };

  const activeLine = getActiveLine();
  const isFav = current ? favourites.includes(current.track.id) : false;

  const upcomingQueue = player.queue
    .map((item, queueIdx) => ({ item, queueIdx }))
    .slice(player.queueIndex + 1)
    .filter(({ item }) => !search || item.track.title.toLowerCase().includes(search.toLowerCase()));

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

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {([0, 1] as const).map((slot) =>
        bgSlots[slot] ? (
          <img
            key={slot}
            src={bgSlots[slot]}
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover scale-150 pointer-events-none select-none"
            style={{
              filter: 'blur(80px) saturate(1.6) brightness(0.22)',
              opacity: activeSlot === slot ? 1 : 0,
              transition: 'opacity 1.4s ease',
            }}
          />
        ) : null
      )}

      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.3) 0%, transparent 50%, rgba(0,0,0,0.5) 100%)' }}
      />

      <div className="relative z-10 flex flex-1 overflow-hidden">
        <ResizablePaneLayout
          side="right"
          storageKey="reel:now-playing-panel-width"
          defaultWidth={360}
          minPaneWidth={240}
          maxPaneWidth={520}
          minContentWidth={480}
          pane={
            <div className="flex h-full flex-col bg-black/30 backdrop-blur-md">
              <div className="flex border-b border-zinc-700/60 shrink-0">
                {(['lyrics', 'queue'] as Tab[]).map((panelTab) => (
                  <button
                    key={panelTab}
                    onClick={() => setTab(panelTab)}
                    className={`flex-1 font-semibold uppercase tracking-wider transition-colors ${
                      tab === panelTab
                        ? 'text-zinc-100 border-b-2 border-emerald-400'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    style={{
                      paddingBlock: 'clamp(0.65rem, 1.3vmin, 0.85rem)',
                      fontSize: 'clamp(0.62rem, 0.95vmin, 0.78rem)',
                    }}
                  >
                    {panelTab === 'lyrics' ? 'Lyrics' : `Queue${upcomingQueue.length > 0 ? ` · ${upcomingQueue.length}` : ''}`}
                  </button>
                ))}
              </div>

              {tab === 'lyrics' && (
                <div
                  className="flex-1 overflow-y-auto space-y-1"
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
                            ? 'text-white font-medium scale-105'
                            : i < activeLine
                            ? 'text-zinc-600'
                            : 'text-zinc-400'
                        }`}
                        style={{
                          fontSize: 'clamp(0.84rem, 1.2vmin, 1.02rem)',
                          ...(isActive ? { textShadow: '0 0 20px rgba(255,255,255,0.2)' } : {}),
                        }}
                      >
                        {line.text || '\u00a0'}
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === 'queue' && (
                <div className="flex-1 overflow-y-auto">
                  {upcomingQueue.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-600" style={{ fontSize: 'clamp(0.8rem, 1.15vmin, 0.95rem)' }}>
                      Queue is empty
                    </div>
                  ) : (
                    upcomingQueue.map(({ item, queueIdx }) => (
                      <div
                        key={`${item.track.id}:${queueIdx}`}
                        className="group flex items-center gap-3 border-b border-white/5 hover:bg-white/4 transition-colors"
                        style={{ padding: 'clamp(0.75rem, 1.5vmin, 0.95rem)' }}
                      >
                        <button
                          onClick={() => jumpToQueueIndex(queueIdx)}
                          className="shrink-0 w-10 h-10 rounded overflow-hidden bg-zinc-800 hover:ring-1 hover:ring-emerald-400/60 transition-all"
                          title={`Play ${item.track.title}`}
                        >
                          {item.coverArt ? (
                            <img src={item.coverArt} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ListMusic size={16} className="text-zinc-600" />
                            </div>
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => jumpToQueueIndex(queueIdx)}
                            className="block w-full text-left truncate text-zinc-200 hover:text-white transition-colors"
                            style={{ fontSize: 'clamp(0.8rem, 1.05vmin, 0.95rem)' }}
                            title={item.track.title}
                          >
                            {item.track.title}
                          </button>
                          <div className="flex items-center gap-1.5 text-zinc-500" style={{ fontSize: 'clamp(0.72rem, 0.9vmin, 0.82rem)' }}>
                            <button
                              onClick={() => navToArtist(item.track.artist)}
                              className="truncate hover:text-zinc-300 transition-colors"
                              title={item.track.artist}
                            >
                              {item.track.artist}
                            </button>
                            <span>·</span>
                            <button
                              onClick={() => item.downloadId && navToAlbum(item.downloadId)}
                              className="truncate hover:text-zinc-300 transition-colors"
                              title={item.albumName}
                            >
                              {item.albumName}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => jumpToQueueIndex(queueIdx)}
                            className="text-zinc-500 hover:text-emerald-300 transition-colors"
                            aria-label="Play queued track"
                          >
                            <Play size={14} className="fill-current" />
                          </button>
                          <button
                            onClick={() => removeFromQueue(queueIdx)}
                            className="text-zinc-600 hover:text-red-400 transition-colors"
                            aria-label="Remove from queue"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          }
        >
          <div
            className="flex h-full flex-col items-center justify-center min-w-0"
            style={{
              gap: 'clamp(1.25rem, 3vmin, 2.4rem)',
              paddingInline: 'clamp(1rem, 4vmin, 3.25rem)',
              paddingBlock: 'clamp(1rem, 4vmin, 3rem)',
            }}
          >
            <div
              className={`aspect-square rounded-2xl overflow-hidden shadow-2xl transition-all duration-500 ${
                player.isPlaying ? 'scale-100 shadow-black/60' : 'scale-[0.93] shadow-black/40 opacity-80'
              }`}
              style={{ width: 'clamp(12rem, 38vmin, 28rem)' }}
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

            <div className="w-full text-center space-y-1.5" style={{ maxWidth: 'min(34rem, 64vw)' }}>
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

            <WaveformSeeker />
          </div>
        </ResizablePaneLayout>
      </div>
    </div>
  );
}
