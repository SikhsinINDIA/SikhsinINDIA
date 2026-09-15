import { db, doc, updateDoc, SESSIONS_COLLECTION, DEFAULT_TRACK_DURATION_SECONDS } from "./firebase.js";

/* ---------------------------------------------------------------------
   Continuous, backend-free synchronized playback.

   There is no server process to "tick" through 48 hours of video, so every
   viewer computes its own position purely from wall-clock time against the
   session's startAt — nothing depends on any one viewer's browser staying
   open, which is what makes playback continue "irrespective of members
   logged in or logged out".

   Track durations are unknown up front (no YouTube API key available), so
   they're measured client-side the first time any viewer's player loads a
   given track (see reportTrackDuration) and cached on the session doc.
   Until a track's real duration is known, DEFAULT_TRACK_DURATION_SECONDS is
   used as a placeholder for position math — this only affects precision
   during a track's very first play-through of a session.
   --------------------------------------------------------------------- */

const DRIFT_TOLERANCE_SECONDS = 5;
const RECHECK_INTERVAL_MS = 10000;

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

/**
 * Pure function: given a session document and the (hardcoded, app-wide)
 * video sequence, returns where playback should be RIGHT NOW. Does not touch
 * the network or the player. `videoSequence` is optional — callers that only
 * need phase/elapsed info (e.g. admin.html's status labels) can omit it.
 *
 * `playbackSpeed` (default 1) is the rate the YouTube player is actually set
 * to via setPlaybackRate(). This MUST be threaded through here, not just
 * applied to the player and the status text — this function is what decides
 * which track and what offset gets shown/seeked-to, so if it doesn't know
 * the real video is playing faster than 1x, its "current position" silently
 * drifts behind reality, and the periodic drift-correction in
 * AkhandPathSync.tick() ends up fighting the sped-up player instead of
 * tracking it.
 *
 * `session.duration_hours` is the REAL WALL-CLOCK length of the session,
 * exactly as an admin (or a direct Firestore edit) set it — used as-is for
 * `durationMs`, with no hidden division by playback speed. This used to be
 * "normal-speed content length ÷ speed", but that was a silent, undocumented
 * transformation: setting duration_hours to the real number you actually
 * want displayed (e.g. 54.33 for ~54h20m) got divided by speed AGAIN,
 * producing a much shorter session than intended. Treating duration_hours as
 * the literal real-world total avoids that trap and matches how the field
 * reads to a human. It has no effect on track/offset selection, which
 * already derives purely from elapsed real time × speed against the actual
 * measured video lengths, independent of this field.
 */
export function computePosition(session, videoSequence, playbackSpeed) {
  if (!session) return { phase: "missing" };

  if (session.status === "ended") {
    return { phase: "completed" };
  }
  if (session.status === "pending_approval") {
    return { phase: "pending_approval" };
  }
  if (session.status === "rejected") {
    return { phase: "rejected" };
  }

  const startMs = toMillis(session.start_at);
  if (!startMs) return { phase: "scheduled" };

  const speed = playbackSpeed && playbackSpeed > 0 ? playbackSpeed : 1;
  const durationHours = session.duration_hours || 48;
  const durationMs = durationHours * 3600 * 1000;
  const nowMs = Date.now();

  if (nowMs < startMs) {
    return { phase: "scheduled", startsInMs: startMs - nowMs, startMs, durationMs };
  }

  const elapsedMs = nowMs - startMs;
  if (elapsedMs >= durationMs) {
    return { phase: "completed", startMs, durationMs };
  }

  const seq = Array.isArray(videoSequence) ? videoSequence : [];
  if (!seq.length) {
    return { phase: "live", trackIndex: -1, offsetSeconds: 0, startMs, durationMs, elapsedMs };
  }

  // Real durations (fetched directly from YouTube and embedded on each track
  // in VIDEO_SEQUENCE) take priority — accurate from the very first play,
  // not just after converging over time. The Firestore-measured cache and
  // DEFAULT_TRACK_DURATION_SECONDS only cover tracks with neither.
  const durations = session.durations || {};
  const trackSeconds = seq.map((t) => {
    if (t.durationSeconds && t.durationSeconds > 0) return t.durationSeconds;
    const measured = durations[t.key];
    return measured && measured > 0 ? measured : DEFAULT_TRACK_DURATION_SECONDS;
  });
  const loopTotalSeconds = trackSeconds.reduce((a, b) => a + b, 0);

  // Content-seconds actually consumed, given real elapsed time at this speed —
  // this (not raw elapsedMs) is what determines the track/offset to show.
  const contentSeconds = (elapsedMs / 1000) * speed;

  let remaining = contentSeconds % loopTotalSeconds;
  const loopNumber = Math.floor(contentSeconds / loopTotalSeconds);

  for (let i = 0; i < seq.length; i++) {
    if (remaining < trackSeconds[i]) {
      return {
        phase: "live",
        trackIndex: i,
        track: seq[i],
        offsetSeconds: remaining,
        loopNumber,
        startMs,
        durationMs,
        elapsedMs,
        contentSeconds,
        loopTotalSeconds
      };
    }
    remaining -= trackSeconds[i];
  }

  const lastIndex = seq.length - 1;
  return {
    phase: "live",
    trackIndex: lastIndex,
    track: seq[lastIndex],
    offsetSeconds: 0,
    loopNumber,
    startMs,
    durationMs,
    elapsedMs,
    contentSeconds,
    loopTotalSeconds
  };
}

/** Writes a track's measured real duration back onto the session doc (self-healing cache). */
export async function reportTrackDuration(sessionId, trackKey, seconds) {
  if (!sessionId || !trackKey || !seconds || seconds <= 0) return;
  try {
    await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
      [`durations.${trackKey}`]: Math.round(seconds)
    });
  } catch (err) {
    console.error("Could not report measured track duration:", err);
  }
}

/**
 * Drives a YouTube IFrame Player to continuously track the wall-clock
 * position computed from the latest session snapshot. `getSession()` should
 * always return the freshest session data (kept live via onSnapshot by the
 * caller); this class does not fetch data itself.
 */
export class AkhandPathSync {
  constructor({ sessionId, videoSequence, playbackSpeed, getSession, onPositionChange, onTrackChange }) {
    this.sessionId = sessionId;
    this.videoSequence = videoSequence || [];
    this.playbackSpeed = playbackSpeed && playbackSpeed > 0 ? playbackSpeed : 1;
    this.getSession = getSession;
    this.onPositionChange = onPositionChange || (() => {});
    this.onTrackChange = onTrackChange || (() => {});
    this.player = null;
    this.currentTrackIndex = -1;
    this._interval = null;
    this._durationReportedFor = new Set();
  }

  attachPlayer(ytPlayer) {
    this.player = ytPlayer;
  }

  /** Call this with whatever rate actually got applied to the player (YouTube only
      supports a fixed set of rates, so it may differ from the value passed at
      construction) — keeps position math honest instead of assuming a nominal speed. */
  setPlaybackSpeed(speed) {
    if (speed && speed > 0) this.playbackSpeed = speed;
  }

  start() {
    this.tick();
    this._interval = setInterval(() => this.tick(), RECHECK_INTERVAL_MS);
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
  }

  /** Call this from the player's onReady/onStateChange handlers once a track is actually playing. */
  maybeReportDuration(track) {
    if (!track || !this.player || typeof this.player.getDuration !== "function") return;
    if (this._durationReportedFor.has(track.key)) return;
    const d = this.player.getDuration();
    if (d && d > 0) {
      this._durationReportedFor.add(track.key);
      reportTrackDuration(this.sessionId, track.key, d);
    }
  }

  tick() {
    const session = this.getSession();
    const pos = computePosition(session, this.videoSequence, this.playbackSpeed);
    this.onPositionChange(pos);

    if (pos.phase !== "live" || pos.trackIndex < 0) return;

    if (pos.trackIndex !== this.currentTrackIndex) {
      this.currentTrackIndex = pos.trackIndex;
      this.onTrackChange(pos);
      if (this.player && typeof this.player.loadVideoById === "function") {
        this.player.loadVideoById({ videoId: pos.track.youtubeId, startSeconds: Math.floor(pos.offsetSeconds) });
      }
      return;
    }

    if (this.player && typeof this.player.getCurrentTime === "function") {
      this.maybeReportDuration(pos.track);
      const actual = this.player.getCurrentTime();
      if (Math.abs(actual - pos.offsetSeconds) > DRIFT_TOLERANCE_SECONDS) {
        this.player.seekTo(pos.offsetSeconds, true);
      }
    }
  }
}

export function formatDurationHM(ms) {
  if (ms == null || ms < 0) return "0h 0m";
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}
