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
// ID of the track that was playing when we began preloading — used to look up
// the outgoing BPM even after the player has already advanced (manual skip).
let outgoingTrackId: string | null = null;
let crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
// True when the crossfade was initiated by a manual skip; completeCrossfade()
// skips trackEnded() in that case because the queue already advanced.
let manualSkip = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDjActive(): boolean {
  return $appSettings.getState().djMode !== 'off' && !$cast.getState().isCasting;
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
  outgoingTrackId = null;
  manualSkip = false;
  setCrossfadeInProgress(false);
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

// ── Track-change hook: intercept manual skips ─────────────────────────────────
//
// engine.ts calls this before doing an immediate track reload.  If we have the
// incoming track already preloaded we start the crossfade and return true so
// engine.ts skips the reload entirely.

registerTrackChangeHook((trackId, _src) => {
  if (!isDjActive()) return false;
  if (state !== 'preloaded') return false;
  if (nextTrack?.track.id !== trackId) return false;

  // The user manually skipped to exactly the track we have preloaded.
  // Start the crossfade; the store has already advanced so we must NOT call
  // trackEnded() when the crossfade finishes.
  manualSkip = true;
  startCrossfade();
  return true; // prevent engine.ts from reloading
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
      const expectedNext = queue[queueIndex + 1];
      if (!expectedNext || expectedNext.track.id !== nextTrack.track.id) {
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

    state = 'preloading';
    nextTrack = upcoming;
    nextTrackSrc = getStreamUrl(upcoming.track.filePath, streamPort);
    outgoingTrackId = current.track.id;

    const deck = getInactiveDeck();
    deck.src = nextTrackSrc;
    deck.load();

    const { djMode } = $appSettings.getState();

    // Kick off BPM detection for both tracks in parallel (results are cached)
    if (djMode === 'beatmatch') {
      if (current.track.filePath) {
        detectBpm(current.track.id, getStreamUrl(current.track.filePath, streamPort))
          .catch(() => {});
      }
      detectBpm(upcoming.track.id, nextTrackSrc)
        .then(() => {
          if (state === 'preloading') state = 'preloaded';
        })
        .catch(() => {
          if (state === 'preloading') state = 'preloaded';
        });
    }

    // For crossfade-only mode, mark ready as soon as audio can start playing
    if (djMode === 'crossfade') {
      const onCanPlay = () => {
        deck.removeEventListener('canplay', onCanPlay);
        if (state === 'preloading') state = 'preloaded';
      };
      deck.addEventListener('canplay', onCanPlay);
    }

    return;
  }

  // ── Time-based crossfade trigger ───────────────────────────────────────────
  if (state === 'preloaded') {
    const { currentTime, duration } = player;
    if (duration <= 0) return;
    const triggerAt = Math.max(0, duration - $appSettings.getState().crossfadeDuration);
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

  if (ctx && activeGain && inactiveGain) {
    const t = ctx.currentTime;
    const dur = settings.crossfadeDuration;

    activeGain.gain.cancelScheduledValues(t);
    activeGain.gain.setValueAtTime(activeGain.gain.value, t);
    activeGain.gain.linearRampToValueAtTime(0, t + dur);

    inactiveGain.gain.cancelScheduledValues(t);
    inactiveGain.gain.setValueAtTime(0, t);
    inactiveGain.gain.linearRampToValueAtTime(1, t + dur);
  }

  crossfadeTimer = setTimeout(
    () => completeCrossfade(rateApplied),
    settings.crossfadeDuration * 1_000,
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
