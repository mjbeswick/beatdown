import { BrowserWindow, defineElectrobunRPC } from 'electrobun/bun';
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

      'downloads:getAll': () => {
        return queue.getAll();
      },

      'downloads:retryFailed': () => {
        queue.retryAllFailed();
      },

      'stream:getUrl': ({ filePath }) => {
        return `http://localhost:${streamPort}/${encodeURIComponent(filePath)}`;
      },

      'lyrics:get': ({ artist, title }) => {
        return getLyrics(artist, title);
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

// ── Browser window ────────────────────────────────────────────────────────────

const win = new BrowserWindow({
  title: 'Reel',
  frame: { x: 100, y: 100, width: 1200, height: 800 },
  url: 'views://main/index.html',
  rpc,
  titleBarStyle: 'hiddenInset',
});

// Send stream port to webview once connected (small delay to allow ws handshake)
setTimeout(() => {
  try {
    rpc.proxy.send['stream:port']({ port: streamPort });
  } catch {}
}, 500);

logger.info(`Window created: ${win.id}`);
