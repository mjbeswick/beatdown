import { useEffect, useState } from 'react';
import { useUnit } from 'effector-react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import PlaylistsView from './components/PlaylistsView';
import AlbumsView from './components/AlbumsView';
import ArtistsView from './components/ArtistsView';
import GenresView from './components/GenresView';
import VisualizerView from './components/VisualizerView';
import SettingsView from './components/SettingsView';
import PlayerPanel from './components/PlayerPanel';
import LyricsPanel from './components/LyricsPanel';
import StatusBar from './components/StatusBar';
import ErrorModal from './components/ErrorModal';
import DownloadPreviewModal from './components/DownloadPreviewModal';import CloseConfirmModal from './components/CloseConfirmModal';import { $nav } from './stores/nav';
import { loadAllFx } from './stores/downloads';
import { $player, togglePlay, next, prev, seek, setVolume } from './stores/player';
import './audio/engine'; // initialize audio engine

export default function App() {
  const nav = useUnit($nav);
  const player = useUnit($player);
  const [lyricsOpen, setLyricsOpen] = useState(false);

  // Load all downloads on startup
  useEffect(() => {
    loadAllFx();
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          seek(Math.max(0, player.currentTime - (e.shiftKey ? 30 : 5)));
          break;
        case 'ArrowRight':
          seek(Math.min(player.duration, player.currentTime + (e.shiftKey ? 30 : 5)));
          break;
        case 'KeyN':
          next();
          break;
        case 'KeyM':
          setVolume(player.volume > 0 ? 0 : 0.8);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player.currentTime, player.duration, player.volume]);

  const hasPlayer = !!player.current;

  return (
    <div className="flex flex-col h-screen bg-zinc-900 overflow-hidden">
      <Header />

      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar />

        <div className="flex-1 flex overflow-hidden relative">
          {nav === 'playlists' && <PlaylistsView />}
          {nav === 'albums' && <AlbumsView />}
          {nav === 'artists' && <ArtistsView />}
          {nav === 'genres' && <GenresView />}
          {nav === 'visualizer' && <VisualizerView />}
          {nav === 'settings' && <SettingsView />}

          {/* Lyrics panel slides in from right */}
          <LyricsPanel isOpen={lyricsOpen} onClose={() => setLyricsOpen(false)} />
        </div>
      </div>

      {hasPlayer ? (
        <PlayerPanel
          onLyricsToggle={() => setLyricsOpen((v) => !v)}
          lyricsOpen={lyricsOpen}
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
