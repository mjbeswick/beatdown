import {
  $player,
  pause,
  resume,
  seek,
  setVolume,
  timeUpdated,
  trackEnded,
  getStreamUrl,
} from '../stores/player';

// ── Web Audio API setup ────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
const audio = new Audio();
audio.preload = 'auto';

function getOrCreateCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.8;
    try {
      sourceNode = audioCtx.createMediaElementSource(audio);
      sourceNode.connect(analyserNode);
    } catch (e) {
      // SecurityError: audio element is cross-origin without CORS approval.
      // Audio will still play via the HTML element's own output; visualiser
      // won't receive a signal but playback is unaffected.
      console.warn('Web Audio API source connection failed (CORS):', e);
    }
    analyserNode.connect(audioCtx.destination);
  }
  return audioCtx;
}

export function getAnalyserNode(): AnalyserNode | null {
  return analyserNode;
}

export function getAudioContext(): AudioContext | null {
  return audioCtx;
}

// ── Audio event → store ────────────────────────────────────────────────────────

let consecutiveErrors = 0;

audio.addEventListener('timeupdate', () => {
  timeUpdated({ currentTime: audio.currentTime, duration: audio.duration || 0 });
});

audio.addEventListener('ended', () => {
  consecutiveErrors = 0;
  trackEnded();
});

audio.addEventListener('error', () => {
  const err = audio.error;
  console.error('Audio error:', err?.code, err?.message, audio.src);
  consecutiveErrors++;
  if (consecutiveErrors >= 3) {
    consecutiveErrors = 0;
    pause();
    return;
  }
  trackEnded();
});

// ── Store → audio element ──────────────────────────────────────────────────────

let lastTrackId: string | null = null;
let lastSrc: string | null = null;

$player.watch((state) => {
  const { current, isPlaying, volume, currentTime: seekTime, streamPort } = state;

  // Volume
  audio.volume = Math.max(0, Math.min(1, volume));

  if (!current?.track.filePath || !streamPort) {
    if (!isPlaying) audio.pause();
    return;
  }

  const trackId = current.track.id;
  const src = getStreamUrl(current.track.filePath, streamPort);

  // Track changed
  if (trackId !== lastTrackId || src !== lastSrc) {
    lastTrackId = trackId;
    lastSrc = src;
    audio.src = src;
    audio.load();
    if (isPlaying) {
      getOrCreateCtx();
      if (audioCtx?.state === 'suspended') audioCtx.resume();
      audio.play().catch(console.error);
    }
    return;
  }

  // Play/pause
  if (isPlaying && audio.paused) {
    getOrCreateCtx();
    if (audioCtx?.state === 'suspended') audioCtx.resume();
    audio.play().catch(console.error);
  } else if (!isPlaying && !audio.paused) {
    audio.pause();
  }
});

// ── Public seek / volume ───────────────────────────────────────────────────────

seek.watch((time) => {
  if (isFinite(time) && audio.duration) {
    audio.currentTime = time;
  }
});

// Export audio element for direct access if needed
export { audio };
