/**
 * Offline BPM detection using Web Audio API's OfflineAudioContext.
 *
 * Algorithm:
 *   1. Fetch the first ~5 MB of audio (covers 45 s at 128 kbps)
 *   2. Decode into mono at 22 050 Hz via OfflineAudioContext with a low-pass
 *      filter (< 200 Hz) to isolate kick/bass transients
 *   3. Compute RMS energy in 10 ms windows → half-wave-rectified first-order
 *      difference = onset-strength function
 *   4. Autocorrelation over the BPM range 60–200 to find dominant period
 *   5. Normalise to 70–175 BPM (handles half/double-tempo artefacts)
 *   6. Scan onset function for the first strong beat (phase reference)
 *
 * Results are cached in localStorage so re-analysis is skipped.
 */

export interface DetectedBeat {
  bpm: number;
  /** Seconds from the track start to the first detected strong beat. */
  firstBeatOffset: number;
}

const CACHE_PREFIX = 'reel:bpm:';
const SAMPLE_RATE = 22_050;
const WIN_SAMPLES = Math.round(SAMPLE_RATE * 0.01); // 10 ms window

function readCache(trackId: string): DetectedBeat | null {
  try {
    const s = localStorage.getItem(CACHE_PREFIX + trackId);
    return s ? (JSON.parse(s) as DetectedBeat) : null;
  } catch {
    return null;
  }
}

function writeCache(trackId: string, beat: DetectedBeat): void {
  try {
    localStorage.setItem(CACHE_PREFIX + trackId, JSON.stringify(beat));
  } catch {}
}

async function analyzeArrayBuffer(buf: ArrayBuffer): Promise<DetectedBeat | null> {
  const maxSamples = SAMPLE_RATE * 45;
  const ctx = new OfflineAudioContext(1, maxSamples, SAMPLE_RATE);

  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf);
  } catch {
    return null;
  }

  // Low-pass to isolate kick/bass
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 200;
  src.connect(lpf);
  lpf.connect(ctx.destination);
  src.start(0);

  const rendered = await ctx.startRendering();
  const pcm = rendered.getChannelData(0);
  const n = Math.floor(pcm.length / WIN_SAMPLES);

  // RMS energy per window
  const energy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * WIN_SAMPLES;
    for (let j = 0; j < WIN_SAMPLES; j++) s += pcm[o + j] ** 2;
    energy[i] = Math.sqrt(s / WIN_SAMPLES);
  }

  // Half-wave rectified first-order difference (onset strength)
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, energy[i] - energy[i - 1]);

  // Autocorrelation over BPM range 60–200
  // At 10 ms/window: 200 BPM → 30 windows/beat, 60 BPM → 100 windows/beat
  const MIN_PERIOD = 30;
  const MAX_PERIOD = 100;
  const AUTOCORR_LIMIT = Math.min(n - MAX_PERIOD, 3_000); // use first ~30 s

  let bestPeriod = MIN_PERIOD;
  let bestScore = -Infinity;
  for (let p = MIN_PERIOD; p <= MAX_PERIOD; p++) {
    let score = 0;
    for (let i = 0; i < AUTOCORR_LIMIT; i++) score += onset[i] * onset[i + p];
    if (score > bestScore) {
      bestScore = score;
      bestPeriod = p;
    }
  }

  // Normalise to 70–175 BPM to handle half/double-tempo detection
  let bpm = 60_000 / (bestPeriod * 10 /* ms per window */);
  while (bpm < 70) bpm *= 2;
  while (bpm > 175) bpm /= 2;

  // Find first strong beat (phase reference)
  let maxOnset = 0;
  for (let i = 0; i < n; i++) if (onset[i] > maxOnset) maxOnset = onset[i];
  const threshold = maxOnset * 0.4;

  let firstBeatOffset = 0;
  for (let i = 1; i < n - 1; i++) {
    if (onset[i] > onset[i - 1] && onset[i] > onset[i + 1] && onset[i] > threshold) {
      firstBeatOffset = (i * 10) / 1_000;
      break;
    }
  }

  return { bpm: Math.round(bpm * 10) / 10, firstBeatOffset };
}

// In-flight promise map prevents duplicate concurrent analyses for the same track
const inflight = new Map<string, Promise<DetectedBeat | null>>();

export async function detectBpm(trackId: string, url: string): Promise<DetectedBeat | null> {
  const cached = readCache(trackId);
  if (cached) return cached;

  const existing = inflight.get(trackId);
  if (existing) return existing;

  const p = fetch(url, { headers: { Range: 'bytes=0-5000000' } })
    .then((r) => r.arrayBuffer())
    .then(analyzeArrayBuffer)
    .then((result) => {
      if (result) writeCache(trackId, result);
      inflight.delete(trackId);
      return result;
    })
    .catch(() => {
      inflight.delete(trackId);
      return null;
    });

  inflight.set(trackId, p);
  return p;
}

/** Synchronous cache-only lookup — returns null if not yet analysed. */
export function getCachedBpm(trackId: string): DetectedBeat | null {
  return readCache(trackId);
}
