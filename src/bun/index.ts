import Electrobun, { BrowserWindow, defineElectrobunRPC, Utils, ApplicationMenu } from 'electrobun/bun';
import type { DownloadItem, LyricLine } from '../shared/types';
import type { AddDownloadParams } from '../shared/types';
import type { ReelRPCSchema } from '../shared/rpc-schema';
import { queue } from './services/queue';
import { getSpotifyContent } from './services/spotify';
import { getLyrics } from './services/lyrics';
import { paths } from './services/paths';
import { logger } from './logger';

// ── Audio streaming server ────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const STREAM_HOST = '127.0.0.1';

const streamServer = Bun.serve({
  hostname: STREAM_HOST,
  port: 0, // auto-assign
  async fetch(req) {
    // Echo the request's Origin header back (or allow all). This is more
    // robust than a bare '*' because WKWebView with custom URL schemes
    // (e.g. views://) may send Origin: null or a custom-scheme origin that
    // some WebKit builds won't match against '*'.
    const origin = req.headers.get('origin') ?? '*';

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      });
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(req.url);

    if (url.pathname === '/health') {
      return new Response('OK', { status: 200, headers: { 'Access-Control-Allow-Origin': origin } });
    }

    const filePath = getRequestedFilePath(url);
    if (!filePath) {
      return new Response('Bad request', { status: 400 });
    }

    const cleanPath = path.resolve(filePath);

    // Security: ensure the resolved path stays within the configured library dir
    const libraryBase = paths.libraryDir;
    logger.info(`Stream request: ${req.method} ${cleanPath} (base: ${libraryBase})`);
    if (!cleanPath.startsWith(libraryBase + path.sep)) {
      logger.warn(`Stream forbidden: ${cleanPath}`);
      return new Response('Forbidden', { status: 403 });
    }

    const file = Bun.file(cleanPath);
    if (!(await file.exists())) {
      logger.warn(`Stream not found: ${cleanPath}`);
      return new Response('Not found', { status: 404 });
    }

    const fileSize = file.size;
    const contentType = getAudioMime(cleanPath);
    const range = req.headers.get('range');
    const body = req.method === 'HEAD' ? null : file;
    const baseHeaders = {
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Type',
      'Vary': 'Origin',
    };

    if (range) {
      const parsedRange = parseByteRange(range, fileSize);
      if (!parsedRange) {
        return new Response('Requested range not satisfiable', {
          status: 416,
          headers: {
            ...baseHeaders,
            'Content-Range': `bytes */${fileSize}`,
          },
        });
      }

      const { start, end } = parsedRange;
      const chunkSize = end - start + 1;

      return new Response(req.method === 'HEAD' ? null : file.slice(start, end + 1), {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': String(chunkSize),
        },
      });
    }

    return new Response(body, {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Length': String(fileSize),
      },
    });
  },
});

function getRequestedFilePath(url: URL): string | null {
  const queryPath = url.searchParams.get('path');
  if (queryPath) return queryPath;

  if (url.pathname === '/' || url.pathname === '/stream') return null;

  // Backward compatibility for older clients that put the file path in the URL path.
  const encodedPath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  const decodedPath = decodeURIComponent(encodedPath);
  return decodedPath.startsWith('/') ? decodedPath : decodeURIComponent(url.pathname);
}

function parseByteRange(rangeHeader: string, fileSize: number): { start: number; end: number } | null {
  if (!rangeHeader.startsWith('bytes=')) return null;

  const spec = rangeHeader.slice('bytes='.length).trim();
  if (!spec || spec.includes(',')) return null;

  const [rawStart, rawEnd = ''] = spec.split('-', 2);

  if (rawStart === '') {
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;

    const chunkSize = Math.min(suffixLength, fileSize);
    return {
      start: Math.max(0, fileSize - chunkSize),
      end: fileSize - 1,
    };
  }

  const start = Number.parseInt(rawStart, 10);
  if (!Number.isFinite(start) || start < 0 || start >= fileSize) return null;

  const requestedEnd = rawEnd === '' ? fileSize - 1 : Number.parseInt(rawEnd, 10);
  if (!Number.isFinite(requestedEnd)) return null;

  const end = Math.min(requestedEnd, fileSize - 1);
  if (end < start) return null;

  return { start, end };
}

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
        process.exit(0);
      },

      'app:cancelClose': () => {
        // no-op: close confirmation is now handled natively via showMessageBox
      },

      'stream:getUrl': ({ filePath }) => {
        return `http://${STREAM_HOST}:${streamPort}/stream?path=${encodeURIComponent(filePath)}`;
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

      'paths:get': () => {
        return paths.getAll();
      },

      'paths:browse': async ({ type }) => {
        const current = type === 'library' ? paths.libraryDir : paths.playlistsDir;
        const selected = await Utils.openFileDialog({
          startingFolder: current,
          canChooseFiles: false,
          canChooseDirectory: true,
          allowsMultipleSelection: false,
        });
        // User cancelled or nothing selected
        if (!selected || selected.length === 0 || selected[0] === '') return null;
        const chosen = selected[0].trim();
        if (!chosen) return null;
        if (type === 'library') {
          paths.setLibraryDir(chosen);
        } else {
          paths.setPlaylistsDir(chosen);
        }
        return paths.getAll();
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

// ── Window state persistence ──────────────────────────────────────────────────

const WINDOW_STATE_PATH = path.join(os.homedir(), 'Music', 'Reel', 'window-state.json');
const DEFAULT_FRAME = { x: 100, y: 100, width: 1200, height: 800 };

function loadWindowState(): typeof DEFAULT_FRAME {
  try {
    const raw = fs.readFileSync(WINDOW_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
      return { ...DEFAULT_FRAME, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_FRAME };
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function saveWindowState(frame: typeof DEFAULT_FRAME) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(WINDOW_STATE_PATH), { recursive: true });
      fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(frame));
    } catch {}
  }, 500);
}

let lastWindowFrame = loadWindowState();

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
    if (d) { lastWindowFrame = { x: d.x, y: d.y, width: d.width, height: d.height }; saveWindowState(lastWindowFrame); }
  });
  newWin.on('move', (event: any) => {
    const d = event?.data;
    if (d) { lastWindowFrame.x = d.x; lastWindowFrame.y = d.y; saveWindowState(lastWindowFrame); }
  });

  return newWin;
}

const win = createMainWindow();

// ── Application menu (required for macOS edit shortcuts: Cmd+C/V/X/Z etc.) ───
ApplicationMenu.setApplicationMenu([
  {
    label: 'Reel',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'showAll' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  },
]);

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
Electrobun.events.on('before-quit', async (event: any) => {
  if (isForceQuitting) return; // already confirmed by user – let it quit

  const activeDownloads = queue.getAll().filter(
    (d) => d.status === 'queued' || d.status === 'active'
  );
  if (activeDownloads.length === 0) return;

  // Cancel the quit – we need the user to confirm first
  event.response = { allow: false };

  const activeCount = activeDownloads.length;
  const countLabel = activeCount === 1
    ? '1 download is still in progress.'
    : `${activeCount} downloads are still in progress.`;

  const { response } = await Utils.showMessageBox({
    type: 'warning',
    title: 'Downloads in Progress',
    message: countLabel,
    detail: 'Closing the app will interrupt them — you can resume when you reopen.',
    buttons: ['Close Anyway', 'Continue Downloading'],
    defaultId: 1,
    cancelId: 1,
  });

  if (response === 0) {
    // User confirmed – force quit
    isForceQuitting = true;
    process.exit(0);
  } else {
    // User cancelled – restore the window so they can keep working
    createMainWindow();
  }
});
