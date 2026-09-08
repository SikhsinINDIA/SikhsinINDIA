/* ──────────────────────────────────────────────────────────────
   Update Daily Hukamnama
   Fetches today's Hukamnama (as published from Sri Harmandir Sahib,
   Amritsar) from the BaniDB API and writes a small, static summary
   to data/hukamnama.json and data/hukamnama.js.

   Runs on a daily schedule via .github/workflows/update-hukamnama.yml
   so the homepage never needs a manual edit. If the fetch fails for
   any reason, the script exits without touching the existing files,
   so the site simply keeps showing the last successful day.
   ────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.banidb.com/v2/hukamnamas/today';
const OUT_JSON = path.join(__dirname, '..', 'data', 'hukamnama.json');
const OUT_JS = path.join(__dirname, '..', 'data', 'hukamnama.js');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n) { return String(n).padStart(2, '0'); }

/* The first line is the shabad's title (raag/mehla/ghar); the next is
   often the mangalacharan (starts with ੴ). The Hukamnama proper - the
   line worth showing as a preview - is the first verse after those. */
function pickPreviewVerse(verses) {
  for (let i = 1; i < verses.length; i++) {
    const gurmukhi = verses[i].verse.unicode || '';
    if (gurmukhi.indexOf('ੴ') === -1) return verses[i];
  }
  return verses[1] || verses[0];
}

async function main() {
  const res = await fetch(API_URL, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('BaniDB request failed: HTTP ' + res.status);
  const data = await res.json();

  const shabad = data.shabads && data.shabads[0];
  if (!shabad || !shabad.verses || !shabad.verses.length) {
    throw new Error('Unexpected BaniDB response shape (no shabad/verses)');
  }

  const info = shabad.shabadInfo;
  const g = data.date && data.date.gregorian;
  if (!g) throw new Error('Unexpected BaniDB response shape (no date)');

  const dateIso = g.year + '-' + pad(g.month) + '-' + pad(g.date);
  const dateDisplay = g.date + ' ' + MONTH_NAMES[g.month - 1] + ' ' + g.year;

  const titleVerse = shabad.verses[0];
  const previewVerse = pickPreviewVerse(shabad.verses);

  const out = {
    date: dateIso,
    dateDisplay: dateDisplay,
    ang: info.pageNo,
    raagGurmukhi: (info.raag && info.raag.unicode) || '',
    raagEnglish: (info.raag && info.raag.english) || '',
    writerEnglish: (info.writer && info.writer.english) || '',
    titleGurmukhi: (titleVerse && titleVerse.verse.unicode) || '',
    titleEnglish: (titleVerse && titleVerse.translation && titleVerse.translation.en &&
      (titleVerse.translation.en.bdb || titleVerse.translation.en.ssk)) || '',
    verseGurmukhi: (previewVerse && previewVerse.verse.unicode) || '',
    verseTranslation: (previewVerse && previewVerse.translation && previewVerse.translation.en &&
      (previewVerse.translation.en.bdb || previewVerse.translation.en.ssk)) || '',
    sourceUrl: 'https://sgpc.net/hukamnama/',
    listenUrl: 'https://hs.sgpc.net/',
    updated: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2) + '\n', 'utf8');
  fs.writeFileSync(OUT_JS,
    '/* Auto-generated daily by .github/workflows/update-hukamnama.yml. Do not edit by hand. */\n' +
    'window.HUKAMNAMA = ' + JSON.stringify(out, null, 2) + ';\n',
    'utf8');

  console.log('Wrote', OUT_JSON, 'and', OUT_JS, 'for', dateIso);
}

main().catch(function (err) {
  console.error('update-hukamnama failed:', err.message);
  process.exit(1);
});
