import { useEffect } from 'react';
import { useUnit } from 'effector-react';
import { socket } from './socket/client';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import DownloadList from './components/DownloadList';
import ArtistsView from './components/ArtistsView';
import GenresView from './components/GenresView';
import SettingsView from './components/SettingsView';
import StatusBar from './components/StatusBar';
import ErrorModal from './components/ErrorModal';
import { $nav } from './stores/nav';

export default function App() {
  useEffect(() => {
    socket.connect();
    return () => { socket.disconnect(); };
  }, []);

  const nav = useUnit($nav);

  return (
    <div className="flex flex-col h-full bg-zinc-900 overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        {nav === 'playlists' && <DownloadList />}
        {nav === 'artists' && <ArtistsView />}
        {nav === 'genres' && <GenresView />}
        {nav === 'settings' && <SettingsView />}
      </div>
      <StatusBar />
      <ErrorModal />
    </div>
  );
}
