/* ──────────────────────────────────────────────────────────────
   Update the homepage's "today" content
   Writes two things straight into index.html, so they are in the page
   itself rather than appearing only after JavaScript runs (search
   engines and slow phones see them at once):
     - this month's events bar (from the Calendar collection in Firestore,
       the same query the homepage's own script makes), and
     - today's "Today in Sikh History" card (from data/sikh-history.json,
       using the card markup from js/sikh-history.js).
   The homepage's scripts still refresh both after the page loads.

   Runs every morning from .github/workflows/update-hukamnama.yml, right
   after the Hukamnama update. If the events query fails, the events bar
   is left as it was and the history card is still written.
   ────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const FIRESTORE_QUERY_URL = 'https://firestore.googleapis.com/v1/projects/sikhsinindia-67a6b/databases/(default)/documents:runQuery';
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A date's calendar day in India (Asia/Kolkata), whatever the server's timezone.
function indiaParts(date) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)) {
    if (x.type !== 'literal') p[x.type] = parseInt(x.value, 10);
  }
  return { year: p.year, month: p.month - 1, day: p.day };
}

function replaceBetween(html, name, inner) {
  const re = new RegExp(`<!-- ${name}:start -->[\\s\\S]*?<!-- ${name}:end -->`);
  if (!re.test(html)) throw new Error(`index.html: <!-- ${name}:start --> marker not found`);
  return html.replace(re, () => `<!-- ${name}:start -->${inner}<!-- ${name}:end -->`);
}

/* ── Events bar ── same markup and order as loadCurrentMonthFestivals() in index.html */
async function eventsHtml(today) {
  const { year, month } = today;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const start = new Date(`${year}-${pad(month + 1)}-01T00:00:00+05:30`);
  const end = new Date(`${year}-${pad(month + 1)}-${pad(daysInMonth)}T23:59:59+05:30`);
  const res = await fetch(FIRESTORE_QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'Calendar' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'Date' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: start.toISOString() } } },
        { fieldFilter: { field: { fieldPath: 'Date' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: end.toISOString() } } }
      ] } },
      orderBy: [{ field: { fieldPath: 'Date' }, direction: 'ASCENDING' }]
    } })
  });
  if (!res.ok) throw new Error('Firestore query failed: HTTP ' + res.status);
  const events = (await res.json()).filter((r) => r.document).map((r) => {
    const f = r.document.fields || {};
    const date = new Date(f.Date.timestampValue);
    return { parts: indiaParts(date), date, category: (f.Category || {}).stringValue || '', description: (f.Description || {}).stringValue || '' };
  }).sort((a, b) => a.date - b.date);

  const monthName = MONTH_NAMES[month];
  let items = `<span class="marquee-header">${monthName} Events</span>`;
  if (!events.length) {
    items += `<span class="marquee-item">No scheduled festivals found for ${monthName}.</span>`;
  } else {
    // Today's (or the next) event first, then the rest of the month; past ones last.
    const first = events.findIndex((e) => e.parts.day >= today.day);
    const ordered = first > 0 ? events.slice(first).concat(events.slice(0, first)) : events;
    for (const e of ordered) {
      const isToday = e.parts.year === today.year && e.parts.month === today.month && e.parts.day === today.day;
      items += `<span class="marquee-item${isToday ? ' blinking-event' : ''}">` +
        (isToday ? '<span class="badge-today">Event Today</span>' : '') +
        `<span class="item-date">${MONTH_NAMES[e.parts.month]} ${e.parts.day}, ${e.parts.year}</span> &nbsp;-&nbsp; ` +
        `<span class="item-cat">${esc(e.category)}</span> &nbsp;-&nbsp; ${esc(e.description)}</span>`;
    }
  }
  return `<div class="marquee-block">${items}</div><div class="marquee-block">${items}</div>`;
}

/* ── Today in Sikh History card ── */
function historyHtml(today) {
  const { cardHtml, keyOf } = require('../js/sikh-history.js');
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sikh-history.json'), 'utf8'));
  const records = {};
  for (const r of list) records[r.date] = r;
  // A local Date with India's calendar day, which is all the card reads.
  const d = new Date(today.year, today.month, today.day, 12);
  let key = keyOf(d);
  if (!records[key] && key === '02-29') key = '02-28';
  return cardHtml(d, records[key] || null, true);
}

async function main() {
  const today = indiaParts(new Date());
  let html = fs.readFileSync(INDEX, 'utf8');

  html = replaceBetween(html, 'sikh-history', historyHtml(today));
  try {
    html = replaceBetween(html, 'events', await eventsHtml(today));
  } catch (err) {
    console.error('Events bar not updated:', err.message);
  }

  fs.writeFileSync(INDEX, html, 'utf8');
  console.log(`Wrote today's events bar and Sikh History card into index.html (${today.year}-${pad(today.month + 1)}-${pad(today.day)})`);
}

main().catch((err) => {
  console.error('update-homepage-today failed:', err.message);
  process.exit(1);
});
