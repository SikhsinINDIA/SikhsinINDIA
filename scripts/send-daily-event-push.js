/* ──────────────────────────────────────────────────────────────
   Daily Calendar-Event Push Notifications
   Runs every day (.github/workflows/daily-event-push.yml). For every
   event in the "Calendar" Firestore collection that falls on TODAY
   (India calendar date), sends a free push notification (Firebase Cloud
   Messaging) to every browser that tapped "Get notified" on the site
   (js/push.js saves them in push_subscribers). Tapping the notification
   opens today's page in Sikh History.

   Unlike the email and WhatsApp jobs, every event today is sent - no
   template is needed. Idempotency: once an event's notification goes
   out, its Calendar doc is marked push_sent = true (+ push_sent_at), a
   separate flag from mail_sent and whatsapp_sent.

   Manual message: run the workflow by hand with a message, and that
   message goes to every subscriber instead (env PUSH_MESSAGE, optional
   PUSH_TITLE and PUSH_LINK). Nothing is marked as sent.

   Browsers that have unsubscribed or been reset are removed from
   push_subscribers as Firebase reports them.

   Push costs nothing (no per-message charge), and uses the SAME
   FIREBASE_SERVICE_ACCOUNT_JSON secret as the other jobs.
   ────────────────────────────────────────────────────────────── */
const admin = require('firebase-admin');

const CALENDAR_COLLECTION = 'Calendar';
const SUBSCRIBERS_COLLECTION = 'push_subscribers';
const SITE = 'https://sikhsinindia.com';
const ICON = `${SITE}/android-chrome-192x192.png`;
const BATCH = 500; // sendEachForMulticast's limit
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];
// Tokens Firebase will never deliver to again.
const GONE = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

function getIndiaDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const map = {};
  parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value; });
  return { year: parseInt(map.year, 10), month: parseInt(map.month, 10), day: parseInt(map.day, 10) };
}

function isSameIndiaDate(date, target) {
  const d = getIndiaDateParts(date);
  return d.year === target.year && d.month === target.month && d.day === target.day;
}

async function fetchTokens(db) {
  const snap = await db.collection(SUBSCRIBERS_COLLECTION).get();
  return snap.docs.map((d) => d.id).filter(Boolean);
}

// Sends one notification to every token; returns { sent, failed, removed }.
async function sendToAll(db, tokens, { title, body, link }) {
  let sent = 0, failed = 0, removed = 0;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      webpush: {
        notification: { icon: ICON, badge: ICON },
        fcmOptions: { link }
      }
    });
    sent += res.successCount;
    for (const [j, r] of res.responses.entries()) {
      if (r.success) continue;
      failed++;
      const code = r.error && r.error.code;
      if (GONE.has(code)) {
        await db.collection(SUBSCRIBERS_COLLECTION).doc(batch[j]).delete().catch(() => {});
        removed++;
      } else if (failed <= 10) {
        console.warn(`    FAILED ${batch[j].slice(0, 12)}…: ${code || ''} ${r.error && r.error.message}`);
      }
    }
  }
  return { sent, failed, removed };
}

async function main() {
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!credentialJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set - see the comment at the top of ' +
      '.github/workflows/daily-event-push.yml (same secret already used by the other daily jobs).');
  }
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(credentialJson)) });
  }
  const db = admin.firestore();

  const now = new Date();
  const today = getIndiaDateParts(now);
  const todayLink = `${SITE}/sikh-history/${MONTHS[today.month - 1]}-${today.day}.html`;

  const tokens = await fetchTokens(db);
  console.log(`${tokens.length} browser(s) subscribed to notifications.`);

  const manual = (process.env.PUSH_MESSAGE || '').trim();
  if (manual) {
    const msg = {
      title: (process.env.PUSH_TITLE || '').trim() || 'SikhsInIndia',
      body: manual,
      link: (process.env.PUSH_LINK || '').trim() || SITE + '/'
    };
    console.log(`Manual message "${msg.title}: ${msg.body}" -> ${msg.link}`);
    const r = await sendToAll(db, tokens, msg);
    console.log(`  Sent ${r.sent}/${tokens.length}${r.failed ? `, ${r.failed} failed (${r.removed} unsubscribed browsers removed)` : ''}.`);
    return;
  }

  console.log(`Checking Calendar events for ${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')} (India date)`);

  // Same month-wide query as send-daily-event-mailer.js, narrowed to today.
  const startOfMonth = new Date(Date.UTC(today.year, today.month - 1, 1) - 5.5 * 3600 * 1000);
  const endOfMonth = new Date(Date.UTC(today.year, today.month, 1) - 5.5 * 3600 * 1000);
  const snap = await db.collection(CALENDAR_COLLECTION)
    .where('Date', '>=', admin.firestore.Timestamp.fromDate(startOfMonth))
    .where('Date', '<', admin.firestore.Timestamp.fromDate(endOfMonth))
    .get();

  const dueEvents = snap.docs.filter((doc) => {
    const data = doc.data();
    const eventDate = data.Date && data.Date.toDate ? data.Date.toDate() : null;
    if (!eventDate || !isSameIndiaDate(eventDate, today) || !data.Description) return false;
    if (data.push_sent) { console.log(`Skipping "${data.Description}" - already sent (push_sent=true).`); return false; }
    return true;
  });
  console.log(`Found ${dueEvents.length} event(s) to notify today.`);
  if (!dueEvents.length || !tokens.length) { console.log('Nothing to send. Done.'); return; }

  for (const eventDoc of dueEvents) {
    const event = eventDoc.data();
    const msg = {
      title: String(event.Description).trim(),
      body: `${event.Category ? event.Category + ' - ' : ''}today. Tap to read about this day in Sikh History.`,
      link: todayLink
    };
    console.log(`Event "${msg.title}":`);
    const r = await sendToAll(db, tokens, msg);
    console.log(`  Sent ${r.sent}/${tokens.length}${r.failed ? `, ${r.failed} failed (${r.removed} unsubscribed browsers removed)` : ''}.`);
    await db.collection(CALENDAR_COLLECTION).doc(eventDoc.id).update({
      push_sent: true,
      push_sent_at: admin.firestore.FieldValue.serverTimestamp(),
      push_sent_count: r.sent
    });
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
