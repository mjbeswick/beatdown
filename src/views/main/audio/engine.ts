import {
  $player,
  pause,
  seek,
  timeUpdated,
  trackEnded,
  getStreamUrl,
} from '../stores/player';
import { $cast } from '../stores/cast';

// ── Web Audio API setup ────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let sourceNodeA: MediaElementAudioSourceNode | null = null;
let sourceNodeB: MediaElementAudioSourceNode | null = null;
let gainNode: GainNode | null = null;    // master volume
let gainNodeA: GainNode | null = null;  // deck A crossfade gain
let gainNodeB: GainNode | null = null;  // deck B crossfade gain

// Two decks. `audio` always points to the currently active deck.
const deckA = new Audio();
const deckB = new Audio();
deckA.crossOrigin = 'anonymous';
deckA.preload = 'auto';
deckB.crossOrigin = 'anonymous';
deckB.preload = 'auto';
let audio = deckA; // mutable reference to active deck

// When the DJ engine is mid-crossfade we suppress the 'ended' event on the
// outgoing deck so it doesn't accidentally advance the queue a second time.
let crossfadeInProgress = false;

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

function applyVolume(volume: number): void {
  const clamped = clampVolume(volume);
  if (gainNode) {
    // Both decks route through the master gain; the active deck's HTML volume
    // stays at 1 so the Web Audio graph controls the actual level.
    audio.volume = 1;
    gainNode.gain.value = clamped;
    return;
  }
  audio.volume = clamped;
}

function syncOutputVolume(volume: number = $player.getState().volume): void {
  applyVolume($cast.getState().isCasting ? 0 : volume);
}

function getOrCreateCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.8;

    gainNode = audioCtx.createGain();

    gainNodeA = audioCtx.createGain();
    gainNodeA.gain.value = 1;
    gainNodeB = audioCtx.createGain();
    gainNodeB.gain.value = 0;

    try {
      sourceNodeA = audioCtx.createMediaElementSource(deckA);
      sourceNodeA.connect(gainNodeA);
    } catch (e) {
      console.warn('Web Audio API source connection failed (CORS):', e);
    }

    // gainNodeB will carry deck B audio once ensureDeckBConnected() is called;
    // wire it now so the graph is complete even before that.
    gainNodeA.connect(analyserNode);
    gainNodeB.connect(analyserNode);
    analyserNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    syncOutputVolume();
  }
  return audioCtx;
}

export function getAnalyserNode(): AnalyserNode | null {
  return analyserNode;
}

export function getAudioContext(): AudioContext | null {
  return audioCtx;
}

// ── Deck B connection (lazy — called by DJ engine before first crossfade) ──────

export function ensureDeckBConnected(): void {
  if (sourceNodeB || !audioCtx || !gainNodeB) return;
  try {
    sourceNodeB = audioCtx.createMediaElementSource(deckB);
    sourceNodeB.connect(gainNodeB);
  } catch (e) {
    console.warn('DeckB Web Audio connection failed:', e);
  }
}

// ── Deck accessors used by DJ engine ──────────────────────────────────────────

export function getActiveDeck(): HTMLAudioElement {
  return audio;
}

export function getInactiveDeck(): HTMLAudioElement {
  return audio === deckA ? deckB : deckA;
}

export function getActiveDeckGain(): GainNode | null {
  return audio === deckA ? gainNodeA : gainNodeB;
}

export function getInactiveDeckGain(): GainNode | null {
  return audio === deckA ? gainNodeB : gainNodeA;
}

/**
 * Promote the inactive deck to active.
 * Must be called with the next track's ID and URL so the $player.watch handler
 * below recognises the track as already loaded and skips the reload.
 */
export function swapDecks(nextTrackId: string, nextSrc: string): void {
  audio = audio === deckA ? deckB : deckA;
  lastTrackId = nextTrackId;
  lastSrc = nextSrc;
}

export function setCrossfadeInProgress(v: boolean): void {
  crossfadeInProgress = v;
}

export function isCrossfadeInProgress(): boolean {
  return crossfadeInProgress;
}

/**
 * DJ engine can register a hook that is called whenever engine.ts would
 * normally do an immediate track reload.  If the hook returns true the reload
 * is skipped (the DJ engine takes over and drives the transition instead).
 */
type TrackChangeHook = (trackId: string, src: string) => boolean;
let trackChangeHook: TrackChangeHook | null = null;
export function registerTrackChangeHook(fn: TrackChangeHook): void {
  trackChangeHook = fn;
}

// ── Audio event → store ────────────────────────────────────────────────────────

let consecutiveErrors = 0;

function addDeckListeners(deck: HTMLAudioElement): void {
  deck.addEventListener('timeupdate', () => {
    if (audio !== deck) return;
    timeUpdated({ currentTime: deck.currentTime, duration: deck.duration || 0 });
  });

  deck.addEventListener('ended', () => {
    if (audio !== deck) return;
    if (crossfadeInProgress) return; // DJ engine handles the transition
    consecutiveErrors = 0;
    trackEnded();
  });

  deck.addEventListener('error', () => {
    if (audio !== deck) return;
    const err = deck.error;
    console.error('Audio error:', err?.code, err?.message, deck.src);
    consecutiveErrors++;
    if (consecutiveErrors >= 3) {
      consecutiveErrors = 0;
      pause();
      return;
    }
    trackEnded();
  });

  deck.addEventListener('loadedmetadata', () => {
    if (audio !== deck) return;
    applyPendingInitialSeek();
  });

  deck.addEventListener('canplay', () => {
    if (audio !== deck) return;
    applyPendingInitialSeek();
  });
}

addDeckListeners(deckA);
addDeckListeners(deckB);

// ── Store → audio element ──────────────────────────────────────────────────────

let lastTrackId: string | null = null;
let lastSrc: string | null = null;
let pendingInitialSeekTime: number | null = null;

function applyPendingInitialSeek(): void {
  if (pendingInitialSeekTime === null || !isFinite(pendingInitialSeekTime)) return;
  const targetTime = pendingInitialSeekTime;
  pendingInitialSeekTime = null;
  if (targetTime <= 0) return;
  const maxTime =
    Number.isFinite(audio.duration) && audio.duration > 0
      ? Math.max(0, audio.duration - 0.25)
      : targetTime;
  audio.currentTime = Math.min(targetTime, maxTime);
}

$player.watch((state) => {
  const { current, isPlaying, volume, currentTime: seekTime, streamPort } = state;

  syncOutputVolume(volume);

  if (!current?.track.filePath || !streamPort) {
    if (!isPlaying) audio.pause();
    return;
  }

  const trackId = current.track.id;
  const src = getStreamUrl(current.track.filePath, streamPort);

  // Track changed — let the DJ engine intercept if it has this track preloaded
  if (trackId !== lastTrackId || src !== lastSrc) {
    if (trackChangeHook && trackChangeHook(trackId, src)) return;

    lastTrackId = trackId;
    lastSrc = src;
    pendingInitialSeekTime = seekTime > 0 ? seekTime : null;
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

$cast.watch(() => {
  syncOutputVolume();
});

// ── Public seek / volume ───────────────────────────────────────────────────────

seek.watch((time) => {
  if (isFinite(time) && audio.duration) {
    audio.currentTime = time;
  }
});

export { audio, deckA, deckB };
