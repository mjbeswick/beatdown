import { useEffect, useRef, useState } from 'react';
import { useUnit } from 'effector-react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import PlaylistsView from './components/PlaylistsView';
import AlbumsView from './components/AlbumsView';
import ArtistsView from './components/ArtistsView';
import GenresView from './components/GenresView';
import FavouritesView from './components/FavouritesView';
import VisualizerView from './components/VisualizerView';
import SettingsView from './components/SettingsView';
import NowPlayingView from './components/NowPlayingView';
import PlayerPanel from './components/PlayerPanel';
import LyricsPanel from './components/LyricsPanel';
import StatusBar from './components/StatusBar';
import ErrorModal from './components/ErrorModal';
import DownloadPreviewModal from './components/DownloadPreviewModal';
import CloseConfirmModal from './components/CloseConfirmModal';
import { $nav } from './stores/nav';
import { loadAllFx } from './stores/downloads';
import { loadSettingsFx } from './stores/settingsLoader';
import { checkDepsFx } from './stores/deps';
import { $player, togglePlay, next, prev, seek, setVolume } from './stores/player';
import { $theme } from './stores/theme';
import { usePersistedState } from './hooks/usePersistedState';
import './audio/engine'; // initialize audio engine
import './audio/djEngine'; // initialize DJ crossfade/beatmatch engine

type NowPlayingSidebarTab = 'queue' | 'lyrics';

export default function App() {
  const nav = useUnit($nav);
  const player = useUnit($player);
  const theme = useUnit($theme);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [nowPlayingSidebarVisible, setNowPlayingSidebarVisible] = usePersistedState(
    'reel:now-playing-sidebar-visible',
    true
  );
  const [nowPlayingSidebarTab, setNowPlayingSidebarTab] = useState<NowPlayingSidebarTab>('queue');

  // Apply and track the selected theme across the entire app lifetime.
  useEffect(() => {
    const apply = (prefersDark: boolean) =>
      document.documentElement.classList.toggle('light-theme', !prefersDark);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches);
      const handler = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      apply(theme === 'dark');
    }
  }, [theme]);

  // Load all downloads on startup
  useEffect(() => {
    loadSettingsFx();
    loadAllFx();
    checkDepsFx();
  }, []);

  useEffect(() => {
    if (nav === 'nowplaying' && lyricsOpen) {
      setLyricsOpen(false);
    }
  }, [lyricsOpen, nav]);

  // Ref so the keyboard handler always sees the latest player values without
  // re-attaching the listener on every playback tick.
  const playerRef = useRef({ currentTime: player.currentTime, duration: player.duration, volume: player.volume });
  playerRef.current = { currentTime: player.currentTime, duration: player.duration, volume: player.volume };

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const { currentTime, duration, volume } = playerRef.current;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          seek(Math.max(0, currentTime - (e.shiftKey ? 30 : 5)));
          break;
        case 'ArrowRight':
          seek(Math.min(duration, currentTime + (e.shiftKey ? 30 : 5)));
          break;
        case 'KeyN':
          next();
          break;
        case 'KeyP':
          prev();
          break;
        case 'KeyM':
          setVolume(volume > 0 ? 0 : 0.8);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hasPlayer = !!player.current;
  const globalLyricsOpen = nav === 'nowplaying' ? false : lyricsOpen;
  const lyricsVisible =
    nav === 'nowplaying'
      ? nowPlayingSidebarVisible && nowPlayingSidebarTab === 'lyrics'
      : globalLyricsOpen;

  const handleLyricsToggle = () => {
    if (nav === 'nowplaying') {
      setLyricsOpen(false);

      if (nowPlayingSidebarVisible && nowPlayingSidebarTab === 'lyrics') {
        setNowPlayingSidebarVisible(false);
      } else {
        setNowPlayingSidebarVisible(true);
        setNowPlayingSidebarTab('lyrics');
      }

      return;
    }

    setLyricsOpen((isOpen) => !isOpen);
  };

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-zinc-900 select-none">
      <Header />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />

        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {nav === 'nowplaying' && (
            <NowPlayingView
              showSidebar={nowPlayingSidebarVisible}
              onShowSidebarChange={setNowPlayingSidebarVisible}
              activeTab={nowPlayingSidebarTab}
              onTabChange={setNowPlayingSidebarTab}
            />
          )}
          {nav === 'playlists' && <PlaylistsView />}
          {nav === 'albums' && <AlbumsView />}
          {nav === 'artists' && <ArtistsView />}
          {nav === 'genres' && <GenresView />}
          {nav === 'favourites' && <FavouritesView />}
          {nav === 'visualizer' && <VisualizerView />}
          {nav === 'settings' && <SettingsView />}

          {/* Lyrics panel slides in from right */}
          <LyricsPanel isOpen={globalLyricsOpen} onClose={() => setLyricsOpen(false)} />
        </div>
      </div>

      {hasPlayer ? (
        <PlayerPanel
          onLyricsToggle={handleLyricsToggle}
          lyricsOpen={lyricsVisible}
        />
      ) : (
        <StatusBar />
      )}

      <ErrorModal />
      <CloseConfirmModal />
      <DownloadPreviewModal />
    </div>
  );
}
