/* ──────────────────────────────────────────────────────────────
   Build the Sikh History day pages
   Writes one permanent page per day of the year - sikh-history/april-14.html
   and so on - from data/sikh-history.json, plus a plain-link index of all
   365 days inside sikh-history.html (between days:start / days:end).

   The interactive sikh-history.html is driven by JavaScript; these pages
   give every day its own URL, title and description in plain HTML, linked
   to the next and previous day and to the rest of its month, so search
   engines can find and index each one.

   Run after editing data/sikh-history.json:
     node scripts/build-sikh-history-pages.js
   then node scripts/seo-optimize.js (structured data, sitemap)
   and  node scripts/related-links.js (related reading).
   ────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'sikh-history');
const INDEX = path.join(ROOT, 'sikh-history.html');
const SITE = 'https://sikhsinindia.com';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const monthOf = (key) => parseInt(key.slice(0, 2), 10) - 1;
const dayOf = (key) => parseInt(key.slice(3), 10);
// "04-14" -> "april-14" (the same rule as daySlug() in js/sikh-history.js)
const slug = (key) => MONTHS[monthOf(key)].toLowerCase() + '-' + dayOf(key);
const longDate = (key) => dayOf(key) + ' ' + MONTHS[monthOf(key)];

function shift(key, delta) {
  const dt = new Date(2025, monthOf(key), dayOf(key)); // 2025: 365 days, like the data
  dt.setDate(dt.getDate() + delta);
  return String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

function clip(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\-–]+$/, '') + '…';
}

const records = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sikh-history.json'), 'utf8'))
  .sort((a, b) => a.date.localeCompare(b.date));
const byKey = Object.fromEntries(records.map((r) => [r.date, r]));

// ── Background for each day (data/sikh-history-context.json) ──
// Eras give the historical setting of an event by its year; entities are the
// people, places, institutions and movements the events mention.
const CONTEXT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'sikh-history-context.json'), 'utf8'));
const ENTITIES = CONTEXT.entities.map((e) => Object.assign({}, e, { re: new RegExp(e.match.join('|'), 'i') }));
const yearOf = (s) => { const m = /\d{4}/.exec(s || ''); return m ? parseInt(m[0], 10) : null; };
const eraOf = (y) => (y == null ? null : CONTEXT.eras.find((e) => y >= e.from && y <= e.to));
const SOURCE_NOTE = {
  allaboutsikhs: 'Event list: the Sikh calendar of historical dates published by AllAboutSikhs.com (Gateway to Sikhism).',
  nanakshahi: 'Gurpurab date: the Nanakshahi calendar as observed by the Sikh Panth.',
  verified: 'Event checked against standard histories of the period (see further reading).'
};

// Every event of a day: the main one first, then "Also on this day".
function eventsOf(r) {
  return [{ year: r.year, title: r.title, detail: r.detail, main: true }]
    .concat((r.more || []).map((m) => ({ year: m.year, title: m.title, detail: m.detail || '' })));
}
// The entities an event mentions (respecting each entity's year range).
function entitiesOf(ev) {
  const y = yearOf(ev.year);
  const text = ev.title + ' ' + (ev.detail || '');
  return ENTITIES.filter((n) => !(n.years && y != null && (y < n.years[0] || y > n.years[1])) && n.re.test(text));
}
// The main image of a page on this site (its og:image), for entity cards.
const ogCache = {};
function siteImage(link) {
  if (!link) return null;
  if (link in ogCache) return ogCache[link];
  let img = null;
  try {
    const html = fs.readFileSync(path.join(ROOT, decodeURI(link)), 'utf8');
    const m = html.match(/<meta property="og:image" content="https:\/\/sikhsinindia\.com(\/[^"]+)"/);
    const alt = (html.match(/<title>([^<|]+)/) || [])[1];
    if (m && !/\/sikhsinindia\.(jpg|png)$/.test(m[1])) img = { src: m[1], alt: (alt || '').trim() };
  } catch (e) { /* page missing: no image */ }
  return (ogCache[link] = img);
}
// Which days mention each entity (for "related days").
const daysByEntity = {};
const entitiesByDay = {};
records.forEach((r) => {
  const ids = new Set();
  eventsOf(r).forEach((ev) => entitiesOf(ev).forEach((n) => ids.add(n.id)));
  entitiesByDay[r.date] = ids;
  ids.forEach((id) => (daysByEntity[id] = daysByEntity[id] || []).push(r.date));
});
const listJoin = (a) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const num = (n) => WORDS[n] || String(n);
const inText = (name) => name.replace(/^The /, 'the ');
const sentence = (s) => { s = String(s || '').trim().replace(/\s+/g, ' '); return s && !/[.!?]$/.test(s) ? s + '.' : s; };

function background(r) {
  const key = r.date;
  const evs = eventsOf(r).map((ev) => Object.assign(ev, { y: yearOf(ev.year), ents: entitiesOf(ev) }));
  // Entities in order of first mention, main event first; at most eight cards.
  const seen = new Map();
  evs.forEach((ev) => ev.ents.forEach((n) => { if (!seen.has(n.id)) seen.set(n.id, n); }));
  const ents = [...seen.values()];
  const cards = ents.slice(0, 8);

  // Introduction.
  const years = evs.map((e) => e.y).filter((y) => y != null);
  const span = years.length > 1 ? `from ${Math.min(...years)} to ${Math.max(...years)}` : '';
  const eras = [];
  evs.slice().sort((a, b) => (a.y || 0) - (b.y || 0)).forEach((ev) => {
    const era = eraOf(ev.y);
    if (!era) return;
    let g = eras.find((x) => x.era === era);
    if (!g) eras.push(g = { era, evs: [] });
    g.evs.push(ev);
  });
  let intro = '';
  if (r.anchored) {
    intro = `${esc(longDate(key))}${r.nanakshahi ? ' (' + esc(r.nanakshahi) + ' in the Nanakshahi calendar)' : ''} ` +
      (evs.length > 1
        ? `brings together ${num(evs.length)} moments of Sikh history${span ? ', ' + span : ''}. The main event of the day is from ${esc(r.year || 'Sikh tradition')}: ${esc(sentence(r.title))} `
        : `is remembered for an event of ${esc(r.year || 'Sikh tradition')}: ${esc(sentence(r.title))} `);
    if (eras.length === 1) intro += `It belongs to the period of ${esc(eras[0].era.name)}. `;
    else if (eras.length > 1) intro += `Together they span ${num(eras.length)} periods, from ${esc(eras[0].era.name)} to ${esc(eras[eras.length - 1].era.name)}. `;
    if (ents.length) intro += `People, places and movements connected with this day include ${listJoin(ents.slice(0, 4).map((n) => esc(inText(n.name))))}.`;
  } else {
    intro = `No single event is recorded for ${esc(longDate(key))} in our calendar, so the day is offered for reflection on the theme below.`;
  }

  // Photograph: a public-domain historical image if an entity has one,
  // otherwise the main picture of the first linked page on this site.
  // (The first person or place of the day that has a picture.)
  let photo = null;
  for (const n of ents) {
    if (n.image) { photo = Object.assign({ link: n.link }, n.image); break; }
    const img = siteImage(n.link);
    if (img) { photo = { src: '..' + img.src, alt: img.alt || n.name, caption: n.name + '.', credit: 'SikhsInIndia.com', link: n.link }; break; }
  }
  const figure = photo
    ? `<figure class="sh-photo">
        <img src="${esc(photo.src)}" alt="${esc(photo.alt)}" loading="lazy">
        <figcaption>${esc(photo.caption)} <span class="sh-credit">${photo.page ? `<a href="${esc(photo.page)}" rel="noopener" target="_blank">${esc(photo.credit)}</a>` : esc(photo.credit)}</span></figcaption>
      </figure>`
    : '';

  // Historical background, one block per period, oldest first.
  const bg = eras.length
    ? `<section class="sh-section" aria-labelledby="bg-h">
        <h2 id="bg-h" class="sh-section-head">Historical background</h2>
${eras.map((g) => `        <h3>${esc(g.era.name)}</h3>
        <p>${esc(g.era.text)}</p>
        <p class="sh-era-events">On this day in this period: ${g.evs.map((ev) => `<b>${esc(ev.year)}</b> ${esc(clip(ev.title, 90))}`).join('; ')}.</p>`).join('\n')}
      </section>`
    : '';

  // People and places.
  const people = cards.length
    ? `<section class="sh-section" aria-labelledby="pp-h">
        <h2 id="pp-h" class="sh-section-head">People and places of this day</h2>
        <div class="sh-cards">
${cards.map((n) => {
    const img = n.image ? { src: n.image.src, alt: n.image.alt } : siteImage(n.link) && { src: '..' + siteImage(n.link).src, alt: n.name };
    const others = (daysByEntity[n.id] || []).filter((k) => k !== key).length;
    return `          <div class="sh-card">
            ${img ? `<img src="${esc(img.src)}" alt="${esc(img.alt || n.name)}" loading="lazy">` : ''}
            <div class="sh-card-body">
              <h3>${n.link ? `<a href="${esc(n.link)}">${esc(n.name)}</a>` : esc(n.name)}</h3>
              <p>${esc(n.summary)}</p>
              <p class="sh-card-links">${n.link ? `<a href="${esc(n.link)}">Read more &rarr;</a>` : ''}${others ? `${n.link ? ' &middot; ' : ''}Mentioned on ${others} other day${others > 1 ? 's' : ''} of the year` : ''}</p>
            </div>
          </div>`;
  }).join('\n')}
        </div>
      </section>`
    : '';

  // Related days: other days sharing the most entities with this one.
  const mine = entitiesByDay[key];
  const related = records.filter((x) => x.date !== key)
    .map((x) => ({ x, n: [...entitiesByDay[x.date]].filter((id) => mine.has(id)).length }))
    .filter((o) => o.n > 0)
    .sort((a, b) => b.n - a.n || a.x.date.localeCompare(b.x.date))
    .slice(0, 6);
  const rel = related.length
    ? `<section class="sh-section" aria-labelledby="rel-h">
        <h2 id="rel-h" class="sh-section-head">Related days in Sikh history</h2>
        <ul class="sh-related">
${related.map((o) => `          <li><a href="${slug(o.x.date)}.html"><span class="sh-d">${esc(longDate(o.x.date))}</span>${esc(clip(o.x.title, 80))}${o.x.year ? ` <span class="sh-rel-year">(${esc(o.x.year)})</span>` : ''}</a></li>`).join('\n')}
        </ul>
      </section>`
    : '';

  // Sources and further reading.
  const refs = [];
  if (SOURCE_NOTE[r.source]) refs.push(SOURCE_NOTE[r.source]);
  const eraKeys = Object.keys(CONTEXT.reading.eras).map(Number).sort((a, b) => a - b);
  eras.forEach((g) => {
    const k = eraKeys.filter((k2) => k2 <= g.era.from).pop();
    const ref = k != null && CONTEXT.reading.eras[k];
    if (ref && !refs.includes(ref)) refs.push(ref);
  });
  CONTEXT.reading.general.forEach((g) => refs.push(g));
  if (photo && photo.page) refs.push(`Photograph: ${esc(photo.credit)}.`);
  const sources = `<section class="sh-section sh-sources" aria-labelledby="src-h">
        <h2 id="src-h" class="sh-section-head">Sources and further reading</h2>
        <ul>
${refs.slice(0, 8).map((x) => `          <li>${x}</li>`).join('\n')}
        </ul>
        <p class="sh-src-note">Background sections are written by SikhsInIndia.com from the works listed. Dates in Sikh history sometimes differ between sources and between the Nanakshahi and older Bikrami calendars. To suggest a correction, write to <a href="mailto:sikhsinindia@gmail.com">sikhsinindia@gmail.com</a>.</p>
      </section>`;

  return { intro, figure, bg, people, rel, sources };
}

// Reuse the interactive page's stylesheet so the day pages look the same.
const indexHtml = fs.readFileSync(INDEX, 'utf8');
// (Without the index-only rules this script appends to that page.)
const css = ((indexHtml.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '')
  .replace(/\s*\/\* ── plain-link index of all days ── \*\/[\s\S]*$/, '\n');
if (!css) throw new Error('sikh-history.html: <style> block not found');

const EXTRA_CSS = `
    /* ── day pages ── */
    .sh-detail { display: block; margin-top: 18px; }
    a.sh-btn { text-decoration: none; display: inline-flex; align-items: center; }
    .sh-crumbs { font-size: 13px; margin: 14px 0 0; color: #555; }
    .sh-crumbs a { color: var(--navy); }
    .sh-month { margin: 26px 0 10px; }
    .sh-month-link { margin: 22px 0 8px; font-weight: 600; }
    .sh-month-link a { color: var(--navy); }
    .sh-month h2 { font-size: 18px; color: var(--navy); margin-bottom: 8px; }
    .sh-days { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 2px 16px; }
    .sh-days a { display: block; padding: 7px 0; color: var(--navy); text-decoration: none;
                 border-bottom: 1px solid rgba(0,43,109,.10); font-size: 14px; }
    .sh-days a:hover { color: #c46a00; }
    .sh-days a[aria-current] { font-weight: 700; color: #c46a00; }
    .sh-days .sh-d { display: inline-block; min-width: 52px; font-weight: 700; }
    .sh-intro { font-size: 16px; line-height: 1.7; margin: 14px 0 6px; color: #2b2b2b; }
    .sh-photo { margin: 18px 0; }
    .sh-photo img { width: 100%; max-height: 460px; object-fit: cover; border-radius: 10px; display: block; background: #eee; }
    .sh-photo figcaption { font-size: 13px; color: #555; margin-top: 6px; line-height: 1.5; }
    .sh-credit { display: block; font-size: 12px; color: #777; }
    .sh-credit a { color: #777; }
    .sh-section { margin-top: 26px; }
    .sh-section-head { font-size: 19px; color: var(--navy); margin: 0 0 8px; padding-bottom: 6px; border-bottom: 2px solid rgba(247,148,29,.45); }
    .sh-section h3 { font-size: 16px; color: var(--navy); margin: 14px 0 4px; }
    .sh-section p { line-height: 1.7; margin: 0 0 8px; }
    .sh-era-events { font-size: 14px; color: #444; background: rgba(0,43,109,.04); padding: 8px 10px; border-radius: 6px; }
    .sh-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
    .sh-card { display: flex; gap: 10px; background: #fff; border: 1px solid rgba(0,43,109,.12); border-radius: 10px; padding: 10px; }
    .sh-card img { width: 72px; height: 72px; object-fit: cover; border-radius: 8px; flex: 0 0 72px; }
    .sh-card h3 { margin: 0 0 4px; font-size: 15px; }
    .sh-card h3 a { color: var(--navy); text-decoration: none; }
    .sh-card p { font-size: 13.5px; line-height: 1.55; margin: 0 0 4px; }
    .sh-card-links { font-size: 12.5px !important; color: #666; }
    .sh-card-links a { color: #c46a00; }
    .sh-related { list-style: none; padding: 0; margin: 0; }
    .sh-related a { display: block; padding: 7px 0; color: var(--navy); text-decoration: none; border-bottom: 1px solid rgba(0,43,109,.10); font-size: 14px; }
    .sh-related .sh-d { display: inline-block; min-width: 110px; font-weight: 700; }
    .sh-rel-year { color: #777; }
    .sh-sources ul { padding-left: 18px; margin: 0 0 8px; }
    .sh-sources li { font-size: 13.5px; line-height: 1.6; margin-bottom: 3px; }
    .sh-src-note { font-size: 12.5px; color: #666; }
`;

function dayPage(r) {
  const key = r.date;
  const m = monthOf(key);
  const prev = shift(key, -1);
  const next = shift(key, 1);
  const title = `${longDate(key)} in Sikh History: ${r.title}`;
  // Keep titles within ~70 characters: drop the site name before cutting
  // the event's own title.
  const short = `${longDate(key)}: ${r.title}`;
  const docTitle = (title + ' | Sikhs in India').length <= 70 ? title + ' | Sikhs in India'
    : title.length <= 70 ? title
    : (short + ' | Sikh History').length <= 70 ? short + ' | Sikh History'
    : clip(short, 58) + ' | Sikh History';
  const desc = clip(`${longDate(key)}${r.nanakshahi ? ' (' + r.nanakshahi + ' Nanakshahi)' : ''}: ` +
    (r.detail || r.description || r.title), 158);
  const url = `${SITE}/sikh-history/${slug(key)}.html`;
  const lead = r.anchored
    ? (r.year ? 'On this day in ' + esc(r.year) : 'Marked on this day')
    : 'A theme for reflection';
  const more = (r.more && r.more.length)
    ? '<div class="sh-more"><h2 class="sh-more-head">Also on this day</h2><ul class="sh-more-list">' +
      r.more.map((x) => '<li><span class="sh-more-year">' + esc(x.year) + '</span><span class="sh-more-body">' +
        esc(x.title) + (x.detail ? ' <span class="sh-more-detail">' + esc(x.detail) + '</span>' : '') +
        (x.note ? '<span class="sh-more-note">' + esc(x.note) + '</span>' : '') + '</span></li>').join('') +
      '</ul></div>'
    : '';
  const B = background(r);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Generated by scripts/build-sikh-history-pages.js from data/sikh-history.json. Edit the data, not this file. -->
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-LHNTFNW14H"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', 'G-LHNTFNW14H');
  </script>

  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>${esc(docTitle)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="en" href="${url}">
  <link rel="alternate" hreflang="x-default" href="${url}">
  <meta name="robots" content="index, follow">

  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${SITE}/sikhsinindia.jpg">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="article">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${SITE}/sikhsinindia.jpg">

  <style>${css}${EXTRA_CSS}  </style>
</head>
<body>

<header class="sh-header">
  <div class="wrap sh-header-inner">
    <img class="sh-logo" src="../pictures/00-index/sikhsinindia.png" alt="Sikhs In India Logo">
    <div class="sh-titles">
      <h1>${esc(longDate(key))} &mdash; <span>Sikh History</span></h1>
      <p>${r.nanakshahi ? esc(r.nanakshahi) + ' Nanakshahi' : 'Every day of the year, with its Nanakshahi date'}</p>
    </div>
  </div>
</header>

<main class="wrap">
  <p class="sh-crumbs"><a href="/">Home</a> &rsaquo; <a href="../sikh-history.html">Sikh History: 365 Days</a> &rsaquo; ${esc(longDate(key))}</p>

  <article class="sh-detail">
    <div class="sh-detail-head">
      <div>
        <div class="sh-detail-date">${esc(longDate(key))}</div>
        ${r.nanakshahi ? `<div class="sh-detail-nk">${esc(r.nanakshahi)} Nanakshahi</div>` : ''}
      </div>
    </div>
    <div class="sh-detail-body">
      <div class="sh-lead">${lead}</div>
      <h2 class="sh-detail-title">${esc(r.title)}</h2>
      ${r.detail ? `<p class="sh-detail-text">${esc(r.detail)}</p>` : ''}
      ${r.anchored ? '' : '<p class="sh-caveat">This day has no single recorded event in our records; the theme above is offered for reflection.</p>'}
      <p class="sh-intro">${B.intro}</p>
      ${B.figure}
      ${more}
      ${B.bg}
      ${B.people}
      ${B.rel}
      ${B.sources}
    </div>
    <nav class="sh-detail-nav" aria-label="Other days">
      <a class="sh-btn" href="${slug(prev)}.html" rel="prev">&larr; ${esc(longDate(prev))}: ${esc(clip(byKey[prev].title, 40))}</a>
      <a class="sh-btn" href="../sikh-history.html">All 365 days</a>
      <a class="sh-btn" href="${slug(next)}.html" rel="next">${esc(longDate(next))}: ${esc(clip(byKey[next].title, 40))} &rarr;</a>
    </nav>
  </article>

  <p class="sh-month-link"><a href="../sikh-history.html#${MONTHS[m].toLowerCase()}">See every ${MONTHS[m]} date in Sikh history &rarr;</a></p>
</main>

<footer class="sh-footer">
  <div class="wrap sh-footer-inner">
    <a class="sh-back" href="../sikh-history.html">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M5 12l7-7M5 12l7 7"/>
      </svg>
      All 365 days
    </a>
    <div class="sh-note">&copy; Sikhs in India &middot; sikhsinindia.com</div>
  </div>
</footer>

</body>
</html>
`;
}

// Plain-link index of every day, inside the interactive page.
function indexBlock() {
  return '<!-- days:start -->\n' +
    '  <nav class="sh-index" aria-labelledby="sh-index-h">\n' +
    '    <h2 id="sh-index-h" class="sh-index-head">All 365 days</h2>\n' +
    MONTHS.map((name, m) =>
      `    <section class="sh-month" id="${name.toLowerCase()}">\n      <h3>${name}</h3>\n      <ul class="sh-days">\n` +
      records.filter((r) => monthOf(r.date) === m).map((r) =>
        `        <li><a href="sikh-history/${slug(r.date)}.html"><span class="sh-d">${SHORT[m]} ${dayOf(r.date)}</span>${esc(r.title)}</a></li>`
      ).join('\n') +
      '\n      </ul>\n    </section>').join('\n') +
    '\n  </nav>\n  <!-- days:end -->';
}

fs.mkdirSync(OUT_DIR, { recursive: true });
let written = 0;
for (const r of records) {
  const file = path.join(OUT_DIR, slug(r.date) + '.html');
  const html = dayPage(r);
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  // Keep what seo-optimize.js and related-links.js add (JSON-LD, favicons,
  // social tags, related reading) when nothing else changed.
  const bare = (s) => s.replace(/\s*<!-- seo:[a-z]+ -->[\s\S]*?<!-- \/seo:[a-z]+ -->/g, '')
    .replace(/[ \t]*<meta (?:property|name)="(?:og|twitter):[^"]+"[^>]*>\r?\n/g, '').replace(/\r\n/g, '\n');
  if (bare(old) !== bare(html)) {
    fs.writeFileSync(file, html);
    written++;
  }
}

// Match the page's own line endings, so re-running changes nothing.
const block = indexBlock().replace(/\n/g, indexHtml.includes('\r\n') ? '\r\n' : '\n');
let next = /<!-- days:start -->[\s\S]*?<!-- days:end -->/.test(indexHtml)
  ? indexHtml.replace(/<!-- days:start -->[\s\S]*?<!-- days:end -->/, () => block)
  : indexHtml.replace(/(\r?\n)<\/main>/, (m, nl) => nl + '  ' + block + nl + '</main>');
if (next === indexHtml && !indexHtml.includes('<!-- days:start -->')) throw new Error('sikh-history.html: </main> not found');
if (!/\.sh-index-head/.test(next)) {
  next = next.replace('  </style>', `    /* ── plain-link index of all days ── */
    .sh-index { margin: 34px 0 10px; }
    .sh-index-head { font-size: 20px; color: var(--navy); margin-bottom: 4px; }
    .sh-index .sh-month h3 { font-size: 16px; color: var(--navy); margin: 18px 0 6px; }${EXTRA_CSS.replace(/^\s*\/\* ── day pages ── \*\/\n[\s\S]*?(\.sh-month \{)/, '    $1')}
  </style>`);
}
if (next !== indexHtml) fs.writeFileSync(INDEX, next);

console.log(`Sikh History: ${records.length} day pages (${written} written) and the index in sikh-history.html`);
