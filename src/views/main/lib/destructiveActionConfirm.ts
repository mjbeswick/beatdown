import type { DownloadItem, TrackInfo } from '../../../shared/types';
import { $appSettings } from '../stores/appSettings';
import { rpc } from '../rpc';

function shouldConfirmDestructiveActions(): boolean {
  return $appSettings.getState().confirmDeleteActions;
}

export async function confirmDestructiveAction(message: string): Promise<boolean> {
  if (!shouldConfirmDestructiveActions()) return true;
  return rpc.proxy.request['dialog:confirm']({ message });
}

export async function confirmDownloadRemoval(item: DownloadItem | undefined): Promise<boolean> {
  if (!item) return confirmDestructiveAction('Remove this download from your library?');
  if (item.type === 'track') {
    return confirmDestructiveAction(`Remove "${item.name}" from your library?`);
  }
  return confirmDestructiveAction(`Remove ${item.type} "${item.name}" and its tracks from your library?`);
}

export async function confirmTrackRemoval(track: Pick<TrackInfo, 'title' | 'artist'> | undefined): Promise<boolean> {
  const label = track ? `"${track.title}" by ${track.artist}` : 'this track';
  return confirmDestructiveAction(`Remove ${label} from your library?`);
}

export async function confirmQueueRemoval(track: Pick<TrackInfo, 'title' | 'artist'> | undefined): Promise<boolean> {
  const label = track ? `"${track.title}" by ${track.artist}` : 'this queued track';
  return confirmDestructiveAction(`Remove ${label} from the queue?`);
}

export async function confirmVisualizerPresetFolderClear(): Promise<boolean> {
  return confirmDestructiveAction('Clear the custom preset folder setting? Imported preset files will remain on disk, but Beatdown will stop using this folder until you choose it again.');
}

export async function confirmVisualizerFavoritesReset(count: number): Promise<boolean> {
  const label = count === 1 ? '1 preset favorite' : `${count} preset favorites`;
  return confirmDestructiveAction(`Clear ${label}?`);
}
