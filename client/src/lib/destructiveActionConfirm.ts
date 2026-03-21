import type { DownloadItem, TrackInfo } from '../types';

const CONFIRM_DELETE_ACTIONS_KEY = 'beatdown:confirmDeleteActions';

function shouldConfirmDestructiveActions(): boolean {
  try {
    const stored = localStorage.getItem(CONFIRM_DELETE_ACTIONS_KEY);
    return stored !== null ? (JSON.parse(stored) as boolean) : true;
  } catch {
    return true;
  }
}

export function getConfirmDeleteActionsKey(): string {
  return CONFIRM_DELETE_ACTIONS_KEY;
}

export function confirmDestructiveAction(message: string): boolean {
  return !shouldConfirmDestructiveActions() || window.confirm(message);
}

export function confirmDownloadRemoval(item: Pick<DownloadItem, 'name' | 'type'>): boolean {
  if (item.type === 'track') {
    return confirmDestructiveAction(`Remove \"${item.name}\" from your library?`);
  }

  return confirmDestructiveAction(
    `Remove ${item.type} \"${item.name}\" and its tracks from your library?`
  );
}

export function confirmTrackRemoval(track: Pick<TrackInfo, 'title' | 'artist'>): boolean {
  return confirmDestructiveAction(`Remove \"${track.title}\" by ${track.artist} from your library?`);
}