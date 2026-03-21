export type AudioFormat = 'mp3' | 'aac' | 'm4a' | 'flac' | 'wav';
export type QualityPreset = 'auto' | '320' | '256' | '192' | '128' | '96';
export type TrackStatus = 'queued' | 'downloading' | 'converting' | 'done' | 'error';
export type DownloadStatus = 'fetching' | 'queued' | 'active' | 'done' | 'error';
export type ContentType = 'track' | 'album' | 'playlist';

export interface TrackInfo {
  id: string;
  index: number;
  title: string;
  artist: string;
  album?: string;
  status: TrackStatus;
  progress: number;
  speed?: number;
  eta?: number;
  error?: string;
  filePath?: string;
}

export interface DownloadItem {
  id: string;
  url: string;
  name: string;
  type: ContentType;
  coverArt?: string;
  tracks: TrackInfo[];
  status: DownloadStatus;
  progress: number;
  totalTracks: number;
  completedTracks: number;
  failedTracks: number;
  speed?: number;
  eta?: number;
  addedAt: string;
  completedAt?: string;
  format: AudioFormat;
  quality: QualityPreset;
  outputDir: string;
}
