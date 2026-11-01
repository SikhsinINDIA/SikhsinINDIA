/* ──────────────────────────────────────────────────────────────
   Daily Calendar-Event WhatsApp Mailer
   Runs every day (.github/workflows/daily-event-whatsapp.yml). For
   every event in the "Calendar" Firestore collection that falls on
   TODAY (India calendar date) and has a WhatsAppTemplateName set,
   sends that exact Meta-approved WhatsApp template to every
   registered member (sikhdatabaseindia) whose Mobile_Correct field
   is true — personalized with GreetingName, else Name, else
   "Sangat Ji" as the template's {{1}} variable.

   WhatsAppTemplateName is pre-resolved and stored directly on each
   Calendar document (one string field, e.g.
   "01a_guru_nanak_dev_ji_gurpurab") rather than derived at send
   time, so this script has nothing to compute — it only reads and
   sends. A Calendar event with no WhatsAppTemplateName field is
   skipped (no approved WhatsApp template exists yet for it).

   Only members with Mobile_Correct === true are sent to — anyone
   whose number hasn't been verified, or is explicitly marked wrong,
   never receives a WhatsApp message from this script.

   No client page can do this - it has to fire on a wall-clock
   schedule whether or not anyone has the site open - so like the
   email event mailer and the Akhand Path reminders job, this runs
   server-side via firebase-admin and reuses the SAME
   FIREBASE_SERVICE_ACCOUNT_JSON secret (no new secret needed).

   Idempotency: once an event's WhatsApp batch goes out, that
   Calendar doc is marked whatsapp_sent = true (+ whatsapp_sent_at),
   so a re-run the same day never double-sends. This is a SEPARATE
   flag from mail_sent (used by the email mailer), so the email and
   WhatsApp sends for the same event track independently and neither
   blocks the other.
   ────────────────────────────────────────────────────────────── */
const admin = require('firebase-admin');

const CALENDAR_COLLECTION = 'Calendar';
const MEMBERS_COLLECTION = 'sikhdatabaseindia';
const TEMPLATES_COLLECTION = 'mass_mailer_templates';

const SEND_ENDPOINT = 'https://sikhsinindia-email.sikhsinindia.workers.dev';
// Server-only secret (GitHub Actions secret APP_SHARED_SECRET, must match
// the Worker's `wrangler secret put APP_SHARED_SECRET`). Never ship it to a browser.
const APP_SHARED_SECRET = process.env.APP_SHARED_SECRET;
if (!APP_SHARED_SECRET) throw new Error('APP_SHARED_SECRET env var is not set (add it as a GitHub Actions secret).');

/* What each template needs isn't stored anywhere we can read: its language
   ("English" = en, "English (US)" = en_US) and whether it has a header to
   fill. Sending everything as en_US with no header failed every message on
   27 Oct 2026 (04a_guru_ram_das_ji_gurpurab: 0 sent, 214 failed), while the
   Akhand Path and Broadcast pages send "en". So the first member(s) are
   used to find a combination Meta accepts, trying these in order. A
   rejected attempt delivers nothing, so nobody gets a duplicate. The
   document is the PDF attached to the event's mail format (TemplateNumber),
   for templates created with a Document header. */
const LANGUAGE_CODES = ['en', 'en_US'];
const DEFAULT_HEADER_IMAGE = 'https://sikhsinindia.com/pictures/whatsapp/sikhsinindia-gurus-poster.jpg';
// Errors about the template itself (wrong language, header or variables),
// as opposed to one member's number - only these move on to the next variant.
// Meta's JSON arrives escaped inside the Worker's own error JSON (\"code\":132001).
const TEMPLATE_ERROR_RE = /code\\*"\s*:\s*(132\d{3}|131008|131009|100)\b/;
const MAX_PROBE_RECIPIENTS = 5;

// Same pacing as the email mailer's own SEND_DELAY_MS - keeps this well
// under WhatsApp Cloud API's per-second rate limit.
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

// Meta requires E.164 (leading "+", country code, no spaces/dashes). The
// Worker's own normalizePhone() does the final strip/prefix cleanup, so this
// just needs to get a plausible country-code + number string to it; +91
// (India) is the sensible default for a Sikhs-in-India member directory
// where many records predate the Country_Code field being added.
function buildWhatsAppNumber(member) {
  const countryCode = (member.Country_Code || '').trim() || '+91';
  const mobile = String(member.Mobile || '').trim();
  if (!mobile) return null;
  return `${countryCode}${mobile}`;
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

async function fetchMobileCorrectRecipients(db) {
  const snap = await db.collection(MEMBERS_COLLECTION).where('Mobile_Correct', '==', true).get();
  const recipients = [];
  snap.forEach((doc) => {
    const d = doc.data();
    const to = buildWhatsAppNumber(d);
    if (!to) return;
    recipients.push({ to, name: d.GreetingName || d.Name || '' });
  });
  return recipients;
}

// Same Drive "view" URL -> raw-download URL conversion as the Mass Mailer
// used to do, so Meta can fetch the PDF itself.
function driveDownloadUrl(url) {
  const match = String(url || '').match(/drive\.google\.com\/file\/d\/([^/]+)/);
  return match ? `https://drive.google.com/uc?export=download&id=${match[1]}` : url;
}

// The first PDF attached to the event's mail format, if it has one.
async function eventDocument(db, event) {
  if (event.TemplateNumber == null) return null;
  const snap = await db.collection(TEMPLATES_COLLECTION).where('template_number', '==', Number(event.TemplateNumber)).limit(1).get();
  const pdf = snap.empty ? null : (snap.docs[0].data().attachments || []).find((a) => a && a.driveUrl && /\.pdf$/i.test(a.filename || ''));
  return pdf ? { link: driveDownloadUrl(pdf.driveUrl), filename: pdf.filename } : null;
}

function variantsFor(document) {
  const headers = [{ label: 'no header' }];
  if (document) headers.push({ label: `document ${document.filename}`, headerDocument: document });
  headers.push({ label: 'image header', headerImageUrl: DEFAULT_HEADER_IMAGE });
  return LANGUAGE_CODES.flatMap((languageCode) => headers.map((h) => ({ ...h, languageCode, label: `${languageCode}, ${h.label}` })));
}

async function sendEventWhatsApp(db, eventDoc, templateName, recipients, document) {
  const send = (recipient, v) => callMailWorker({
    action: 'send_whatsapp',
    to: recipient.to,
    templateName,
    languageCode: v.languageCode,
    headerImageUrl: v.headerImageUrl,
    headerDocument: v.headerDocument,
    // Festival greetings are Marketing templates: sent via Meta's Marketing
    // Messages API (the Worker falls back to the normal route otherwise).
    marketing: true,
    params: [recipient.name || 'Sangat Ji']
  });

  let sent = 0;
  const failed = [];
  let variant = null;
  let lastTemplateError = '';
  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    try {
      if (variant) {
        await send(recipient, variant);
      } else if (i < MAX_PROBE_RECIPIENTS) {
        // Find what this template needs, using this member.
        let lastErr = null;
        for (const v of variantsFor(document)) {
          try { await send(recipient, v); variant = v; lastErr = null; break; } catch (err) {
            lastErr = err;
            console.log(`  ${v.label}: ${String(err.message || err).slice(0, 300)}`);
            if (!TEMPLATE_ERROR_RE.test(String(err.message || err))) break; // this member's number, not the template
            lastTemplateError = String(err.message || err);
          }
        }
        if (lastErr) throw lastErr;
        console.log(`  Template accepted as: ${variant.label}`);
      } else {
        throw new Error(`Template not sent - no language/header combination was accepted. Last error: ${lastTemplateError}`);
      }
      sent++;
    } catch (err) {
      failed.push({ to: recipient.to, error: err.message || String(err) });
    }
    if (i < recipients.length - 1) await sleep(SEND_DELAY_MS);
  }

  console.log(`  Sent ${sent}/${recipients.length}${failed.length ? `, ${failed.length} failed` : ''}.`);
  if (failed.length) {
    failed.slice(0, 20).forEach((f) => console.warn(`    FAILED ${f.to}: ${f.error}`));
    if (failed.length > 20) console.warn(`    ...and ${failed.length - 20} more.`);
  }

  await db.collection(CALENDAR_COLLECTION).doc(eventDoc.id).update({
    whatsapp_sent: true,
    whatsapp_sent_at: admin.firestore.FieldValue.serverTimestamp(),
    whatsapp_sent_count: sent,
    whatsapp_failed_count: failed.length,
    // Shown on the Messaging Dashboard: what worked, or why it didn't.
    whatsapp_variant: variant ? variant.label : null,
    whatsapp_error: failed.length ? String(failed[0].error).slice(0, 500) : null
  });
}

async function main() {
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!credentialJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set - see the comment at the top of ' +
      '.github/workflows/daily-event-whatsapp.yml (same secret already used by the email event mailer).');
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
  // mirrors the email event mailer's own query pattern for this collection.
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
    if (!data.WhatsAppTemplateName) return false;
    if (data.whatsapp_sent) { console.log(`Skipping "${data.Description}" - already sent (whatsapp_sent=true).`); return false; }
    return true;
  });

  if (!dueEvents.length) {
    console.log('No events today have an unsent WhatsAppTemplateName. Done.');
    return;
  }

  let recipients = null; // fetched once, reused across every due event today

  for (const eventDoc of dueEvents) {
    const event = eventDoc.data();
    console.log(`Event "${event.Description}" (WhatsApp template: ${event.WhatsAppTemplateName}):`);

    if (!recipients) {
      recipients = await fetchMobileCorrectRecipients(db);
      console.log(`  Loaded ${recipients.length} member(s) with Mobile_Correct = true.`);
    }
    if (!recipients.length) {
      console.warn('  No Mobile_Correct members to send to - skipping.');
      continue;
    }

    const document = await eventDocument(db, event);
    if (document) console.log(`  PDF available for a Document header: ${document.filename}`);
    await sendEventWhatsApp(db, eventDoc, event.WhatsAppTemplateName, recipients, document);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
