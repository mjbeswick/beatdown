/**
 * DJ Engine — crossfade and beatmatch between consecutive tracks.
 *
 * State machine:
 *   idle → preloading → preloaded → crossfading → idle (after swap)
 *
 * Crossfade uses Web Audio API gain scheduling for sample-accurate ramps.
 * Beatmatch adjusts the incoming deck's playbackRate so its tempo matches the
 * outgoing deck's during the mix, then ramps back to 1× over 4 beats.
 *
 * Falls back to plain crossfade when BPM data is unavailable.
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
} from './engine';
import { detectBpm, getCachedBpm } from './bpmDetector';
import { $player, trackEnded, getStreamUrl } from '../stores/player';
import { $appSettings } from '../stores/appSettings';
import type { PlayingTrack } from '../stores/player';

type DjState = 'idle' | 'preloading' | 'preloaded' | 'crossfading';

let state: DjState = 'idle';
let nextTrack: PlayingTrack | null = null;
let nextTrackSrc: string | null = null;
let crossfadeTimer: ReturnType<typeof setTimeout> | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function reset(): void {
  if (crossfadeTimer !== null) {
    clearTimeout(crossfadeTimer);
    crossfadeTimer = null;
  }

  // Cancel in-progress gain ramps and restore deck A to full volume
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

// ── Main state machine driven by $player ─────────────────────────────────────

$player.watch((player) => {
  const settings = $appSettings.getState();
  if (settings.djMode === 'off') {
    if (state !== 'idle') reset();
    return;
  }

  const { queue, queueIndex, isPlaying, current, streamPort } = player;

  // If the queue changed such that our preloaded "next" track no longer lines
  // up with what the queue says comes next, abort and start fresh.
  if (state !== 'idle' && nextTrack) {
    const expectedNext = queue[queueIndex + 1];
    if (!expectedNext || expectedNext.track.id !== nextTrack.track.id) {
      reset();
    }
  }

  if (!isPlaying || !current) return;

  const upcomingIdx = queueIndex + 1;
  const upcoming = queue[upcomingIdx];
  if (!upcoming?.track.filePath || !streamPort) return;

  // ── Preload phase ──────────────────────────────────────────────────────────
  if (state === 'idle') {
    if (upcoming.track.id === nextTrack?.track.id) return; // already preloaded

    state = 'preloading';
    nextTrack = upcoming;
    nextTrackSrc = getStreamUrl(upcoming.track.filePath, streamPort);

    const deck = getInactiveDeck();
    deck.src = nextTrackSrc;
    deck.load();

    // Kick off BPM detection for both tracks in parallel (results cached)
    if (settings.djMode === 'beatmatch') {
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

    // For crossfade-only mode mark ready as soon as audio can start
    if (settings.djMode === 'crossfade') {
      const onCanPlay = () => {
        deck.removeEventListener('canplay', onCanPlay);
        if (state === 'preloading') state = 'preloaded';
      };
      deck.addEventListener('canplay', onCanPlay);
    }

    return;
  }

  // ── Crossfade trigger ──────────────────────────────────────────────────────
  if (state === 'preloaded') {
    const { currentTime, duration } = player;
    if (duration <= 0) return;
    const triggerAt = Math.max(0, duration - settings.crossfadeDuration);
    if (currentTime >= triggerAt) {
      startCrossfade(player);
    }
  }
});

// ── Crossfade execution ───────────────────────────────────────────────────────

function startCrossfade(player: ReturnType<typeof $player.getState>): void {
  if (state === 'crossfading') return;
  state = 'crossfading';
  setCrossfadeInProgress(true);

  const settings = $appSettings.getState();
  const inactive = getInactiveDeck();

  // Make sure deck B is wired into the Web Audio graph
  ensureDeckBConnected();

  // Beatmatch: align tempo and phase
  let rateApplied = 1;
  if (settings.djMode === 'beatmatch' && nextTrack && player.current) {
    const currentBeat = getCachedBpm(player.current.track.id);
    const nextBeat = getCachedBpm(nextTrack.track.id);
    if (currentBeat && nextBeat && Math.abs(currentBeat.bpm - nextBeat.bpm) > 0.5) {
      rateApplied = currentBeat.bpm / nextBeat.bpm;
      inactive.playbackRate = rateApplied;
      // Start the incoming track at its first detected beat so the downbeats
      // align as closely as possible with the outgoing track's grid.
      inactive.currentTime = nextBeat.firstBeatOffset;
    } else {
      inactive.currentTime = 0;
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

  // Promote the incoming deck and update lastTrackId/lastSrc in engine so that
  // the subsequent $player.watch() call skips the redundant reload.
  swapDecks(nxt.track.id, src);

  state = 'idle';
  nextTrack = null;
  nextTrackSrc = null;
  setCrossfadeInProgress(false);

  // Advance the player queue — $player.watch() will see the track already
  // loaded and skip the src/load/play calls.
  trackEnded();
}
