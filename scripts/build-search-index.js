/* ──────────────────────────────────────────────────────────────
   Site search index (English, Hindi, Punjabi)
   Runs in .github/workflows/build-search-index.yml. Reads every page
   listed in sitemap.xml and writes one small index per language:

     data/search-index-en.json   pages outside /hi/ and /pa/
     data/search-index-hi.json   pages under /hi/
     data/search-index-pa.json   pages under /pa/

   Each entry is [url, title, description, keywords, headings, text]:
   the page's own title and meta tags, its h1-h3 headings, and the
   opening words of its paragraphs. search.html (and hi/, pa/) load
   these files and search them in the visitor's browser.

   Only pages in the sitemap are indexed, so admin pages and old copies
   never appear in search results.
   ────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://sikhsinindia.com';
const OUT_DIR = path.join(ROOT, 'data');
const MAX_HEADINGS = 12;
const MAX_TEXT = 300; // characters of paragraph text per page

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rarr: '→', larr: '←', bull: '•', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©' };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(n); } catch (_) { return m; }
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, e.toLowerCase()) ? ENTITIES[e.toLowerCase()] : m;
  });
}

function clean(s) {
  return decode(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function meta(html, name) {
  const re = new RegExp('<meta\\s[^>]*name\\s*=\\s*["\']' + name + '["\'][^>]*>', 'i');
  const tag = (html.match(re) || [])[0];
  if (!tag) return '';
  const c = tag.match(/content\s*=\s*"([^"]*)"/i) || tag.match(/content\s*=\s*'([^']*)'/i);
  return c ? clean(c[1]) : '';
}

function pageEntry(url, html) {
  // Ignore scripts, styles and the site-wide add-on blocks.
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!-- seo:(reading|world|push) -->[\s\S]*?<!-- \/seo:\1 -->/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  let title = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  title = title.replace(/\s*[|\-–]\s*SikhsInIndia\.com\s*$/i, '').trim();

  const headings = [];
  const seen = new Set([title.toLowerCase()]);
  for (const m of body.matchAll(/<h([1-3])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi)) {
    const h = clean(m[2]);
    if (h && h.length < 160 && !seen.has(h.toLowerCase())) { seen.add(h.toLowerCase()); headings.push(h); }
    if (headings.length >= MAX_HEADINGS) break;
  }

  let text = '';
  for (const m of body.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)) {
    const p = clean(m[1]);
    if (p.length < 25) continue;
    text += (text ? ' ' : '') + p;
    if (text.length >= MAX_TEXT) break;
  }
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT).replace(/\s+\S*$/, '') + '…';

  return [url, title || headings[0] || url, meta(html, 'description'), meta(html, 'keywords'), headings.join(' | '), text];
}

function urlToFile(url) {
  let p = decodeURIComponent(new URL(url).pathname);
  if (p.endsWith('/')) p += 'index.html';
  return path.join(ROOT, p);
}

function langOf(url) {
  const p = new URL(url).pathname;
  if (p.startsWith('/hi/')) return 'hi';
  if (p.startsWith('/pa/')) return 'pa';
  return 'en';
}

function main() {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const urls = [...new Set([...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1])))]
    .filter((u) => u.startsWith(SITE));

  const out = { en: [], hi: [], pa: [] };
  let missing = 0;
  for (const url of urls) {
    const file = urlToFile(url);
    if (!/\.html?$/i.test(file) || !fs.existsSync(file)) { missing++; continue; }
    const html = fs.readFileSync(file, 'utf8');
    // Store the path only; search.html adds the visitor's own host
    // (so sikhsinworld.com and sikhsinuae.com link to themselves).
    out[langOf(url)].push(pageEntry(new URL(url).pathname, html));
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const lang of Object.keys(out)) {
    out[lang].sort((a, b) => a[0].localeCompare(b[0]));
    const file = path.join(OUT_DIR, `search-index-${lang}.json`);
    fs.writeFileSync(file, JSON.stringify({ v: 1, lang, pages: out[lang] }));
    console.log(`${lang}: ${out[lang].length} pages, ${(fs.statSync(file).size / 1024).toFixed(0)} KB -> ${path.relative(ROOT, file)}`);
  }
  if (missing) console.log(`${missing} sitemap URL(s) had no matching .html file and were skipped.`);
}

main();
