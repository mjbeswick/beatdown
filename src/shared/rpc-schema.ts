import type { DownloadItem, LyricLine, AddDownloadParams, SpotifyContent, DLNADevice, ArtistInfo } from './types';
export type { DLNADevice };

export interface BeatdownPaths {
  libraryDir: string;
  playlistsDir: string;
  visualizerPresetsDir: string;
}

export type SettingsKey = 'appSettings' | 'theme' | 'visualizer' | 'favourites' | 'playerPrefs' | 'playerSession';

export interface RawSettings {
  appSettings: Record<string, unknown> | null;
  theme: string | null;
  visualizer: Record<string, unknown> | null;
  favourites: unknown[] | null;
  playerPrefs: Record<string, unknown> | null;
  playerSession: Record<string, unknown> | null;
}

export interface VisualizerPresetDescriptor {
  id: string;
  label: string;
}

export interface VisualizerPresetCatalog {
  sourceDir: string;
  presets: VisualizerPresetDescriptor[];
}

/**
 * Shared RPC schema used by both bun and webview sides.
 * Satisfies the ElectrobunRPCSchema shape structurally.
 */
export interface BeatdownRPCSchema {
  bun: {
    requests: {
      'download:add': { params: AddDownloadParams; response: DownloadItem };
      'download:preview': { params: { url: string }; response: SpotifyContent };
      'download:remove': { params: { id: string }; response: void };
      'track:remove': { params: { downloadId: string; trackId: string }; response: void };
      'track:retry': { params: { downloadId: string; trackId: string }; response: void };
      'download:redownload': { params: { id: string }; response: void };
      'download:pause': { params: { id: string }; response: void };
      'download:resume': { params: { id: string }; response: void };
      'downloads:getAll': { params: undefined; response: DownloadItem[] };
      'downloads:retryFailed': { params: undefined; response: void };
      'downloads:resumeInterrupted': { params: undefined; response: { count: number } };
      'download:setCoverArt': { params: { id: string; url: string }; response: DownloadItem | null };
      'stream:getUrl': { params: { filePath: string }; response: string };
      'stream:getPort': { params: undefined; response: number };
      'lyrics:get': { params: { artist: string; title: string }; response: LyricLine[] | null };
      'artist:getInfo': { params: { artist: string; forceRefresh?: boolean }; response: ArtistInfo | null };
      'window:zoom': { params: undefined; response: void };
      'app:openExternal': { params: { url: string }; response: boolean };
      'app:forceQuit': { params: undefined; response: void };
      'app:cancelClose': { params: undefined; response: void };
      'paths:get': { params: undefined; response: BeatdownPaths };
      'paths:browse': {
        params: { type: 'library' | 'playlists' | 'visualizerPresets' };
        response: BeatdownPaths | null;
      };
      'visualizer-presets:list': { params: undefined; response: VisualizerPresetCatalog };
      'visualizer-presets:clear-folder': { params: undefined; response: BeatdownPaths };
      'visualizer-presets:get': {
        params: { id: string };
        response: Record<string, unknown> | null;
      };
      'cast:discover': { params: undefined; response: DLNADevice[] };
      'cast:start': { params: { deviceId: string; streamPath: string; title: string; artist: string }; response: void };
      'cast:stop': { params: { deviceId: string }; response: void };
      'cast:pause': { params: { deviceId: string }; response: void };
      'cast:resume': { params: { deviceId: string }; response: void };
      'cast:seek': { params: { deviceId: string; seconds: number }; response: void };
      'settings:load': { params: undefined; response: RawSettings };
      'settings:save': { params: { key: SettingsKey; value: unknown }; response: void };
      'dialog:confirm': { params: { message: string }; response: boolean };
    };
    messages: {
      'downloads:state': DownloadItem[];
      'download:added': DownloadItem;
      'download:updated': DownloadItem;
      'download:removed': string;
      'download:fetching': undefined;
      'download:fetch_done': undefined;
      'download:error': { message: string };
      'stream:port': { port: number };
      'app:requestClose': { activeCount: number };
    };
  };
  webview: {
    requests: Record<never, never>;
    messages: Record<never, never>;
  };
}

/** Local schema for the webview side: handles webview requests and sends webview messages. */
export type BeatdownViewLocalSchema = {
  requests: BeatdownRPCSchema['webview']['requests'];
  messages: BeatdownRPCSchema['webview']['messages'];
};

/** Remote schema for the webview side: calls bun requests and receives bun messages. */
export type BeatdownViewRemoteSchema = {
  requests: BeatdownRPCSchema['bun']['requests'];
  messages: BeatdownRPCSchema['bun']['messages'];
};

/** Local schema for the bun side: handles bun requests and sends bun messages. */
export type BeatdownBunLocalSchema = {
  requests: BeatdownRPCSchema['bun']['requests'];
  messages: BeatdownRPCSchema['bun']['messages'];
};

/** Remote schema for the bun side: calls webview requests and receives webview messages. */
export type BeatdownBunRemoteSchema = {
  requests: BeatdownRPCSchema['webview']['requests'];
  messages: BeatdownRPCSchema['webview']['messages'];
};
