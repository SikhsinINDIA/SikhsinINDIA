/* ──────────────────────────────────────────────────────────────
   Akhand Path Reminders
   Runs on a schedule (.github/workflows/akhand-path-reminders.yml,
   every 15 minutes) and sends a "starts in about an hour" reminder to
   the admin, sponsor and every consenting invitee ~60 minutes before
   an approved program's start time, and a matching "concludes in
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
   end_reminder_sent set to true right after that reminder goes out,
   so re-running this (or the next scheduled run finding the same
   session still in the time window) never double-sends.
   ────────────────────────────────────────────────────────────── */
const admin = require('firebase-admin');

const SESSIONS_COLLECTION = 'akhand_path';
const SEND_ENDPOINT = 'https://sikhsinindia-email.sikhsinindia.workers.dev';
const APP_SHARED_SECRET = 'LuOoE-d92AyXMGsCBA0FcQGhKsYRLgs6'; // same value as firebase.js - already client-exposed, not a real secret

const ADMIN_EMAIL = 'sikhsinindia@gmail.com';
const ADMIN_WHATSAPP_NUMBER = '+919810607799';

const WHATSAPP_REMINDER_START_TEMPLATE = 'akhand_path_reminder_start';
const WHATSAPP_REMINDER_END_TEMPLATE = 'akhand_path_reminder_end';
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
  const start = session.start_at && session.start_at.toDate ? session.start_at.toDate() : null;
  if (!start) return;
  const durationHours = session.duration_hours || 48;
  const samapti = new Date(start.getTime() + durationHours * 3600 * 1000);
  const eventTime = kind === 'start' ? start : samapti;
  const link = sessionLinkFor(sessionId);

  const emailSubjectStart = `Reminder: Akhand Path begins in about 1 hour — ${session.name || ''}`;
  const emailSubjectEnd = `Reminder: Akhand Path concludes in about 1 hour — ${session.name || ''}`;
  const emailBody = (greeting) => `Dear ${greeting},

Sat Sri Akaal!
Waheguru ji ka Khalsa, Waheguru ji ki Fateh!

This is a reminder that the Akhand Path Sahib Ji dedicated to ${session.name || ''}${session.purpose ? ' on occasion of ' + session.purpose : ''}, sponsored by ${session.sponsor || ''}, ${kind === 'start' ? 'begins' : 'concludes (Samapti)'} in about 1 hour:

${kind === 'start' ? 'Start' : 'Samapti'}: ${formatFullDateTime(eventTime)}

Session Link: ${link}

Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh!
Team – SikhsinIndia.com
Email: ${ADMIN_EMAIL}`;

  const waTemplate = kind === 'start' ? WHATSAPP_REMINDER_START_TEMPLATE : WHATSAPP_REMINDER_END_TEMPLATE;
  const waParams = [session.name || '', session.purpose || '', formatFullDateTime(eventTime), link, 'Sikhs In India'];

  console.log(`Sending ${kind} reminder for session ${sessionId} (${session.name || 'untitled'})`);

  // Admin
  await safe('admin email', () => sendEmail(ADMIN_EMAIL, kind === 'start' ? emailSubjectStart : emailSubjectEnd, emailBody('Admin')));
  await safe('admin WhatsApp', () => sendWhatsApp(ADMIN_WHATSAPP_NUMBER, waTemplate, waParams));

  // Sponsor
  if (session.email) {
    await safe('sponsor email', () => sendEmail(session.email, kind === 'start' ? emailSubjectStart : emailSubjectEnd, emailBody(session.sponsor || 'Sponsor')));
  }
  if (session.mobie) {
    await safe('sponsor WhatsApp', () => sendWhatsApp(session.mobie, waTemplate, waParams));
  }

  // Invitees
  const inviteesSnap = await db.collection(SESSIONS_COLLECTION).doc(sessionId).collection('invitees').get();
  for (const inviteeDoc of inviteesSnap.docs) {
    const inv = inviteeDoc.data();
    if (inv.mail) {
      await safe(`invitee email (${inv.mail})`, () => sendEmail(inv.mail, kind === 'start' ? emailSubjectStart : emailSubjectEnd, emailBody(inv.gname || inv.name || 'Sangat Ji')));
    }
    if (inv.phone && inv.wa_consent) {
      await safe(`invitee WhatsApp (${inv.mail || inviteeDoc.id})`, () => sendWhatsApp(inv.phone, waTemplate, waParams));
    }
  }

  await db.collection(SESSIONS_COLLECTION).doc(sessionId).update({
    [kind === 'start' ? 'start_reminder_sent' : 'end_reminder_sent']: true
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
    const start = session.start_at && session.start_at.toDate ? session.start_at.toDate() : null;
    if (!start) continue;
    const durationHours = session.duration_hours || 48;
    const samapti = new Date(start.getTime() + durationHours * 3600 * 1000);

    if (!session.start_reminder_sent && withinReminderWindow(start, now)) {
      await sendReminderForSession(db, doc, 'start');
    }
    if (!session.end_reminder_sent && withinReminderWindow(samapti, now)) {
      await sendReminderForSession(db, doc, 'end');
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
