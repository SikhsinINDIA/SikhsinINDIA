import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDq35pvLrPM_HwfJq6TEBbKVJqBapaweEU",
  authDomain: "sikhsinindia-67a6b.firebaseapp.com",
  databaseURL: "https://sikhsinindia-67a6b-default-rtdb.firebaseio.com",
  projectId: "sikhsinindia-67a6b",
  storageBucket: "sikhsinindia-67a6b.firebasestorage.app",
  messagingSenderId: "622603668882",
  appId: "1:622603668882:web:953c6a07864b235fdd054b",
  measurementId: "G-LHNTFNW14H"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* Secondary Firebase App instance — used ONLY for creating invitee Auth
   accounts from the admin page. Firebase signs the caller in as whichever
   user was just created via createUserWithEmailAndPassword(); running that
   call against a SEPARATE app instance keeps the admin's own session on
   the primary `auth` instance untouched. */
const provisioningApp = initializeApp(firebaseConfig, "akhand-path-provisioning");
export const provisioningAuth = getAuth(provisioningApp);

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  increment
};

export const ADMIN_EMAIL = "sikhsinindia@gmail.com";
export const INVITEE_PASSWORD = "123456";

/* Emails that get admin-level treatment when signed in via the normal
   Firebase login (e.g. index.html's session picker, restricted to admin —
   see isAdminSession in index.html). Separate from the shared password
   gate on 03-06a-password-akhand-path.html, which protects the admin
   *dashboard* itself; this instead recognizes admins by who they're
   actually logged in as, so it works from any device/browser without
   needing to re-enter that password there too. */
export const ADMIN_EMAILS = ["tpsarora@gmail.com", "sikhsinindia@gmail.com"];
export function isAdminEmail(email) {
  return ADMIN_EMAILS.includes((email || "").trim().toLowerCase());
}
export const DEFAULT_TRACK_DURATION_SECONDS = 900; // 15 min fallback estimate until a track's real length is measured

/* Firestore doc IDs for invitees/attendance are keyed by a sanitized email
   rather than the Firebase Auth UID. Reason: the admin has no Admin SDK
   access from a static site, so if the same person is invited to a second
   Akhand Path later, createUserWithEmailAndPassword() will fail with
   auth/email-already-in-use and there'd be no client-side way to look up
   their existing UID. Keying by email sidesteps that entirely. */
export function emailKey(email) {
  return (email || "").trim().toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
}

function deriveInviteeFromEmail(mail) {
  const local = (mail || "").split("@")[0] || mail || "";
  const derived = local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { name: derived, gname: derived, mail: (mail || "").trim().toLowerCase() };
}

/* Parses the sponsor request form's free-text invitee field into
   {name, gname, mail} objects, shared by 03-06-01-request-akhand-path.html
   (building the admin notification) and 03-06-03-admin-akhand-path.html
   (building the sponsor email + creating invitee accounts on approval) so
   both read the exact same data the same way. Supports two formats,
   detected automatically:
     - "Name; Greeting Name; Email" one per line (current form format)
     - bare emails, one per line or comma-separated (older submissions, from
       before the form collected names) — greeting name is derived from the
       email's local part since there's no name to use. */
export function parseInviteeList(rawText) {
  const text = (rawText || "").trim();
  if (!text) return [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.some((l) => l.includes(";"))) {
    return lines.map((line) => {
      const parts = line.split(";").map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 3) return { name: parts[0], gname: parts[1], mail: (parts[2] || "").toLowerCase() };
      if (parts.length === 2) return { name: parts[0], gname: parts[0], mail: (parts[1] || "").toLowerCase() };
      return deriveInviteeFromEmail(parts[0]);
    });
  }
  return text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).map(deriveInviteeFromEmail);
}

/* Builds the full list of people who are SUPPOSED to be part of a program —
   the sponsor plus every requested invitee — each keyed by the same
   emailKey() used for their real attendance/invitee doc IDs. Used to fill
   out the Attendance Report with everyone expected, not just whoever has
   actually logged in and started listening so far (see
   mergeAttendanceRoster in attendance.js), since otherwise someone who
   simply hasn't joined yet was silently missing from the report entirely
   rather than showing as not having joined. */
export function buildExpectedRoster(session) {
  const roster = [];
  const sponsorEmail = (session?.email || "").trim();
  if (sponsorEmail) {
    roster.push({ uid: emailKey(sponsorEmail), name: session.sponsor || sponsorEmail, email: sponsorEmail });
  }
  parseInviteeList(session?.invitee_emails_raw).forEach((inv) => {
    if (!inv.mail) return;
    roster.push({ uid: emailKey(inv.mail), name: inv.name || inv.gname || inv.mail, email: inv.mail });
  });
  return roster;
}

/* The Apps Script Drive upload (used for honoree photos) returns a file's
   normal "view" URL — https://drive.google.com/file/d/ID/view?usp=drivesdk —
   which works fine as a link a person clicks, but NOT as an <img src>: it's
   an HTML viewer page, not the raw image bytes, so the browser just shows a
   broken-image icon. Drive's /thumbnail endpoint serves the actual image
   data and is what every photo_url needs to go through before being put in
   an <img> tag. Non-Drive URLs (or already-thumbnail ones) pass through
   unchanged, so this is safe to call on anything. Applied both when storing
   a newly uploaded photo_url and again at every display site, so it also
   self-heals any already-stored "view"-format URLs from before this fix. */
export function driveImageUrl(url) {
  if (!url) return url;
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (!match) return url;
  return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
}

/* All emails from this app (approval, invite, admin notification) are built
   as plain text and sent to the Cloudflare Worker's `text` field. Several
   email clients — Outlook in particular — don't reliably render single line
   breaks in plain text, so lines that were typed on separate lines in the
   template arrive collapsed into one dense paragraph. Sending an `html`
   version alongside `text` (most clients prefer html when both are present)
   fixes that: blank-line-separated blocks become real paragraphs with
   spacing, single newlines become <br>, and bare URLs stay clickable links
   instead of being escaped into plain text. */
export function textToEmailHtml(text) {
  const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = String(text)
    .split(/\n{2,}/)
    .map((para) => {
      const withLinks = escape(para).replace(
        /(https?:\/\/[^\s<]+)/g,
        (url) => `<a href="${url}" style="color:#0d1b3e;">${url}</a>`
      );
      return `<p style="margin:0 0 16px;">${withLinks.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#222;">${paragraphs}</div>`;
}

/* The video sequence itself is hardcoded in index.html (not stored per-session
   in Firestore) — every program plays the same fixed playlist, so there's
   nothing session-specific to configure. See VIDEO_SEQUENCE in index.html. */

/* Suggestions only (purpose is stored as free text, e.g. "salana yaad") */
export const PURPOSE_SUGGESTIONS = [
  "Birthday",
  "Wedding Anniversary",
  "Death Anniversary",
  "Barsi",
  "Salana Yaad",
  "Bhog Ceremony",
  "Thanksgiving"
];

export const EMAILJS_PUBLIC_KEY = "K78OA7rLhPrvdRITV";
/* EmailJS "Strict Mode" is enabled on this account — sends fail with HTTP 412
   unless the private key is also passed at init. Strict Mode is EmailJS's own
   intended way to use this key client-side (paired with the dashboard's
   allowed-origins list), not a workaround of their security model. */
export const EMAILJS_PRIVATE_KEY = "8aSZFwaDi1iveGhPwPE_Q";
export const EMAILJS_SERVICE_ID = "service_02r0ak5";
export const EMAILJS_TEMPLATE_ID = "template_gzwnh1j";

/* Cloudflare Worker (cloudflare-worker/src/index.js in the repo root) — used
   for the "sponsor request approved" notification
   (03-06-03-admin-akhand-path.html's approveRequest). None of
   SnapitForms/FormSubmit/Formspree's free tiers
   support a dynamic per-submission recipient, and EmailJS's free plan is
   capped at 2 templates (both already used elsewhere). The Worker proxies to
   the Resend API with the API key kept server-side, so it can send to any
   recipient with no template or per-provider cap.
   SEND_EMAIL_ENDPOINT is blank until the Worker is deployed — fill it in
   with the `*.workers.dev` URL `wrangler deploy` prints. APP_SHARED_SECRET
   must exactly match the value set via `wrangler secret put APP_SHARED_SECRET`
   for that Worker, or it will reject every request as unauthorized. */
export const SEND_EMAIL_ENDPOINT = "https://sikhsinindia-email.sikhsinindia.workers.dev";
export const APP_SHARED_SECRET = "LuOoE-d92AyXMGsCBA0FcQGhKsYRLgs6";

/* Firestore collection: one flat document per Akhand Path program, matching
   the "akhand_path" schema already seeded (name, email, mobie, purpose,
   sponsor, akhand_path_id). Invitees/attendance live in subcollections
   underneath each program doc so the invitee count is unbounded, rather
   than fixed name_1..5/mail_1..5 slots. */
export const SESSIONS_COLLECTION = "akhand_path";

/* Builds an absolute URL to another page in this same folder, from whatever
   page is currently running — e.g. siteFilePath("index.html") or
   siteFilePath("login.html", "?session=" + id). Several pages need to link
   to index.html/login.html/admin.html regardless of their own filename
   (approval emails, "session link" fields, invitee emails); the old pattern
   of `location.pathname.replace(/admin\.html$/, "index.html")` silently
   breaks the moment the CURRENT page's own filename changes (as happened
   when the site moved to the numbered 03-06-01../03-06-02../03-06-03..
   filenames) — it just returns the path unchanged instead of erroring, so
   the bug is invisible until someone clicks a wrong link. Deriving the
   folder path instead of assuming the current filename fixes that for good. */
export function siteFilePath(filename, suffix) {
  const dir = window.location.pathname.replace(/[^/]+$/, "");
  return `${window.location.origin}${dir}${filename}${suffix || ""}`;
}

function formatFullDateTimeForEmail(d) {
  return d.toLocaleString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

/* Creates (or ensures) an invitee's Firebase Auth login, writes/updates their
   invitees/{emailKey} doc, and emails them the program details + login link.
   This is the ONE place that logic lives: both the "Approve" button on
   03-06-03-admin-akhand-path.html (auto-provisioning a sponsor's requested
   invitees) and the raw data editor's "Send Invites" action (re-running it
   later — e.g. for a program whose status/approved_at were set directly
   through the raw editor rather than by clicking Approve, which silently
   skips this step entirely and leaves it with zero real invitee accounts)
   call this same function, so there's exactly one invite email template and
   one account-creation path instead of two copies that can drift apart.
   Returns one {mail, ok, error?} result per invitee. */
export async function provisionInvitees(sessionId, session, invitees) {
  const results = [];
  for (const invitee of invitees) {
    const mail = (invitee.mail || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      results.push({ mail, ok: false, error: "invalid email address" });
      continue;
    }
    const inviteeRef = doc(db, SESSIONS_COLLECTION, sessionId, "invitees", emailKey(mail));
    try {
      try {
        await createUserWithEmailAndPassword(provisioningAuth, mail, INVITEE_PASSWORD);
      } catch (authErr) {
        if (authErr.code !== "auth/email-already-in-use") throw authErr;
      }

      const gname = invitee.gname || invitee.name || mail;
      await setDoc(inviteeRef, {
        name: invitee.name || gname, gname, mail,
        invited_at: serverTimestamp(), email_sent: false
      }, { merge: true });

      const start = session.start_at && session.start_at.toDate ? session.start_at.toDate() : new Date();
      const durationHours = session.duration_hours || 48;
      const samapti = new Date(start.getTime() + durationHours * 3600 * 1000);

      const text = `Dear ${gname},

Sat Sri Akaal!
Waheguru ji ka Khalsa, Waheguru ji ki Fateh!

You have been invited for Akhand Path. Please find below the details:

Path in the name of: ${session.name || ""} on occasion of ${session.purpose || ""}, sponsored by: ${session.sponsor || ""}

Aaramb / Start Date and Time: ${formatFullDateTimeForEmail(start)}

Samapti / Planned Completion Date and Time: ${formatFullDateTimeForEmail(samapti)}

Session Link: ${siteFilePath("index.html", `?session=${sessionId}`)}

Your login ID: ${mail} and password is "${INVITEE_PASSWORD}"

Akhand Paath is a deeply meaningful practice in Sikhism, far surpassing a mere religious ritual; it represents a profound spiritual journey, demonstrating their spiritual dedication.

Looking forward for your active participation in the Akhand Path.

Best regards,
${session.sponsor || ""}
Team – SikhsinIndia.com
Email: ${ADMIN_EMAIL}`;

      if (!SEND_EMAIL_ENDPOINT) throw new Error("SEND_EMAIL_ENDPOINT is not configured.");
      const res = await fetch(SEND_EMAIL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Secret": APP_SHARED_SECRET },
        body: JSON.stringify({
          to: mail,
          subject: `You're invited — Akhand Path for ${session.name || ""}`,
          text,
          html: textToEmailHtml(text)
        })
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Email send failed (HTTP ${res.status}) ${detail}`);
      }

      await updateDoc(inviteeRef, { email_sent: true });
      results.push({ mail, ok: true });
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      results.push({ mail, ok: false, error: message });
      try { await setDoc(inviteeRef, { email_error: message }, { merge: true }); } catch (_) { /* best effort */ }
    }
  }
  return results;
}

/** Returns the next sequential integer ID for a new program doc. */
export async function nextAkhandPathId() {
  const q = query(collection(db, SESSIONS_COLLECTION), orderBy("akhand_path_id", "desc"), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return 1;
  const top = snap.docs[0].data();
  return (Number(top.akhand_path_id) || 0) + 1;
}

/* A program's phase (scheduled/live/completed) is always COMPUTED live from
   start_at + duration_hours (see sync.js's computePosition) — the stored
   `status` field is never touched automatically, only by the admin's
   "End This Session Now" button. That leaves `status` reading "scheduled"
   forever on a program that's long since finished, which looks broken if
   you're looking at the raw Firestore data rather than a page that computes
   the phase itself. This lets any page that's already looking at a session
   opportunistically self-heal that field once it notices the program is
   over — safe to call repeatedly or from multiple viewers at once, since
   it's a no-op once status is already "ended". */
export async function markEndedIfComplete(sessionId, session, phase) {
  if (phase !== "completed" || !session) return;
  if (session.status === "ended" || session.status === "pending_approval" || session.status === "rejected") return;
  try {
    await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), { status: "ended", ended_at: serverTimestamp() });
  } catch (err) {
    console.error("Could not auto-mark session as ended:", err);
  }
}

/* Finds every program a given email is connected to — either as the sponsor
   (session.email) or as an invitee (a doc in that session's invitees
   subcollection, matched on its `mail` field since sponsor/invitee email
   casing isn't consistently normalized before being stored). Used by the
   "My Akhand Path" page so a logged-in sponsor/invitee only ever sees the
   program(s) they actually belong to — never the full public list, and
   never programs scheduled in parallel by someone else.
   Fetches the whole sessions collection and the whole "invitees" collection
   group and filters client-side, rather than a Firestore `where` query —
   deliberately, since a collection-group query with a filter needs a
   composite index Firestore won't create until you click a link in a
   console error the first time it runs, and both collections are small. */
export async function findMyPrograms(email) {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return [];

  const results = new Map();

  const sponsorSnap = await getDocs(collection(db, SESSIONS_COLLECTION));

  // Admins aren't necessarily a sponsor/invitee on every program, but should
  // still see all of them here (matching the admin session picker on
  // index.html), not just the ones they happen to be personally tied to.
  if (isAdminEmail(normalized)) {
    sponsorSnap.forEach((d) => {
      results.set(d.id, { id: d.id, data: d.data(), role: "admin" });
    });
    return Array.from(results.values());
  }

  sponsorSnap.forEach((d) => {
    if ((d.data().email || "").trim().toLowerCase() === normalized) {
      results.set(d.id, { id: d.id, data: d.data(), role: "sponsor" });
    }
  });

  const inviteeSnap = await getDocs(collectionGroup(db, "invitees"));
  for (const d of inviteeSnap.docs) {
    if ((d.data().mail || "").trim().toLowerCase() !== normalized) continue;
    const sessionId = d.ref.parent.parent.id;
    if (results.has(sessionId)) continue; // already matched as sponsor
    const sessionSnap = await getDoc(doc(db, SESSIONS_COLLECTION, sessionId));
    if (sessionSnap.exists()) {
      results.set(sessionId, { id: sessionId, data: sessionSnap.data(), role: "invitee" });
    }
  }

  return Array.from(results.values());
}
