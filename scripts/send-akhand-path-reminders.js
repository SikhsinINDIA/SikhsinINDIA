/* ──────────────────────────────────────────────────────────────
   Akhand Path Reminders
   Runs on a schedule (.github/workflows/akhand-path-reminders.yml,
   every 15 minutes) and sends a "starts in about an hour" reminder to
   the admin, sponsor and every consenting invitee ~60 minutes before
   an approved program's start time, a "reaches the Madh (Ang 705)"
   reminder ~60 minutes before the Madh, and a matching "concludes in
   about an hour" reminder ~60 minutes before its Samapti (start +
   duration_hours).

   No client page can do this — it has to fire on a wall-clock
   schedule whether or not anyone has the site open — so this runs
   server-side via firebase-admin, which is why it needs its own
   service account credential (FIREBASE_SERVICE_ACCOUNT_JSON), unlike
   every other script/page in this repo which only ever needs the
   client Firebase SDK.

   Email needs no template approval and works immediately. WhatsApp
   reminders use WHATSAPP_REMINDER_START_TEMPLATE / _END_TEMPLATE from
   03-nitnem/03-06-akhand-path/firebase.js, which are NOT approved in
   Meta yet as of when this was written — every WhatsApp send below is
   wrapped so a failure there never stops the email reminders or the
   reminder-sent flag from being written.

   Idempotency: each session doc gets start_reminder_sent /
   madh_reminder_sent / end_reminder_sent set to true right after that reminder goes out,
   so re-running this (or the next scheduled run finding the same
   session still in the time window) never double-sends.
   ────────────────────────────────────────────────────────────── */
const admin = require('firebase-admin');

const SESSIONS_COLLECTION = 'akhand_path';
const SEND_ENDPOINT = 'https://sikhsinindia-email.sikhsinindia.workers.dev';
// Server-only secret (GitHub Actions secret APP_SHARED_SECRET, must match
// the Worker's `wrangler secret put APP_SHARED_SECRET`). Never ship it to a browser.
const APP_SHARED_SECRET = process.env.APP_SHARED_SECRET;
if (!APP_SHARED_SECRET) throw new Error('APP_SHARED_SECRET env var is not set (add it as a GitHub Actions secret).');

const ADMIN_EMAIL = 'sikhsinindia@gmail.com';
const ADMIN_WHATSAPP_NUMBER = '+971521821108';
// Same as firebase.js's DEFAULT_DURATION_HOURS (full Path + shabad + Ardas).
const DEFAULT_DURATION_HOURS = 54.47;

const WHATSAPP_REMINDER_START_TEMPLATE = 'akhand_path_reminder_start';
const WHATSAPP_REMINDER_END_TEMPLATE = 'akhand_path_reminder_end';
const WHATSAPP_REMINDER_MADH_TEMPLATE = 'akhand_path_reminder_madh';

// The Madh (Ang 705) is 1:21 into Video 43 (youtubeId rhFmz9Iw2N4) of
// index.html's VIDEO_SEQUENCE. Videos 1-42 hold 150,840s of content, so at
// PLAYBACK_SPEED 1.5 it is reached (150840 + 81) / 1.5 = 100,614s
// (27h 56m 54s) after the start. Update it if VIDEO_SEQUENCE changes.
const MADH_OFFSET_MS = ((150840 + 81) / 1.5) * 1000;
const MADH_VIDEO_LINK = 'https://youtu.be/rhFmz9Iw2N4?t=81';

// What each reminder says, and the session flag that marks it as sent.
const KINDS = {
  start: { flag: 'start_reminder_sent', label: 'Start', happens: 'begins', subject: 'begins in about 1 hour', template: WHATSAPP_REMINDER_START_TEMPLATE },
  madh: { flag: 'madh_reminder_sent', label: 'Madh (Ang 705)', happens: 'reaches the Madh (Ang 705)', subject: 'reaches the Madh (Ang 705) in about 1 hour', template: WHATSAPP_REMINDER_MADH_TEMPLATE },
  end: { flag: 'end_reminder_sent', label: 'Samapti', happens: 'concludes (Samapti)', subject: 'concludes in about 1 hour', template: WHATSAPP_REMINDER_END_TEMPLATE }
};

// Start, Madh and Samapti times of a session (null without a start time).
function sessionTimes(session) {
  const start = session.start_at && session.start_at.toDate ? session.start_at.toDate() : null;
  if (!start) return null;
  const durationHours = session.duration_hours || DEFAULT_DURATION_HOURS;
  return {
    start,
    madh: new Date(start.getTime() + MADH_OFFSET_MS),
    end: new Date(start.getTime() + durationHours * 3600 * 1000)
  };
}
const WHATSAPP_LANGUAGE_CODE = 'en';

// The cron runs every 15 min; a ±10 min window around the 60-min mark
// gives every run at least one overlapping chance to catch a session
// even if a run is skipped/delayed, without ever spanning 30 min (so
// two consecutive runs can't both fire for the same reminder before
// the "sent" flag is visible - Firestore writes are read-your-own-
// writes consistent for the same client, which this single script run
// always is).
const WINDOW_MS = 10 * 60 * 1000;
const TARGET_LEAD_MS = 60 * 60 * 1000;

function withinReminderWindow(targetTime, now) {
  const diff = targetTime.getTime() - now.getTime();
  return diff > TARGET_LEAD_MS - WINDOW_MS && diff <= TARGET_LEAD_MS + WINDOW_MS;
}

function formatFullDateTime(d) {
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }) + ' IST';
}

async function sendEmail(to, subject, text) {
  const res = await fetch(SEND_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': APP_SHARED_SECRET },
    body: JSON.stringify({ to, subject, text })
  });
  if (!res.ok) throw new Error(`Email send failed (HTTP ${res.status}): ${await res.text().catch(() => '')}`);
}

async function sendWhatsApp(to, templateName, params) {
  const res = await fetch(SEND_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': APP_SHARED_SECRET },
    body: JSON.stringify({ action: 'send_whatsapp', to, templateName, languageCode: WHATSAPP_LANGUAGE_CODE, params })
  });
  if (!res.ok) throw new Error(`WhatsApp send failed (HTTP ${res.status}): ${await res.text().catch(() => '')}`);
}

function sessionLinkFor(sessionId) {
  return `https://sikhsinindia.com/03-nitnem/03-06-akhand-path/index.html?session=${sessionId}`;
}

/* Best-effort: logs and continues rather than throwing, so one bad
   phone number or an unapproved template never stops the rest of the
   recipients (or the other reminder type) from going out. */
async function safe(label, fn) {
  try {
    await fn();
    console.log('  OK: ' + label);
  } catch (err) {
    console.warn('  FAILED (continuing): ' + label + ' - ' + (err.message || err));
  }
}

async function sendReminderForSession(db, doc, kind) {
  const session = doc.data();
  const sessionId = doc.id;
  const times = sessionTimes(session);
  if (!times) return;
  const k = KINDS[kind];
  const eventTime = times[kind];
  const link = sessionLinkFor(sessionId);

  const emailSubject = `Reminder: Akhand Path ${k.subject} — ${session.name || ''}`;
  const emailBody = (greeting) => `Dear ${greeting},

Sat Sri Akaal!
Waheguru ji ka Khalsa, Waheguru ji ki Fateh!

This is a reminder that the Akhand Path Sahib Ji dedicated to ${session.name || ''}${session.purpose ? ' on occasion of ' + session.purpose : ''}, sponsored by ${session.sponsor || ''}, ${k.happens} in about 1 hour:

${k.label}: ${formatFullDateTime(eventTime)}

Session Link: ${link}
${kind === 'madh' ? `Watch Ang 705: ${MADH_VIDEO_LINK}
` : ''}
Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh!
Team – SikhsinIndia.com
Email: ${ADMIN_EMAIL}`;

  const waTemplate = k.template;
  // akhand_path_reminder_madh has one more variable, {{5}}, the Ang 705 video link.
  const waParams = kind === 'madh'
    ? [session.name || '', session.purpose || '', formatFullDateTime(eventTime), link, MADH_VIDEO_LINK, 'Sikhs In India']
    : [session.name || '', session.purpose || '', formatFullDateTime(eventTime), link, 'Sikhs In India'];

  console.log(`Sending ${kind} reminder for session ${sessionId} (${session.name || 'untitled'})`);

  // Admin
  await safe('admin email', () => sendEmail(ADMIN_EMAIL, emailSubject, emailBody('Admin')));
  await safe('admin WhatsApp', () => sendWhatsApp(ADMIN_WHATSAPP_NUMBER, waTemplate, waParams));

  // Sponsor
  if (session.email) {
    await safe('sponsor email', () => sendEmail(session.email, emailSubject, emailBody(session.sponsor || 'Sponsor')));
  }
  if (session.mobie) {
    await safe('sponsor WhatsApp', () => sendWhatsApp(session.mobie, waTemplate, waParams));
  }

  // Invitees
  const inviteesSnap = await db.collection(SESSIONS_COLLECTION).doc(sessionId).collection('invitees').get();
  for (const inviteeDoc of inviteesSnap.docs) {
    const inv = inviteeDoc.data();
    if (inv.mail) {
      await safe(`invitee email (${inv.mail})`, () => sendEmail(inv.mail, emailSubject, emailBody(inv.gname || inv.name || 'Sangat Ji')));
    }
    if (inv.phone && inv.wa_consent) {
      await safe(`invitee WhatsApp (${inv.mail || inviteeDoc.id})`, () => sendWhatsApp(inv.phone, waTemplate, waParams));
    }
  }

  await db.collection(SESSIONS_COLLECTION).doc(sessionId).update({
    [k.flag]: true
  });
}

async function main() {
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!credentialJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — see the comment at the top of ' +
      '.github/workflows/akhand-path-reminders.yml for how to generate and add it.');
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(credentialJson)) });
  const db = admin.firestore();

  const now = new Date();
  const snap = await db.collection(SESSIONS_COLLECTION).where('status', '==', 'scheduled').get();
  console.log(`Checking ${snap.size} scheduled session(s) at ${now.toISOString()}`);

  for (const doc of snap.docs) {
    const session = doc.data();
    const times = sessionTimes(session);
    if (!times) continue;

    for (const kind of ['start', 'madh', 'end']) {
      // A program shortened below the Madh never reaches it.
      if (kind === 'madh' && times.madh >= times.end) continue;
      if (!session[KINDS[kind].flag] && withinReminderWindow(times[kind], now)) {
        await sendReminderForSession(db, doc, kind);
      }
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
