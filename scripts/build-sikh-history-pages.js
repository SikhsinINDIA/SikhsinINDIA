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
    .sh-month h2 { font-size: 18px; color: var(--navy); margin-bottom: 8px; }
    .sh-days { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 2px 16px; }
    .sh-days a { display: block; padding: 7px 0; color: var(--navy); text-decoration: none;
                 border-bottom: 1px solid rgba(0,43,109,.10); font-size: 14px; }
    .sh-days a:hover { color: #c46a00; }
    .sh-days a[aria-current] { font-weight: 700; color: #c46a00; }
    .sh-days .sh-d { display: inline-block; min-width: 52px; font-weight: 700; }
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
  const monthDays = records.filter((x) => monthOf(x.date) === m).map((x) =>
    `      <li><a href="${slug(x.date)}.html"${x.date === key ? ' aria-current="page"' : ''}>` +
    `<span class="sh-d">${SHORT[m]} ${dayOf(x.date)}</span>${esc(x.title)}</a></li>`).join('\n');

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
      ${more}
    </div>
    <nav class="sh-detail-nav" aria-label="Other days">
      <a class="sh-btn" href="${slug(prev)}.html" rel="prev">&larr; ${esc(longDate(prev))}: ${esc(clip(byKey[prev].title, 40))}</a>
      <a class="sh-btn" href="../sikh-history.html">All 365 days</a>
      <a class="sh-btn" href="${slug(next)}.html" rel="next">${esc(longDate(next))}: ${esc(clip(byKey[next].title, 40))} &rarr;</a>
    </nav>
  </article>

  <section class="sh-month" aria-labelledby="month-h">
    <h2 id="month-h">${MONTHS[m]} in Sikh History</h2>
    <ul class="sh-days">
${monthDays}
    </ul>
  </section>
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
      `    <section class="sh-month">\n      <h3>${name}</h3>\n      <ul class="sh-days">\n` +
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
