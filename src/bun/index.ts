import Electrobun, { BrowserWindow, defineElectrobunRPC } from 'electrobun/bun';
import type { DownloadItem, LyricLine } from '../shared/types';
import type { AddDownloadParams } from '../shared/types';
import type { ReelRPCSchema } from '../shared/rpc-schema';
import { queue } from './services/queue';
import { getSpotifyContent } from './services/spotify';
import { getLyrics } from './services/lyrics';
import { logger } from './logger';

// ── Audio streaming server ────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';

const streamServer = Bun.serve({
  port: 0, // auto-assign
  fetch(req) {
    // Handle CORS preflight (OPTIONS). Required because audio elements with
    // crossOrigin="anonymous" trigger pre-flight for non-safelisted Range values.
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Range',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const url = new URL(req.url);
    const filePath = decodeURIComponent(url.pathname.slice(1));
    const cleanPath = path.resolve(filePath);

    // Security: ensure the resolved path stays within ~/Music/Reel
    const musicBase = path.join(process.env.HOME ?? process.env.USERPROFILE ?? '', 'Music', 'Reel');
    if (!cleanPath.startsWith(musicBase)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (!fs.existsSync(cleanPath)) {
      return new Response('Not found', { status: 404 });
    }

    const stat = fs.statSync(cleanPath);
    const range = req.headers.get('range');

    if (range) {
      const [, start = '0', end = ''] = range.replace('bytes=', '').split('-');
      const startByte = parseInt(start, 10);
      const endByte = end ? parseInt(end, 10) : stat.size - 1;
      const chunkSize = endByte - startByte + 1;

      const stream = fs.createReadStream(cleanPath, { start: startByte, end: endByte });
      return new Response(stream as unknown as ReadableStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${startByte}-${endByte}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': getAudioMime(cleanPath),
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const stream = fs.createReadStream(cleanPath);
    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        'Content-Length': String(stat.size),
        'Content-Type': getAudioMime(cleanPath),
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
});

function getAudioMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mime: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.opus': 'audio/ogg; codecs=opus',
    '.ogg': 'audio/ogg',
  };
  return mime[ext] ?? 'audio/mpeg';
}

const streamPort = (streamServer.port as number);
logger.info(`Stream server listening on port ${streamPort}`);

// ── RPC instance ──────────────────────────────────────────────────────────────

const rpc = defineElectrobunRPC<ReelRPCSchema, 'bun'>('bun', {
  handlers: {
    requests: {
      'download:preview': async ({ url }) => {
        return await getSpotifyContent(url);
      },

      'download:add': async ({ url, format, quality }) => {
        rpc.proxy.send['download:fetching'](undefined as any);
        try {
          const content = await getSpotifyContent(url);
          rpc.proxy.send['download:fetch_done'](undefined as any);
          return await queue.add(content, url, format, quality);
        } catch (err) {
          rpc.proxy.send['download:error']({ message: (err as Error).message });
          throw err;
        }
      },

      'download:remove': ({ id }) => {
        queue.remove(id);
      },

      'track:remove': ({ downloadId, trackId }) => {
        queue.removeTrack(downloadId, trackId);
      },

      'download:redownload': ({ id }) => {
        queue.redownload(id);
      },

      'download:pause': ({ id }) => {
        queue.pause(id);
      },

      'download:resume': ({ id }) => {
        queue.resume(id);
      },

      'downloads:getAll': () => {
        return queue.getAll();
      },

      'downloads:retryFailed': () => {
        queue.retryAllFailed();
      },

      'downloads:resumeInterrupted': () => {
        const count = queue.resumeInterrupted();
        return { count };
      },

      'app:forceQuit': () => {
        isForceQuitting = true;
        confirmPending = false;
        process.exit(0);
      },

      'app:cancelClose': () => {
        confirmPending = false;
      },

      'stream:getUrl': ({ filePath }) => {
        return `http://localhost:${streamPort}/${encodeURIComponent(filePath)}`;
      },

      'stream:getPort': () => streamPort,

      'lyrics:get': ({ artist, title }) => {
        return getLyrics(artist, title);
      },

      'window:zoom': () => {
        if (win.isMaximized()) {
          win.unmaximize();
        } else {
          win.maximize();
        }
      },
    },
  },
});

// ── Queue event forwarding ────────────────────────────────────────────────────

queue.on('download:added', (item: DownloadItem) => {
  try { rpc.proxy.send['download:added'](item); } catch {}
});

queue.on('download:updated', (item: DownloadItem) => {
  try { rpc.proxy.send['download:updated'](item); } catch {}
});

queue.on('download:removed', (id: string) => {
  try { rpc.proxy.send['download:removed'](id); } catch {}
});

// ── Load existing downloads ────────────────────────────────────────────────────

queue.loadFromDisk();
logger.info('Reel starting up...');

// ── Close confirmation state ──────────────────────────────────────────────────

let isForceQuitting = false;
let confirmPending = false;
let lastWindowFrame = { x: 100, y: 100, width: 1200, height: 800 };

// ── Browser window ────────────────────────────────────────────────────────────

function createMainWindow() {
  const newWin = new BrowserWindow({
    title: 'Reel',
    frame: { ...lastWindowFrame },
    url: 'views://main/index.html',
    rpc,
    titleBarStyle: 'hiddenInset',
  });

  // Track window position/size so we can restore it if we need to reopen
  newWin.on('resize', (event: any) => {
    const d = event?.data;
    if (d) lastWindowFrame = { x: d.x, y: d.y, width: d.width, height: d.height };
  });
  newWin.on('move', (event: any) => {
    const d = event?.data;
    if (d) { lastWindowFrame.x = d.x; lastWindowFrame.y = d.y; }
  });

  return newWin;
}

const win = createMainWindow();

// Send stream port to webview once connected (small delay to allow ws handshake)
setTimeout(() => {
  try {
    rpc.proxy.send['stream:port']({ port: streamPort });
  } catch {}
}, 500);

logger.info(`Window created: ${win.id}`);

// ── Quit confirmation ─────────────────────────────────────────────────────────

// The 'before-quit' event fires after the last window is closed, just before the
// process exits. It can be cancelled by setting event.response = { allow: false }.
// We use this to show a confirmation modal when downloads are in progress.
Electrobun.events.on('before-quit', (event: any) => {
  if (isForceQuitting) return; // already confirmed by user – let it quit

  if (confirmPending) {
    // User closed the confirmation window without responding – treat as confirmed
    isForceQuitting = true;
    return;
  }

  const activeDownloads = queue.getAll().filter(
    (d) => d.status === 'queued' || d.status === 'active'
  );
  if (activeDownloads.length === 0) return;

  // Cancel the quit and re-open the main window with a confirm modal
  event.response = { allow: false };
  confirmPending = true;

  const confirmWin = createMainWindow();
  const activeCount = activeDownloads.length;

  // Wait for the webview DOM to be ready before sending the close-request message
  confirmWin.webview.on('dom-ready', () => {
    setTimeout(() => {
      try {
        rpc.proxy.send['app:requestClose']({ activeCount });
      } catch {}
    }, 400);
  });
});
