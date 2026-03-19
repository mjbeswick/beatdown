import type { DownloadItem, LyricLine, AddDownloadParams, SpotifyContent } from './types';

/**
 * Shared RPC schema used by both bun and webview sides.
 * Satisfies the ElectrobunRPCSchema shape structurally.
 */
export interface ReelRPCSchema {
  bun: {
    requests: {
      'download:add': { params: AddDownloadParams; response: DownloadItem };
      'download:preview': { params: { url: string }; response: SpotifyContent };
      'download:remove': { params: { id: string }; response: void };
      'track:remove': { params: { downloadId: string; trackId: string }; response: void };
      'download:redownload': { params: { id: string }; response: void };
      'download:pause': { params: { id: string }; response: void };
      'download:resume': { params: { id: string }; response: void };
      'downloads:getAll': { params: undefined; response: DownloadItem[] };
      'downloads:retryFailed': { params: undefined; response: void };
      'downloads:resumeInterrupted': { params: undefined; response: { count: number } };
      'stream:getUrl': { params: { filePath: string }; response: string };
      'stream:getPort': { params: undefined; response: number };
      'lyrics:get': { params: { artist: string; title: string }; response: LyricLine[] | null };
      'window:zoom': { params: undefined; response: void };
      'app:forceQuit': { params: undefined; response: void };
      'app:cancelClose': { params: undefined; response: void };
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

/** LocalSchema for the webview side (receives bun messages, handles no requests) */
export type ReelViewLocalSchema = {
  requests: ReelRPCSchema['webview']['requests'];
  messages: ReelRPCSchema['bun']['messages'];
};

/** RemoteSchema for the webview side (calls bun requests, sends no messages) */
export type ReelViewRemoteSchema = {
  requests: ReelRPCSchema['bun']['requests'];
  messages: ReelRPCSchema['webview']['messages'];
};
