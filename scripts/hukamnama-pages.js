/* ──────────────────────────────────────────────────────────────
   Hukamnama pages
   Used by scripts/update-hukamnama.js. For each day's Hukamnama it:
     - saves the record to data/hukamnama-archive/YYYY-MM-DD.json
     - writes a permanent page hukamnama/YYYY-MM-DD.html
     - rebuilds hukamnama/archive.html (every saved day, newest first)
     - writes the latest day into hukamnama.html itself (plus links to
       recent days), so the Gurbani is in the HTML, not only added by script.
   All pages are made from hukamnama.html, so they share its look.

   node scripts/hukamnama-pages.js   rebuilds every page from the saved
   records (after a template change); then run scripts/seo-optimize.js.
   ────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAIN = path.join(ROOT, 'hukamnama.html');
const DIR = path.join(ROOT, 'hukamnama');
const DATA_DIR = path.join(ROOT, 'data', 'hukamnama-archive');
const SITE = 'https://sikhsinindia.com';
const RECENT_ON_MAIN = 14;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n) => {
  s = String(s || '');
  if (s.length <= n) return s;
  const c = s.slice(0, n);
  return c.slice(0, c.lastIndexOf(' ')).replace(/[,;:\-–]+$/, '') + '…';
};
const strip = (html) => html.replace(/\r\n/g, '\n')
  .replace(/\s*<!-- seo:[a-z]+ -->[\s\S]*?<!-- \/seo:[a-z]+ -->/g, '');

// Same markup as the render() script in hukamnama.html.
function cardHtml(d) {
  const lines = (d.verses || []).map((v) =>
    '<div class="hn-line">' +
      '<div class="hn-gurmukhi">' + esc(v.gurmukhi) + '</div>' +
      (v.translation ? '<div class="hn-translation">' + esc(v.translation) + '</div>' : '') +
    '</div>').join('');
  return '<div class="hn-card" data-date="' + esc(d.date) + '">' +
      '<div class="hn-card-head">' +
        '<div class="hn-sub">' + esc(d.raagEnglish) +
          (d.writerEnglish ? ' &middot; ' + esc(d.writerEnglish) : '') + '</div>' +
        '<div class="hn-date">' + esc(d.dateDisplay) + '</div>' +
      '</div>' +
      '<div class="hn-meta">' +
        '<span class="hn-meta-chip">Ang ' + esc(d.ang) + '</span>' +
      '</div>' +
      '<div class="hn-body">' + (lines || '<p class="hn-none">No Hukamnama available right now.</p>') + '</div>' +
      '<div class="hn-note">Gurbani text and English translation via BaniDB, an open Sri Guru Granth Sahib Ji database.</div>' +
    '</div>';
}

const LINKS_CSS = `
    /* ── links to other days (scripts/hukamnama-pages.js) ── */
    .hn-days { margin: 26px 0 8px; }
    .hn-days h2 { font-size: 18px; color: var(--navy, #002B6D); margin: 0 0 8px; }
    .hn-days h3 { font-size: 15px; color: var(--navy, #002B6D); margin: 18px 0 6px; }
    .hn-days ul { list-style: none; margin: 0; padding: 0; }
    .hn-days li a { display: block; padding: 8px 0; color: var(--navy, #002B6D); text-decoration: none;
                    border-bottom: 1px solid rgba(0,43,109,.12); font-size: 14px; }
    .hn-days li a:hover { color: #c46a00; }
    .hn-days .hn-d { font-weight: 700; display: inline-block; min-width: 150px; }
    .hn-daynav { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; margin: 18px 0 0; }
    .hn-daynav a { color: var(--navy, #002B6D); font-weight: 700; text-decoration: none; font-size: 14px; }
    .hn-daynav a:hover { color: #c46a00; }
`;

const titleOf = (d) => `Hukamnama, ${d.dateDisplay}: Ang ${d.ang}${d.raagEnglish ? ', ' + d.raagEnglish : ''}`;
const firstLine = (d) => {
  const v = (d.verses || []).slice(1).find((x) => x.gurmukhi && x.gurmukhi.indexOf('ੴ') === -1) || {};
  return v;
};
const dayLink = (d, prefix) =>
  `<li><a href="${prefix}${d.date}.html"><span class="hn-d">${esc(d.dateDisplay)}</span>` +
  `Ang ${esc(d.ang)}${d.raagEnglish ? ' &middot; ' + esc(d.raagEnglish) : ''}` +
  `${d.writerEnglish ? ' &middot; ' + esc(d.writerEnglish) : ''}</a></li>`;

function records() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()
    .map((f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));
}

// Fill hukamnama.html's head/heading for another page made from it.
function fromTemplate(tpl, { title, desc, url, h1, sub, ogType }) {
  let h = strip(tpl).replace(/\s*\/\* ── links to other days[\s\S]*?(?=\s*<\/style>)/, '');
  const set = (re, val) => { if (!re.test(h)) throw new Error('hukamnama.html template: ' + re); h = h.replace(re, val); };
  set(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  set(/(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`);
  h = h.split(`${SITE}/hukamnama.html`).join(url);
  set(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`);
  set(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`);
  set(/(<meta name="twitter:title" content=")[^"]*/, `$1${esc(title)}`);
  set(/(<meta name="twitter:description" content=")[^"]*/, `$1${esc(desc)}`);
  if (ogType) h = h.replace(/(<meta property="og:type" content=")[^"]*/, `$1${ogType}`);
  set(/<h1>[\s\S]*?<\/h1>/, `<h1>${h1}</h1>`);
  set(/(<div class="hn-titles">[\s\S]*?<p>)[^<]*(<\/p>)/, `$1${sub}$2`);
  h = h.split('src="./pictures/').join('src="../pictures/');
  // These pages are static: no data script, no render script.
  h = h.replace(/\s*<script src="data\/hukamnama\.js"><\/script>/, '');
  h = h.replace(/\s*<script>\s*\(function \(\) \{\s*'use strict';\s*var DATA_URL[\s\S]*?<\/script>/, '');
  h = h.replace(/\s*<!-- hn-links:start -->[\s\S]*?<!-- hn-links:end -->/, '');
  return h;
}

function setMain(h, inner) {
  return h.replace(/<main class="wrap">[\s\S]*?<\/main>/, () => `<main class="wrap">\n${inner}\n</main>`);
}

function writeIfChanged(file, html) {
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (old !== null && strip(old) === strip(html)) return false;
  fs.writeFileSync(file, html);
  return true;
}

function build() {
  const tpl = fs.readFileSync(MAIN, 'utf8');
  const all = records();                    // newest first
  if (!all.length) return { days: 0, written: 0 };
  fs.mkdirSync(DIR, { recursive: true });
  let written = 0;

  all.forEach((d, i) => {
    const newer = all[i - 1], older = all[i + 1];
    const v = firstLine(d);
    const desc = clip(`Hukamnama from Sri Harmandir Sahib, Amritsar for ${d.dateDisplay} - Ang ${d.ang}` +
      `${d.raagEnglish ? ', ' + d.raagEnglish : ''}${d.writerEnglish ? ', ' + d.writerEnglish : ''}` +
      `${v.translation ? ': ' + v.translation : ''}`, 158);
    let h = fromTemplate(tpl, {
      title: titleOf(d).length <= 52 ? titleOf(d) + ' | Sikhs in India' : titleOf(d),
      desc, url: `${SITE}/hukamnama/${d.date}.html`, ogType: 'article',
      h1: `Hukamnama &mdash; <span>${esc(d.dateDisplay)}</span>`,
      sub: 'Sri Harmandir Sahib, Amritsar'
    });
    h = setMain(h, `  <div id="hnMount">${cardHtml(d)}</div>
  <nav class="hn-daynav" aria-label="Other days">
    ${older ? `<a href="${older.date}.html" rel="prev">&larr; ${esc(older.dateDisplay)}</a>` : '<span></span>'}
    <a href="../hukamnama.html">Today&rsquo;s Hukamnama</a>
    <a href="archive.html">All Hukamnamas</a>
    ${newer ? `<a href="${newer.date}.html" rel="next">${esc(newer.dateDisplay)} &rarr;</a>` : '<span></span>'}
  </nav>`);
    h = h.replace('  </style>', LINKS_CSS + '  </style>');
    if (writeIfChanged(path.join(DIR, d.date + '.html'), h)) written++;
  });

  // Archive: every saved day, grouped by month.
  const byMonth = [];
  for (const d of all) {
    const key = d.dateDisplay.replace(/^\d+ /, '');
    if (!byMonth.length || byMonth[byMonth.length - 1].key !== key) byMonth.push({ key, days: [] });
    byMonth[byMonth.length - 1].days.push(d);
  }
  let a = fromTemplate(tpl, {
    title: 'Hukamnama Archive: Sri Harmandir Sahib, Amritsar | Sikhs in India',
    desc: 'Every daily Hukamnama from Sri Harmandir Sahib, Amritsar saved on Sikhs in India, by date - the full Gurbani in Gurmukhi with English translation.',
    url: `${SITE}/hukamnama/archive.html`,
    h1: 'Hukamnama <span>Archive</span>', sub: 'Sri Harmandir Sahib, Amritsar - every saved day'
  });
  a = setMain(a, `  <section class="hn-days" aria-labelledby="hn-arch-h">
    <h2 id="hn-arch-h">All Hukamnamas</h2>
    <p><a href="../hukamnama.html">Today&rsquo;s Hukamnama &rarr;</a></p>
${byMonth.map((m) => `    <h3>${esc(m.key)}</h3>\n    <ul>\n${m.days.map((d) => '      ' + dayLink(d, '')).join('\n')}\n    </ul>`).join('\n')}
  </section>`);
  a = a.replace('  </style>', LINKS_CSS + '  </style>');
  if (writeIfChanged(path.join(DIR, 'archive.html'), a)) written++;

  // hukamnama.html: the latest day built into the page, and links to recent days.
  const latest = all[0];
  let m = tpl;
  const eol = m.includes('\r\n') ? '\r\n' : '\n';
  const MOUNT = /<div id="hnMount">(?:<!-- hn:start -->[\s\S]*?<!-- hn:end -->)?<\/div>(\s*<!-- hn-links:start -->[\s\S]*?<!-- hn-links:end -->)?(\s*<\/main>)/;
  if (!MOUNT.test(m)) throw new Error('hukamnama.html: <div id="hnMount"> not found');
  m = m.replace(MOUNT,
    (all0, links, end) => `<div id="hnMount"><!-- hn:start -->${cardHtml(latest)}<!-- hn:end --></div>` +
      (`${eol}  <!-- hn-links:start -->${eol}  <nav class="hn-days" aria-labelledby="hn-recent-h">${eol}` +
       `    <h2 id="hn-recent-h">Recent Hukamnamas</h2>${eol}    <ul>${eol}` +
       all.slice(0, RECENT_ON_MAIN).map((d) => '      ' + dayLink(d, 'hukamnama/')).join(eol) +
       `${eol}    </ul>${eol}    <p><a href="hukamnama/archive.html">All Hukamnamas &rarr;</a></p>${eol}  </nav>${eol}  <!-- hn-links:end -->`) +
      end);
  if (!m.includes('/* ── links to other days')) m = m.replace('  </style>', LINKS_CSS.replace(/\n/g, eol) + '  </style>');
  if (m !== tpl) { fs.writeFileSync(MAIN, m); written++; }
  return { days: all.length, written };
}

// Save one day's record (the shape written to data/hukamnama.json) and rebuild.
function publish(d) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const { updated, ...rec } = d;            // keep the saved record stable
  fs.writeFileSync(path.join(DATA_DIR, d.date + '.json'), JSON.stringify(rec, null, 1) + '\n', 'utf8');
  return build();
}

module.exports = { publish, build, cardHtml };

if (require.main === module) {
  const r = build();
  console.log(`Hukamnama pages: ${r.days} days, ${r.written} files written`);
}
