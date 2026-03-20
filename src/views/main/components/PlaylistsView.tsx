import { useState } from 'react';
import { useUnit } from 'effector-react';
import { ListMusic, Play, Music2, Pause, PlayCircle, Loader2, Clock3, Download as DownloadIcon, Trash2, ExternalLink } from 'lucide-react';
import { $downloads, $search, pauseDownloadFx, resumeDownloadFx, redownloadFx, removeDownloadFx, getPrimaryDownloadAction } from '../stores/downloads';
import { enqueueTrack, playDownloadPlaylist } from '../stores/player';
import type { DownloadItem, DownloadStatus } from '../../../shared/types';
import { getTrackAlbumName } from '../../../shared/track-metadata';
import { rpc } from '../rpc';
import ContextMenu, { type ContextMenuEntry } from './ContextMenu';
import { useContextMenu } from '../hooks/useContextMenu';
import ResizablePaneLayout from './ResizablePaneLayout';
import TrackRow from './TrackRow';

const ACTIVE_DOWNLOAD_STATUSES: DownloadStatus[] = ['queued', 'active', 'fetching'];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(bytes >= 100 * 1024 ** 2 ? 0 : 1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

function getSpotifyPlaylistWebUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const uriMatch = trimmed.match(/^spotify:playlist:([a-zA-Z0-9]+)$/i);
  if (uriMatch) {
    return `https://open.spotify.com/playlist/${uriMatch[1]}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname !== 'open.spotify.com') return null;

    const [contentType, playlistId] = parsed.pathname.split('/').filter(Boolean);
    if (contentType !== 'playlist' || !playlistId) return null;

    return `https://open.spotify.com/playlist/${playlistId}`;
  } catch {
    return null;
  }
}

function getPlayableTracks(playlist: DownloadItem) {
  return playlist.tracks
    .filter((track) => track.status === 'done')
    .map((track) => ({
      track,
      downloadId: playlist.id,
      coverArt: playlist.coverArt,
      albumName: getTrackAlbumName(track, playlist.name),
    }));
}

function enqueueDownloadedPlaylist(playlist: DownloadItem) {
  for (const playableTrack of getPlayableTracks(playlist)) {
    enqueueTrack(playableTrack);
  }
}

function PlaylistListStatus({ status }: { status: DownloadStatus }) {
  switch (status) {
    case 'active':
    case 'fetching':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
          <Loader2 size={10} className="animate-spin" />
          Downloading
        </span>
      );
    case 'queued':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400">
          <Clock3 size={10} />
          Queued
        </span>
      );
    case 'paused':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
          <Pause size={10} />
          Paused
        </span>
      );
    default:
      return null;
  }
}

interface PlaylistListItemProps {
  item: DownloadItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function PlaylistListItem({ item, isSelected, onSelect }: PlaylistListItemProps) {
  const { pos, open, close } = useContextMenu();
  const playableTracks = getPlayableTracks(item);
  const primaryDownloadAction = getPrimaryDownloadAction(item);
  const showStatus = item.status !== 'done' && item.status !== 'error';
  const sizeLabel = item.sizeOnDiskBytes > 0 ? formatBytes(item.sizeOnDiskBytes) : null;

  const menuItems: ContextMenuEntry[] = [];

  if (playableTracks.length > 0) {
    menuItems.push(
      { label: 'Play All', icon: <Play size={13} className="fill-current" />, onClick: () => playDownloadPlaylist(item) },
      { label: 'Enqueue All', icon: <ListMusic size={13} />, onClick: () => enqueueDownloadedPlaylist(item) },
      { separator: true }
    );
  }

  if (ACTIVE_DOWNLOAD_STATUSES.includes(item.status)) {
    menuItems.push(
      { label: 'Pause', icon: <Pause size={13} />, onClick: () => pauseDownloadFx(item.id) },
      { separator: true }
    );
  }

  if (primaryDownloadAction) {
    menuItems.push(
      {
        label: primaryDownloadAction === 'resume' ? 'Resume' : 'Download',
        icon: primaryDownloadAction === 'resume' ? <PlayCircle size={13} /> : <DownloadIcon size={13} />,
        onClick: () => {
          if (primaryDownloadAction === 'resume') {
            resumeDownloadFx(item.id);
            return;
          }
          redownloadFx(item.id);
        },
      },
      { separator: true }
    );
  }

  menuItems.push({
    label: 'Remove',
    icon: <Trash2 size={13} />,
    onClick: () => removeDownloadFx(item.id),
    danger: true,
  });

  return (
    <>
      <div
        onClick={() => onSelect(item.id)}
        onDoubleClick={() => {
          onSelect(item.id);
          playDownloadPlaylist(item);
        }}
        onContextMenu={(event) => {
          onSelect(item.id);
          open(event);
        }}
        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-zinc-800/60 last:border-b-0 transition-colors ${
          isSelected ? 'bg-zinc-700/50' : 'hover:bg-zinc-800/30'
        }`}
      >
        <div className="w-8 h-8 rounded overflow-hidden bg-zinc-700 flex items-center justify-center shrink-0">
          {item.coverArt ? (
            <img src={item.coverArt} alt="" className="w-full h-full object-cover" />
          ) : (
            <Music2 size={12} className="text-zinc-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-zinc-300 text-xs truncate">{item.name}</div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <span className="text-zinc-600 truncate">
              {playableTracks.length}/{item.totalTracks} tracks
              {sizeLabel ? ` · ${sizeLabel}` : ''}
            </span>
            {showStatus ? (
              <span className="ml-auto shrink-0">
                <PlaylistListStatus status={item.status} />
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {pos && (
        <ContextMenu
          x={pos.x}
          y={pos.y}
          onClose={close}
          items={menuItems}
        />
      )}
    </>
  );
}

export default function PlaylistsView() {
  const downloads = useUnit($downloads);
  const search = useUnit($search);

  const q = search.trim().toLowerCase();
  const playlists = downloads
    .filter((d) => d.type === 'playlist' && d.tracks.length > 0)
    .filter((d) => !q || d.name.toLowerCase().includes(q));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = playlists.find((p) => p.id === selectedId) ?? playlists[0] ?? null;

  if (playlists.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <ListMusic size={40} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-zinc-600 text-sm">No playlists yet</p>
          <p className="text-zinc-700 text-xs mt-1">Playlist downloads appear here</p>
        </div>
      </main>
    );
  }

  const doneTracks = selected ? getPlayableTracks(selected) : [];
  const isActiveDownload = selected ? ACTIVE_DOWNLOAD_STATUSES.includes(selected.status) : false;
  const isPaused = selected?.status === 'paused';
  const spotifyPlaylistUrl = selected ? getSpotifyPlaylistWebUrl(selected.url) : null;
  const selectedSizeLabel = selected && selected.sizeOnDiskBytes > 0 ? formatBytes(selected.sizeOnDiskBytes) : null;

  const openSelectedPlaylistInSpotify = () => {
    if (!spotifyPlaylistUrl) return;
    void rpc.proxy.request['app:openExternal']({ url: spotifyPlaylistUrl }).catch(() => {});
  };

  return (
    <main className="flex-1 flex overflow-hidden">
      <ResizablePaneLayout
        storageKey="reel:playlists-list-width"
        defaultWidth={224}
        minPaneWidth={200}
        maxPaneWidth={420}
        minContentWidth={420}
        pane={
          <div className="flex h-full flex-col overflow-hidden">
            <div className="bg-zinc-800/60 backdrop-blur border-b border-zinc-700/60 px-3 py-1.5 text-xs text-zinc-500 font-medium select-none shrink-0">
              Playlists
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {playlists.map((item) => {
                return (
                  <PlaylistListItem
                    key={item.id}
                    item={item}
                    isSelected={item.id === selected?.id}
                    onSelect={setSelectedId}
                  />
                );
              })}
            </div>
          </div>
        }
      >
        {selected && (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="shrink-0 flex items-center gap-4 px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
              <div className="w-14 h-14 rounded overflow-hidden bg-zinc-700 flex items-center justify-center shrink-0">
                {selected.coverArt ? (
                  <img src={selected.coverArt} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ListMusic size={20} className="text-zinc-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-zinc-200 font-semibold text-sm truncate">{selected.name}</div>
                <div className="mt-0.5 flex items-center gap-3 text-xs min-w-0">
                  <span className="text-zinc-500">
                    {doneTracks.length} / {selected.totalTracks} tracks
                    {selectedSizeLabel ? ` · ${selectedSizeLabel} on disk` : ''}
                  </span>
                  {spotifyPlaylistUrl && (
                    <button
                      onClick={openSelectedPlaylistInSpotify}
                      className="inline-flex items-center gap-1 text-zinc-400 hover:text-emerald-400 transition-colors"
                    >
                      <ExternalLink size={11} />
                      Open in Spotify
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {(isActiveDownload || isPaused) && (
                  isPaused ? (
                    <button
                      onClick={() => resumeDownloadFx(selected.id)}
                      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
                    >
                      <PlayCircle size={13} />
                      Resume
                    </button>
                  ) : (
                    <button
                      onClick={() => pauseDownloadFx(selected.id)}
                      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-amber-400 transition-colors"
                    >
                      <Pause size={13} />
                      Pause
                    </button>
                  )
                )}
                {doneTracks.length > 0 && (
                  <button
                    onClick={() => playDownloadPlaylist(selected)}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
                  >
                    <Play size={13} className="fill-current" />
                    Play all
                  </button>
                )}
              </div>
            </div>

            <div className="shrink-0 bg-zinc-800/60 border-b border-zinc-700/60 flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-500 font-medium select-none">
              <div className="w-[11px] shrink-0" />
              <div className="flex-1 min-w-0">Title</div>
              <div className="w-7 shrink-0" />
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {selected.tracks.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  downloadId={selected.id}
                  coverArt={selected.coverArt}
                  albumName={getTrackAlbumName(track, selected.name)}
                  compact
                  progressStyle="background"
                  allTracks={doneTracks}
                />
              ))}
            </div>
          </div>
        )}
      </ResizablePaneLayout>
    </main>
  );
}
