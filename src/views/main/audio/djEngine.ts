/**
 * DJ Engine — crossfade and beatmatch between consecutive tracks.
 *
 * State machine:
 *   idle → preloading → preloaded → crossfading → idle (after swap)
 *
 * Crossfade uses Web Audio API gain scheduling for sample-accurate ramps.
 * Beatmatch adjusts the incoming deck's playbackRate so its tempo matches the
 * outgoing deck's during the mix, then ramps back to 1× over 4 beats.
 * Phase alignment ensures the first beat of the incoming track lands on the
 * outgoing track's next beat boundary.
 *
 * Falls back to plain crossfade when BPM data is unavailable.
 *
 * Manual skips (user presses Next) are also crossfaded when the next track is
 * already preloaded; otherwise the engine falls through to an instant change.
 *
 * DJ mixing is disabled when casting (the cast device handles its own playback
 * and doesn't benefit from a local Web Audio crossfade).
 */

import {
  getActiveDeck,
  getInactiveDeck,
  getActiveDeckGain,
  getInactiveDeckGain,
  getAudioContext,
  getLoadedTrackId,
  ensureDeckBConnected,
  swapDecks,
  setCrossfadeInProgress,
  registerTrackChangeHook,
} from './engine';
import { detectBpm, getCachedBpm } from './bpmDetector';
import { $player, trackEnded, getStreamUrl } from '../stores/player';
import { $appSettings } from '../stores/appSettings';
import { $cast } from '../stores/cast';
import type { PlayingTrack } from '../stores/player';

type DjState = 'idle' | 'preloading' | 'preloaded' | 'crossfading';

let state: DjState = 'idle';
let nextTrack: PlayingTrack | null = null;
let nextTrackSrc: string | null = null;
let inactiveDeckReady = false;
let incomingBpmReady = false;
let outgoingBpmReady = false;
// ID of the track that was playing when we began preloading — used to look up
// the outgoing BPM even after the player has already advanced (manual navigation).
let outgoingTrackId: string | null = null;
let crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
// True when the crossfade was initiated by a manual skip; completeCrossfade()
// skips trackEnded() in that case because the queue already advanced.
let manualSkip = false;
// Set when user manually skips while we're still in 'preloading' state.
// The crossfade starts as soon as preloading completes.
let pendingManualSkip = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDjActive(): boolean {
  const { djMode } = $appSettings.getState();
  return djMode !== 'off' && !$cast.getState().isCasting;
}

function reset(): void {
  if (crossfadeTimer !== null) {
    clearTimeout(crossfadeTimer);
    crossfadeTimer = null;
  }

  // Cancel in-progress gain ramps and restore active deck to full volume
  const ctx = getAudioContext();
  if (ctx) {
    const t = ctx.currentTime;
    const ag = getActiveDeckGain();
    const ig = getInactiveDeckGain();
    if (ag) { ag.gain.cancelScheduledValues(t); ag.gain.value = 1; }
    if (ig) { ig.gain.cancelScheduledValues(t); ig.gain.value = 0; }
  }

  const inactive = getInactiveDeck();
  inactive.pause();
  inactive.src = '';
  inactive.playbackRate = 1;

  state = 'idle';
  nextTrack = null;
  nextTrackSrc = null;
  inactiveDeckReady = false;
  incomingBpmReady = false;
  outgoingBpmReady = false;
  outgoingTrackId = null;
  manualSkip = false;
  pendingManualSkip = false;
  setCrossfadeInProgress(false);
}

function beginPreload(
  track: PlayingTrack,
  src: string,
  outgoingId: string | null,
  outgoingSrc: string | null,
  isManualNavigation: boolean,
): void {
  state = 'preloading';
  nextTrack = track;
  nextTrackSrc = src;
  outgoingTrackId = outgoingId;
  manualSkip = isManualNavigation;
  pendingManualSkip = false;

  const { djMode } = $appSettings.getState();
  inactiveDeckReady = false;
  incomingBpmReady = djMode !== 'beatmatch';
  outgoingBpmReady = djMode !== 'beatmatch' || !outgoingId || !outgoingSrc;

  const deck = getInactiveDeck();
  deck.src = src;
  deck.load();

  const onCanPlay = () => {
    deck.removeEventListener('canplay', onCanPlay);
    inactiveDeckReady = true;
    markPreloaded();
  };
  deck.addEventListener('canplay', onCanPlay);

  if (djMode !== 'beatmatch') {
    return;
  }

  if (outgoingId && outgoingSrc) {
    detectBpm(outgoingId, outgoingSrc)
      .catch(() => {})
      .finally(() => {
        outgoingBpmReady = true;
        markPreloaded();
      });
  }

  detectBpm(track.track.id, src)
    .catch(() => {})
    .finally(() => {
      incomingBpmReady = true;
      markPreloaded();
    });
}

/** Smoothly ramp an audio element's playbackRate from `from` to `to` over
 *  `durationSecs` using requestAnimationFrame. */
function rampPlaybackRate(
  el: HTMLAudioElement,
  from: number,
  to: number,
  durationSecs: number,
): void {
  if (Math.abs(from - to) < 0.001) return;
  const startMs = performance.now();
  const durationMs = durationSecs * 1_000;
  const step = () => {
    const t = Math.min((performance.now() - startMs) / durationMs, 1);
    el.playbackRate = from + (to - from) * t;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * Calculate the start position for the incoming track such that its first beat
 * (played at rate `r = bpm_out / bpm_in`) lands exactly on the outgoing
 * track's next beat boundary.
 *
 * Derivation:
 *   At rate r, position p_in starts at time 0 and the incoming track's beats
 *   arrive at playback times t_k = (firstBeatOffset_in + k·beatPeriod_in − p_in) / r.
 *   We want t_k = timeToNextOutBeat for some k ≥ 0 with t_k ≥ 0, giving:
 *     p_in = firstBeatOffset_in + k·beatPeriod_in − timeToNextOutBeat·r
 *   Choose the smallest k ≥ 0 such that p_in ≥ 0.
 */
function calcPhaseAlignedStartTime(
  outgoingTrackIdLocal: string,
  nextBeatInfo: { bpm: number; firstBeatOffset: number },
  outgoingCurrentTime: number,
  r: number,
): number {
  const outBeat = getCachedBpm(outgoingTrackIdLocal);
  if (!outBeat) return nextBeatInfo.firstBeatOffset; // fallback: no phase data

  const outPeriod = 60 / outBeat.bpm;
  const inPeriod = 60 / nextBeatInfo.bpm;

  // Phase of the outgoing track within its current beat (0 ≤ phase < outPeriod)
  const phase = ((outgoingCurrentTime - outBeat.firstBeatOffset) % outPeriod + outPeriod) % outPeriod;
  // Time until the outgoing track's next beat
  const timeToNextBeat = outPeriod - phase;

  // Ideal start position for the incoming track
  let p = nextBeatInfo.firstBeatOffset - timeToNextBeat * r;

  // Advance by beat periods until p ≥ 0
  if (p < 0) {
    const k = Math.ceil(-p / inPeriod);
    p += k * inPeriod;
  }

  return p;
}

/**
 * Called whenever the inactive deck transitions from 'preloading' to ready.
 * Guards against double-calls (e.g. canplay + BPM detection both resolving).
 * After marking preloaded it immediately checks whether the active deck is
 * already past the crossfade trigger point so seeks near the end are handled
 * without waiting for the next timeupdate tick.
 */
function markPreloaded(): void {
  if (state !== 'preloading') return;

  const requiresBeatmatchData = $appSettings.getState().djMode === 'beatmatch';
  if (!inactiveDeckReady) return;
  if (requiresBeatmatchData && (!incomingBpmReady || !outgoingBpmReady)) return;

  state = 'preloaded';

  if (pendingManualSkip) {
    pendingManualSkip = false;
    manualSkip = true;
    startCrossfade();
    return;
  }

  // Immediately check the active deck's position rather than waiting for the
  // next timeupdate — this handles seeks that land past the trigger point
  // while we were still buffering the next track.
  const activeDeck = getActiveDeck();
  const currentTime = isFinite(activeDeck.currentTime) ? activeDeck.currentTime : 0;
  const duration = isFinite(activeDeck.duration) && activeDeck.duration > 0 ? activeDeck.duration : 0;
  if (duration > 0) {
    const { djMode, crossfadeDuration } = $appSettings.getState();
    const lookAhead = djMode === 'gapless' ? 0.1 : crossfadeDuration;
    if (currentTime >= Math.max(0, duration - lookAhead)) {
      manualSkip = false;
      startCrossfade();
    }
  }
}

// ── Track-change hook: intercept manual skips ─────────────────────────────────
//
// engine.ts calls this before doing an immediate track reload.  If we have the
// incoming track already preloaded we start the crossfade and return true so
// engine.ts skips the reload entirely.

registerTrackChangeHook((trackId, _src) => {
  if (!isDjActive()) return false;
  const targetTrack = $player.getState().current;
  if (!targetTrack || targetTrack.track.id !== trackId) return false;

  if (nextTrack?.track.id === trackId && state === 'preloaded') {
    // Incoming track is fully preloaded — start crossfade immediately.
    manualSkip = true;
    startCrossfade();
    return true; // prevent engine.ts from reloading
  }

  if (nextTrack?.track.id === trackId && state === 'preloading') {
    // Still buffering / running BPM detection — mark the intent so
    // markPreloaded() fires the crossfade as soon as the deck is ready.
    pendingManualSkip = true;
    manualSkip = true;
    return true; // prevent engine.ts from reloading
  }

  const outgoingId = outgoingTrackId ?? getLoadedTrackId();
  const outgoingSrc = getActiveDeck().currentSrc || null;
  if (!outgoingId || outgoingId === trackId) return false;

  if (state !== 'idle') {
    reset();
  }

  beginPreload(targetTrack, _src, outgoingId, outgoingSrc, true);
  pendingManualSkip = true;
  return true;

  return false;
});

// ── Main state machine driven by $player ─────────────────────────────────────

$player.watch((player) => {
  if (!isDjActive()) {
    if (state !== 'idle') reset();
    return;
  }

  const { queue, queueIndex, isPlaying, current, streamPort } = player;

  // ── Guard: abort if nav invalidated our preloaded state ───────────────────
  if (state === 'preloading' || state === 'preloaded') {
    if (nextTrack) {
      // If we intercepted a manual skip the queue has already advanced, so
      // nextTrack is now *current* rather than queue[queueIndex+1].
      // Only abort if neither position matches what we preloaded.
      const expectedNext = queue[queueIndex + 1];
      const isCurrentTrack = current?.track.id === nextTrack.track.id;
      const isNextTrack = expectedNext?.track.id === nextTrack.track.id;
      if (!isCurrentTrack && !isNextTrack) {
        reset();
      }
    }
  }

  // ── Guard: abort an in-progress crossfade if user navigated away ──────────
  if (state === 'crossfading' && current) {
    const expectedCurrentId = manualSkip ? nextTrack?.track.id : outgoingTrackId;
    if (expectedCurrentId && current.track.id !== expectedCurrentId) {
      // Player moved to an unexpected track — abort the crossfade cleanly
      reset();
    }
  }

  if (!isPlaying || !current) return;

  const upcomingIdx = queueIndex + 1;
  const upcoming = queue[upcomingIdx];
  if (!upcoming?.track.filePath || !streamPort) return;

  // ── Preload phase ──────────────────────────────────────────────────────────
  if (state === 'idle') {
    if (upcoming.track.id === nextTrack?.track.id) return; // already queued

    beginPreload(
      upcoming,
      getStreamUrl(upcoming.track.filePath, streamPort),
      current.track.id,
      current.track.filePath ? getStreamUrl(current.track.filePath, streamPort) : null,
      false,
    );

    return;
  }

  // ── Time-based crossfade trigger ───────────────────────────────────────────
  if (state === 'preloaded') {
    const { currentTime, duration } = player;
    if (duration <= 0) return;
    const { djMode, crossfadeDuration } = $appSettings.getState();
    const lookAhead = djMode === 'gapless' ? 0.1 : crossfadeDuration;
    const triggerAt = Math.max(0, duration - lookAhead);
    if (currentTime >= triggerAt) {
      manualSkip = false;
      startCrossfade();
    }
  }
});

// ── Crossfade execution ───────────────────────────────────────────────────────

function startCrossfade(): void {
  if (state === 'crossfading') return;
  state = 'crossfading';
  setCrossfadeInProgress(true);

  const settings = $appSettings.getState();
  const inactive = getInactiveDeck();

  // Make sure deck B is wired into the Web Audio graph
  ensureDeckBConnected();

  // Beatmatch: align tempo and phase
  let rateApplied = 1;
  if (settings.djMode === 'beatmatch' && nextTrack && outgoingTrackId) {
    const outgoingBeat = getCachedBpm(outgoingTrackId);
    const nextBeat = getCachedBpm(nextTrack.track.id);

    if (outgoingBeat && nextBeat) {
      // Always set rate even for similar BPMs so beats stay locked
      rateApplied = outgoingBeat.bpm / nextBeat.bpm;
      inactive.playbackRate = rateApplied;

      // Phase-aligned start: incoming's first beat lands on outgoing's next beat
      const outgoingTime = getActiveDeck().currentTime;
      inactive.currentTime = calcPhaseAlignedStartTime(
        outgoingTrackId,
        nextBeat,
        outgoingTime,
        rateApplied,
      );
    } else {
      // BPM data missing — plain crossfade from the start
      inactive.currentTime = nextBeat?.firstBeatOffset ?? 0;
    }
  } else {
    inactive.currentTime = 0;
  }

  inactive.play().catch(() => {});

  // Schedule gain ramps via the Web Audio clock for sample-accurate crossfade
  const ctx = getAudioContext();
  const activeGain = getActiveDeckGain();
  const inactiveGain = getInactiveDeckGain();

  const fadeDuration = settings.djMode === 'gapless' ? 0.05 : settings.crossfadeDuration;

  if (ctx && activeGain && inactiveGain) {
    const t = ctx.currentTime;

    activeGain.gain.cancelScheduledValues(t);
    activeGain.gain.setValueAtTime(activeGain.gain.value, t);
    activeGain.gain.linearRampToValueAtTime(0, t + fadeDuration);

    inactiveGain.gain.cancelScheduledValues(t);
    inactiveGain.gain.setValueAtTime(0, t);
    inactiveGain.gain.linearRampToValueAtTime(1, t + fadeDuration);
  }

  crossfadeTimer = setTimeout(
    () => completeCrossfade(rateApplied),
    fadeDuration * 1_000,
  );
}

function completeCrossfade(incomingRate: number): void {
  crossfadeTimer = null;
  if (state !== 'crossfading') return; // aborted between schedule and fire

  // Capture references before the swap changes which is active/inactive
  const outgoing = getActiveDeck();
  const incoming = getInactiveDeck();
  const outGain = getActiveDeckGain();
  const inGain = getInactiveDeckGain();

  // Snap gains to exact values in case of floating-point drift
  const ctx = getAudioContext();
  if (ctx) {
    const t = ctx.currentTime;
    if (outGain) { outGain.gain.cancelScheduledValues(t); outGain.gain.value = 0; }
    if (inGain) { inGain.gain.cancelScheduledValues(t); inGain.gain.value = 1; }
  } else {
    if (outGain) outGain.gain.value = 0;
    if (inGain) inGain.gain.value = 1;
  }

  // Stop and clear the outgoing deck
  outgoing.pause();
  outgoing.src = '';

  // Ramp the incoming deck's playbackRate back to 1× over 4 beats
  if (incomingRate !== 1) {
    const bpmData = nextTrack ? getCachedBpm(nextTrack.track.id) : null;
    const rampSecs = bpmData ? (60 / bpmData.bpm) * 4 : 2;
    rampPlaybackRate(incoming, incomingRate, 1, rampSecs);
  }

  const nxt = nextTrack!;
  const src = nextTrackSrc!;
  const wasManualSkip = manualSkip;

  // Promote the incoming deck; update lastTrackId/lastSrc in engine so the
  // next $player.watch() call recognises the track as already loaded.
  swapDecks(nxt.track.id, src);

  state = 'idle';
  nextTrack = null;
  nextTrackSrc = null;
  outgoingTrackId = null;
  manualSkip = false;
  setCrossfadeInProgress(false);

  if (!wasManualSkip) {
    // Time-based crossfade: advance the queue now.
    trackEnded();
  }
  // Manual skip: store already advanced when user pressed Next.
}
