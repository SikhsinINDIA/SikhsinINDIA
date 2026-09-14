import {
  db, doc, setDoc, updateDoc, getDoc, onSnapshot, collection,
  serverTimestamp, increment, SESSIONS_COLLECTION
} from "./firebase.js";

const HEARTBEAT_SECONDS = 20;

/**
 * Tracks how long a logged-in member has had the Akhand Path page open while
 * the sync engine reports playback as "live". Call start() once the member
 * is authenticated; call stop() on logout/page hide.
 */
export function createAttendanceTracker({ sessionId, uid, name, email, isActive }) {
  const ref = doc(db, SESSIONS_COLLECTION, sessionId, "attendance", uid);
  let timer = null;
  let initialized = false;

  async function ensureDoc() {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: name || "",
        email: email || "",
        total_seconds_listened: 0,
        first_joined_at: serverTimestamp(),
        last_heartbeat_at: serverTimestamp()
      });
    }
    initialized = true;
  }

  async function beat() {
    if (typeof isActive === "function" && !isActive()) return;
    try {
      if (!initialized) await ensureDoc();
      await updateDoc(ref, {
        name: name || "",
        email: email || "",
        total_seconds_listened: increment(HEARTBEAT_SECONDS),
        last_heartbeat_at: serverTimestamp()
      });
    } catch (err) {
      console.error("Attendance heartbeat failed:", err);
    }
  }

  function start() {
    beat();
    timer = setInterval(beat, HEARTBEAT_SECONDS * 1000);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, beatNow: beat };
}

export function formatSeconds(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const sec = Math.floor(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function formatDate(timestamp) {
  if (!timestamp) return "N/A";
  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString();
}

/** Live-subscribes to a program's attendance subcollection; onUpdate receives a sorted array of rows. */
export function watchAttendance(sessionId, onUpdate) {
  const ref = collection(db, SESSIONS_COLLECTION, sessionId, "attendance");
  return onSnapshot(ref, (snapshot) => {
    const rows = [];
    snapshot.forEach((docSnap) => rows.push({ ...docSnap.data(), uid: docSnap.id }));
    rows.sort((a, b) => (b.total_seconds_listened || 0) - (a.total_seconds_listened || 0));
    onUpdate(rows);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

export function renderAttendanceTable(tbodyEl, rows, { highlightUid } = {}) {
  if (!rows || !rows.length) {
    tbodyEl.innerHTML = `<tr><td colspan="4" class="no-data">No attendance recorded yet.</td></tr>`;
    return;
  }
  const nowMs = Date.now();
  tbodyEl.innerHTML = rows.map((r) => {
    const lastBeatMs = r.last_heartbeat_at && typeof r.last_heartbeat_at.toDate === "function"
      ? r.last_heartbeat_at.toDate().getTime()
      : null;
    const isRecent = lastBeatMs && (nowMs - lastBeatMs) < 60000;
    const isMe = highlightUid && r.uid === highlightUid;
    return `
      <tr${isMe ? ' style="background:#fff3e0;"' : ""}>
        <td>${escapeHtml(r.name || r.email || r.uid)}${isMe ? " (you)" : ""}</td>
        <td>${escapeHtml(r.email || "")}</td>
        <td>${formatSeconds(r.total_seconds_listened)}</td>
        <td>${isRecent ? '<span class="badge">Listening now</span>' : formatDate(r.last_heartbeat_at)}</td>
      </tr>`;
  }).join("");
}

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function exportAttendanceCsv(rows, filenamePrefix = "akhand-path-attendance") {
  const header = ["Name", "Email", "Total Seconds", "Total Duration", "Last Heartbeat"];
  const lines = [header.join(",")];
  (rows || []).forEach((r) => {
    lines.push([
      csvEscape(r.name),
      csvEscape(r.email),
      r.total_seconds_listened || 0,
      csvEscape(formatSeconds(r.total_seconds_listened)),
      csvEscape(formatDate(r.last_heartbeat_at))
    ].join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
