/* ──────────────────────────────────────────────────────────────
   Daily Calendar-Event Mailer
   Runs every day at 8:00 AM India time (.github/workflows/daily-
   event-mailer.yml). For every event in the "Calendar" Firestore
   collection that falls on TODAY (India calendar date) and has a
   TemplateNumber set, looks up the matching saved format in
   mass_mailer_templates (by its own template_number field, set from
   the Mass Mailer admin page at 100-misc/01-mass-mailers), and emails
   every registered member (sikhdatabaseindia) that exact format —
   personalized the same way the Mass Mailer's own manual send is:
   GreetingName, else Name, else "Sangat Ji".

   No client page can do this - it has to fire on a wall-clock
   schedule whether or not anyone has the site open - so like the
   Akhand Path reminders job, this runs server-side via firebase-admin
   and reuses the SAME FIREBASE_SERVICE_ACCOUNT_JSON secret (no new
   secret needed).

   Idempotency: once an event's mail goes out, that Calendar doc is
   marked mail_sent = true (+ mail_sent_at), so a re-run the same day
   (accidental workflow_dispatch, a delayed/duplicate cron tick) never
   double-mails everyone. A future year's occurrence of the "same"
   festival is a separate Calendar doc (this site's Calendar admin
   page has always worked that way - one dated doc per occurrence),
   so this flag never needs to be reset.

   Resend's free tier caps at 100 emails/day - sending to the full
   member list (currently 64) on an event day uses most of that
   budget for the day. If you're on the free tier and expect this to
   collide with manual Mass Mailer sends or Akhand Path notifications
   on the same day, that's a Resend plan limit, not something this
   script can work around.
   ────────────────────────────────────────────────────────────── */
const admin = require('firebase-admin');

const CALENDAR_COLLECTION = 'Calendar';
const TEMPLATES_COLLECTION = 'mass_mailer_templates';
const MEMBERS_COLLECTION = 'sikhdatabaseindia';

const SEND_ENDPOINT = 'https://sikhsinindia-email.sikhsinindia.workers.dev';
const APP_SHARED_SECRET = 'LuOoE-d92AyXMGsCBA0FcQGhKsYRLgs6'; // same value as the client pages - already exposed there, not a real secret

// Same pacing as the Mass Mailer's own manual send (01-mass-mailer.html's
// SEND_DELAY_MS) - keeps this well under Resend's per-second rate limit.
const SEND_DELAY_MS = 350;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Same {{name}}/{{email}} convention as the Mass Mailer's own personalize().
function personalize(str, recipient) {
  const name = recipient.name || 'Sangat Ji';
  return String(str || '')
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*email\s*\}\}/gi, recipient.email);
}

function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Same Drive "view" URL -> raw-download URL conversion as driveDownloadUrl()
// in 01-mass-mailer.html, so a template's saved attachments resolve the
// same way here as they do for a manual send.
function driveDownloadUrl(url) {
  if (!url) return url;
  const match = String(url).match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (!match) return url;
  return `https://drive.google.com/uc?export=download&id=${match[1]}`;
}

function buildAttachmentPayload(template) {
  const attachments = Array.isArray(template.attachments) ? template.attachments : [];
  return attachments.map((a) => ({ filename: a.filename, url: driveDownloadUrl(a.driveUrl) }));
}

async function callMailWorker(payload) {
  const res = await fetch(SEND_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': APP_SHARED_SECRET },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
}

async function fetchRecipients(db) {
  const snap = await db.collection(MEMBERS_COLLECTION).get();
  const recipients = [];
  snap.forEach((doc) => {
    const d = doc.data();
    const email = String(d.Email || doc.id || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    // GreetingName, else Name, else "Sangat Ji" (personalize() applies the
    // "Sangat Ji" fallback when name comes through empty).
    recipients.push({ email, name: d.GreetingName || d.Name || '' });
  });
  return recipients;
}

async function sendEventMailer(db, eventDoc, template, recipients) {
  const subject = template.subject || '';
  const bodyHtml = template.bodyHtml || '';
  const attachmentPayload = buildAttachmentPayload(template);

  let sent = 0;
  const failed = [];
  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    try {
      await callMailWorker({
        to: recipient.email,
        subject: personalize(subject, recipient),
        html: personalize(bodyHtml, recipient),
        text: personalize(htmlToPlainText(bodyHtml), recipient),
        attachments: attachmentPayload
      });
      sent++;
    } catch (err) {
      failed.push({ email: recipient.email, error: err.message || String(err) });
    }
    if (i < recipients.length - 1) await sleep(SEND_DELAY_MS);
  }

  console.log(`  Sent ${sent}/${recipients.length}${failed.length ? `, ${failed.length} failed` : ''}.`);
  if (failed.length) {
    failed.slice(0, 20).forEach((f) => console.warn(`    FAILED ${f.email}: ${f.error}`));
    if (failed.length > 20) console.warn(`    ...and ${failed.length - 20} more.`);
  }

  await db.collection(CALENDAR_COLLECTION).doc(eventDoc.id).update({
    mail_sent: true,
    mail_sent_at: admin.firestore.FieldValue.serverTimestamp(),
    mail_sent_count: sent,
    mail_failed_count: failed.length
  });
}

async function main() {
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!credentialJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set - see the comment at the top of ' +
      '.github/workflows/daily-event-mailer.yml (same secret already used by the Akhand Path reminders job).');
  }
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(credentialJson)) });
  }
  const db = admin.firestore();

  const now = new Date();
  const today = getIndiaDateParts(now);
  console.log(`Checking Calendar events for ${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')} (India date)`);

  // Month-wide window in one query (cheaper than scanning the whole
  // collection), narrowed to exactly today by isSameIndiaDate() below -
  // mirrors the homepage marquee's own query pattern for this collection.
  const startOfMonth = new Date(Date.UTC(today.year, today.month - 1, 1) - 5.5 * 3600 * 1000);
  const endOfMonth = new Date(Date.UTC(today.year, today.month, 1) - 5.5 * 3600 * 1000);
  const snap = await db.collection(CALENDAR_COLLECTION)
    .where('Date', '>=', admin.firestore.Timestamp.fromDate(startOfMonth))
    .where('Date', '<', admin.firestore.Timestamp.fromDate(endOfMonth))
    .get();

  const todaysEvents = snap.docs.filter((doc) => {
    const data = doc.data();
    const eventDate = data.Date && data.Date.toDate ? data.Date.toDate() : null;
    return eventDate && isSameIndiaDate(eventDate, today);
  });

  console.log(`Found ${todaysEvents.length} event(s) today, ${snap.size} in the month.`);

  const dueEvents = todaysEvents.filter((doc) => {
    const data = doc.data();
    if (data.TemplateNumber == null) return false;
    if (data.mail_sent) { console.log(`Skipping "${data.Description}" - already sent (mail_sent=true).`); return false; }
    return true;
  });

  if (!dueEvents.length) {
    console.log('No events today have an unset TemplateNumber match to send. Done.');
    return;
  }

  let recipients = null; // fetched once, reused across every due event today

  for (const eventDoc of dueEvents) {
    const event = eventDoc.data();
    console.log(`Event "${event.Description}" (Template #${event.TemplateNumber}):`);

    const tplSnap = await db.collection(TEMPLATES_COLLECTION).where('template_number', '==', event.TemplateNumber).limit(1).get();
    if (tplSnap.empty) {
      console.warn(`  No saved format has Template Number ${event.TemplateNumber} - skipping. Set it in the Mass Mailer admin page.`);
      continue;
    }
    const template = tplSnap.docs[0].data();

    if (!recipients) {
      recipients = await fetchRecipients(db);
      console.log(`  Loaded ${recipients.length} registered member(s).`);
    }
    if (!recipients.length) {
      console.warn('  No registered members to send to - skipping.');
      continue;
    }

    await sendEventMailer(db, eventDoc, template, recipients);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
