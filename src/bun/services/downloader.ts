import { spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import axios from 'axios';
import type { AudioFormat, QualityPreset, SpotifyTrack } from '../../shared/types';
import { logger } from '../logger';
import { paths } from './paths';

const execAsync = promisify(exec);

/** @deprecated use paths.libraryDir / paths.playlistsDir directly */
export const LIBRARY_BASE = { toString() { return paths.libraryDir; } } as unknown as string;
export const PLAYLISTS_DIR = { toString() { return paths.playlistsDir; } } as unknown as string;

export interface DownloadProgress {
  percent: number;
  speed?: number;
  eta?: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export async function checkDependencies(): Promise<{ ytdlp: boolean; ffmpeg: boolean }> {
  const check = async (cmd: string): Promise<boolean> => {
    try {
      await execAsync(cmd);
      return true;
    } catch {
      return false;
    }
  };
  const [ytdlp, ffmpeg] = await Promise.all([check('yt-dlp --version'), check('ffmpeg -version')]);
  return { ytdlp, ffmpeg };
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || 'Unknown';
}

export function getArtistDir(artist: string): string {
  return path.join(paths.libraryDir, sanitizeFilename(artist.split(',')[0].trim()));
}

const AUDIO_EXTS = ['.mp3', '.m4a', '.flac', '.wav', '.opus', '.ogg', '.aac'];

export function findExistingTrack(artist: string, title: string): string | null {
  const artistDir = getArtistDir(artist);
  if (!fs.existsSync(artistDir)) return null;

  const sanitizedTitle = sanitizeFilename(title).toLowerCase();
  try {
    const files = fs.readdirSync(artistDir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!AUDIO_EXTS.includes(ext)) continue;
      const baseName = path.basename(file, ext).toLowerCase();
      if (baseName.includes(sanitizedTitle) || sanitizedTitle.includes(baseName)) {
        return path.join(artistDir, file);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function parseSpeed(s: string): number {
  const m = s.match(/^([\d.]+)([KMGT]?)i?B\/s$/);
  if (!m) return 0;
  const mult: Record<string, number> = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  return parseFloat(m[1]) * (mult[m[2]] ?? 1);
}

function parseEta(s: string): number {
  const parts = s.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function downloadTrack(
  track: SpotifyTrack,
  outputDir: string,
  format: AudioFormat,
  quality: QualityPreset,
  coverArtUrl: string | undefined,
  onProgress: ProgressCallback,
  signal: AbortSignal,
  albumName?: string
): Promise<string> {
  const query = `ytsearch1:${track.artist} ${track.title} audio`;
  const targetExt = format === 'aac' ? 'm4a' : format;
  const outputTemplate = path.join(outputDir, '%(title)s.%(ext)s');

  const qualityArgs: string[] =
    format === 'flac' || format === 'wav'
      ? ['--audio-format', format]
      : ['--audio-format', targetExt, '--audio-quality', quality === 'auto' ? '5' : quality];

  const args = [
    query,
    '--extract-audio',
    ...qualityArgs,
    '--output', outputTemplate,
    '--no-playlist',
    '--progress',
    '--newline',
    '--no-warnings',
    '--no-part',
  ];

  logger.info(`Downloading: "${track.title}" by ${track.artist}`);

  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Cancelled'));

    const proc: ChildProcess = spawn('yt-dlp', args);
    let lastFilename = '';
    let stderr = '';

    const onAbort = () => {
      proc.kill('SIGTERM');
      reject(new Error('Cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    proc.stdout?.on('data', (data: Buffer) => {
      const line = data.toString();

      const destMatch = line.match(/\[download\] Destination: (.+)/);
      if (destMatch) lastFilename = destMatch[1].trim();

      const mergeMatch = line.match(/\[Merger\] Merging formats into "(.+)"/);
      if (mergeMatch) lastFilename = mergeMatch[1].trim();

      const alreadyMatch = line.match(/\[download\] (.+) has already been downloaded/);
      if (alreadyMatch) lastFilename = alreadyMatch[1].trim();

      const progressMatch = line.match(
        /\[download\]\s+([\d.]+)%(?:\s+of\s+[\d.~]+\w+)?\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/
      );
      if (progressMatch) {
        onProgress({
          percent: parseFloat(progressMatch[1]),
          speed: parseSpeed(progressMatch[2]),
          eta: parseEta(progressMatch[3]),
        });
      }
      if (line.includes('[download] 100%')) onProgress({ percent: 100 });
    });

    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on('close', async (code) => {
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) return;
      if (code !== 0) {
        return reject(new Error(`yt-dlp exited ${code}: ${stderr.slice(-300)}`));
      }

      let filePath = lastFilename;
      if (!filePath || !fs.existsSync(filePath)) {
        const files = fs
          .readdirSync(outputDir)
          .filter((f) => AUDIO_EXTS.some((e) => f.endsWith(e)))
          .map((f) => path.join(outputDir, f))
          .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());
        if (files.length === 0) return reject(new Error('Downloaded file not found'));
        filePath = files[0];
      }

      try {
        const tagged = await embedMetadata(filePath, {
          title: track.title,
          artist: track.artist,
          album: albumName,
          coverArtUrl,
        });
        resolve(tagged);
      } catch (e) {
        logger.warn('Metadata embed failed', (e as Error).message);
        resolve(filePath);
      }
    });

    proc.on('error', (err) => {
      signal.removeEventListener('abort', onAbort);
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

interface Metadata {
  title: string;
  artist: string;
  album?: string;
  coverArtUrl?: string;
}

async function downloadCoverArt(url: string, dest: string): Promise<void> {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
  fs.writeFileSync(dest, Buffer.from(res.data as ArrayBuffer));
}

export async function embedMetadata(filePath: string, meta: Metadata): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, ext);
  const outputPath = path.join(dir, `${base}_tagged${ext}`);

  const tmpCover = meta.coverArtUrl
    ? path.join(os.tmpdir(), `reel_cover_${Date.now()}.jpg`)
    : null;

  try {
    if (meta.coverArtUrl && tmpCover) {
      try {
        await downloadCoverArt(meta.coverArtUrl, tmpCover);
      } catch {
        // continue without cover
      }
    }

    const hasCover = tmpCover && fs.existsSync(tmpCover);
    const ffmpegArgs: string[] = ['-y', '-i', filePath];

    if (hasCover) {
      ffmpegArgs.push('-i', tmpCover!);
      ffmpegArgs.push('-map', '0:a', '-map', '1:v');
      ffmpegArgs.push('-c:a', 'copy', '-c:v', 'mjpeg');
      if (ext === '.mp3') {
        ffmpegArgs.push('-id3v2_version', '3');
        ffmpegArgs.push('-metadata:s:v', 'title=Album cover');
        ffmpegArgs.push('-metadata:s:v', 'comment=Cover (front)');
      }
    } else {
      ffmpegArgs.push('-map', '0', '-c', 'copy');
    }

    const metaArgs: string[] = [
      '-metadata', `title=${meta.title}`,
      '-metadata', `artist=${meta.artist}`,
    ];
    if (meta.album) metaArgs.push('-metadata', `album=${meta.album}`);
    ffmpegArgs.push(...metaArgs, outputPath);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', ffmpegArgs);
      let errOut = '';
      proc.stderr?.on('data', (d: Buffer) => {
        errOut += d.toString();
      });
      proc.on('close', (code) => {
        if (code !== 0) reject(new Error(`ffmpeg failed: ${errOut.slice(-300)}`));
        else resolve();
      });
      proc.on('error', reject);
    });

    fs.unlinkSync(filePath);
    fs.renameSync(outputPath, filePath);
    return filePath;
  } finally {
    if (tmpCover && fs.existsSync(tmpCover)) {
      try { fs.unlinkSync(tmpCover); } catch {}
    }
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }
}
