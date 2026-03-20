import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';
import { validateUrl, getSpotifyContent } from './services/spotify';
import { queue } from './services/queue';
import { checkDependencies } from './services/downloader';
import { AudioFormat, QualityPreset } from './types';
import { logger } from './logger';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], methods: ['GET', 'POST'] },
});

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/stream/:downloadId/:trackId', (req, res) => {
  const item = queue.get(req.params.downloadId);
  if (!item) { res.status(404).json({ error: 'Not found' }); return; }
  const track = item.tracks.find((t) => t.id === req.params.trackId);
  if (!track?.filePath || !fs.existsSync(track.filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const filePath = track.filePath;
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.flac': 'audio/flac', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  };
  const contentType = mimeTypes[ext] ?? 'audio/mpeg';
  const range = req.headers.range;

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// Load persisted state from disk before accepting connections
queue.loadFromDisk();

// Forward queue events to all connected clients
queue.on('download:added', (item) => io.emit('download:added', item));
queue.on('download:updated', (item) => io.emit('download:updated', item));
queue.on('download:removed', (id) => io.emit('download:removed', id));

io.on('connection', (socket) => {
  logger.info(`Client connected [${socket.id}]`);
  socket.emit('downloads:state', queue.getAll());

  socket.on('disconnect', () => {
    logger.debug(`Client disconnected [${socket.id}]`);
  });

  socket.on(
    'download:add',
    async ({
      url,
      format = 'mp3',
      quality = 'auto',
    }: {
      url: string;
      format?: AudioFormat;
      quality?: QualityPreset;
    }) => {
      if (!validateUrl(url)) {
        logger.warn(`Invalid Spotify URL from client [${socket.id}]: ${url}`);
        socket.emit('download:error', { message: 'Invalid Spotify URL' });
        return;
      }
      logger.info(`Add request from [${socket.id}]: ${url}`);
      socket.emit('download:fetching', { url });
      try {
        const content = await getSpotifyContent(url);
        await queue.add(content, url, format, quality);
        socket.emit('download:fetch_done');
      } catch (err) {
        logger.error(`Failed to add download for ${url}`, (err as Error).message);
        socket.emit('download:error', { message: (err as Error).message });
      }
    }
  );

  socket.on('download:remove', (id: string) => queue.remove(id));
  socket.on('track:remove', ({ downloadId, trackId }: { downloadId: string; trackId: string }) =>
    queue.removeTrack(downloadId, trackId)
  );
  socket.on('download:redownload', (id: string) => queue.redownload(id));
});

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, async () => {
  const deps = await checkDependencies();
  console.log(`🎵  Beatdown server  →  http://localhost:${PORT}`);
  if (!deps.ytdlp) console.warn('⚠️  yt-dlp not found — install with: pip install yt-dlp');
  if (!deps.ffmpeg) console.warn('⚠️  ffmpeg not found — install from: https://ffmpeg.org');
});
