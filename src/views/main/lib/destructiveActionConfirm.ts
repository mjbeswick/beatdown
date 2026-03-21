import type { DownloadItem, TrackInfo } from '../../../shared/types';
import { $appSettings } from '../stores/appSettings';

function shouldConfirmDestructiveActions(): boolean {
  return $appSettings.getState().confirmDeleteActions;
}

export function confirmDestructiveAction(message: string): boolean {
  return !shouldConfirmDestructiveActions() || window.confirm(message);
}

export function confirmDownloadRemoval(item: DownloadItem | undefined): boolean {
  if (!item) return confirmDestructiveAction('Remove this download from your library?');
  if (item.type === 'track') {
    return confirmDestructiveAction(`Remove "${item.name}" from your library?`);
  }
  return confirmDestructiveAction(`Remove ${item.type} "${item.name}" and its tracks from your library?`);
}

export function confirmTrackRemoval(track: Pick<TrackInfo, 'title' | 'artist'> | undefined): boolean {
  const label = track ? `"${track.title}" by ${track.artist}` : 'this track';
  return confirmDestructiveAction(`Remove ${label} from your library?`);
}

export function confirmQueueRemoval(track: Pick<TrackInfo, 'title' | 'artist'> | undefined): boolean {
  const label = track ? `"${track.title}" by ${track.artist}` : 'this queued track';
  return confirmDestructiveAction(`Remove ${label} from the queue?`);
}

export function confirmVisualizerPresetFolderClear(): boolean {
  return confirmDestructiveAction('Clear the custom preset folder setting? Imported preset files will remain on disk, but Beatdown will stop using this folder until you choose it again.');
}

export function confirmVisualizerFavoritesReset(count: number): boolean {
  const label = count === 1 ? '1 preset favorite' : `${count} preset favorites`;
  return confirmDestructiveAction(`Clear ${label}?`);
}