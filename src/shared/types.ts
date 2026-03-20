// Shared types used by both bun (main process) and browser (views)

export type AudioFormat = 'mp3' | 'aac' | 'm4a' | 'flac' | 'wav';
export type QualityPreset = 'auto' | '320' | '256' | '192' | '128' | '96';
export type TrackStatus = 'queued' | 'downloading' | 'converting' | 'done' | 'error';
export type DownloadStatus = 'fetching' | 'queued' | 'active' | 'done' | 'error' | 'paused';
export type ContentType = 'track' | 'album' | 'playlist';

export interface TrackInfo {
  id: string;
  index: number;
  title: string;
  artist: string;
  album?: string;
  genres?: string[];
  status: TrackStatus;
  progress: number;
  speed?: number;
  eta?: number;
  error?: string;
  filePath?: string;
  fileSizeBytes?: number;
}

export interface DownloadItem {
  id: string;
  url: string;
  name: string;
  type: ContentType;
  coverArt?: string;
  tracks: TrackInfo[];
  status: DownloadStatus;
  interrupted?: boolean;
  progress: number;
  totalTracks: number;
  completedTracks: number;
  failedTracks: number;
  speed?: number;
  eta?: number;
  sizeOnDiskBytes: number;
  addedAt: string;
  completedAt?: string;
  format: AudioFormat;
  quality: QualityPreset;
  outputDir: string;
}

export interface SpotifyTrack {
  title: string;
  artist: string;
  album?: string;
  genres?: string[];
}

export interface SpotifyContent {
  name: string;
  type: ContentType;
  coverArt?: string;
  tracks: SpotifyTrack[];
}

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface DLNADevice {
  id: string;
  name: string;
  host: string;
  controlUrl: string;
}

// RPC schema — types shared between bun process and webview
export interface AddDownloadParams {
  url: string;
  format: AudioFormat;
  quality: QualityPreset;
}
