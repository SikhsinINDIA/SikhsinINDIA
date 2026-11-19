/*
 * Search Console keywords: puts the words people actually search into the
 * pages Google already shows for them (English, Hindi and Punjabi). Safe to
 * re-run: every change is worked out again from the page and the data file.
 *
 *   node scripts/seo-search-keywords.js          apply
 *   node scripts/seo-search-keywords.js --dry    report what would change, write nothing
 *
 * Then run `node scripts/seo-optimize.js` (JSON-LD picks up the new titles and
 * descriptions) and `node scripts/related-links.js` (link text follows titles).
 *
 * What it does:
 *   1. Pages listed in data/seo-keywords.json get that title, description
 *      and "Also known as" line (other names and spellings people search,
 *      e.g. "Chapri Sahib", "Bandi Chhor Divas"), shown just under the
 *      page heading between <!-- seo:aka --> markers. og:/twitter: title and
 *      description follow when they matched the old ones.
 *   2. Gurudwara pages (any language) whose description doesn't name the
 *      place get one built from the page itself:
 *        "<Name, Town, State>: history, address, phone number and photos. <intro>"
 *      listing only what the page really has (history when it names the
 *      Gurus it commemorates, phone only when it gives one), cut to 160
 *      characters. Search results then show the Gurudwara's name and place,
 *      which is what people search for.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");
const MAX_DESC = 160;
const SKIP_DIRS = new Set([".git", ".claude", ".cursor", ".vscode", ".github", "node_modules", "cloudflare-worker", "scripts", "data", "js", "css", "pictures", "fonts", "99 Shortcuts", "100-misc"]);
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "seo-keywords.json"), "utf8")).pages;

const WORDS = {
  en: { aka: "Also known as", history: "history", address: "address", phone: "phone number", photos: "photos", and: " and ", stop: "." },
  hi: { aka: "अन्य नाम", history: "इतिहास", address: "पता", phone: "फ़ोन नंबर", photos: "फ़ोटो", and: " और ", stop: "।" },
  pa: { aka: "ਹੋਰ ਨਾਮ", history: "ਇਤਿਹਾਸ", address: "ਪਤਾ", phone: "ਫ਼ੋਨ ਨੰਬਰ", photos: "ਤਸਵੀਰਾਂ", and: " ਅਤੇ ", stop: "।" }
};
const ADDRESS_LABELS = ["Address", "पता", "ਪਤਾ"];
const PHONE_LABELS = ["Phone", "Phone Number", "फ़ोन", "फ़ोन नंबर", "ਫ਼ੋਨ", "ਫ਼ੋਨ ਨੰਬਰ"];
const HISTORY_LABELS = ["Commemorates", "Associated With", "स्मृति", "संबद्ध", "ਯਾਦਗਾਰ", "ਸੰਬੰਧਿਤ"];

function listHtml(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listHtml(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&rsquo;/g, "’").replace(/&lsquo;/g, "‘").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const encode = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const text = (s) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const len = (s) => [...s].length;
const BRAND_RE = /\s*\|\s*SikhsInIndia\.com\s*$/i;

// <meta name|property="key" content="..."> in either attribute order.
function findMeta(html, attr, key) {
  const tag = (html.match(new RegExp(`<meta\\b(?=[^>]*\\b${attr}=["']${key}["'])[^>]*>`, "i")) || [])[0];
  const m = tag && tag.match(/\bcontent=(["'])([\s\S]*?)\1/i);
  return m ? { tag, value: m[2] } : null;
}
function setMeta(html, attr, key, raw) {
  const meta = findMeta(html, attr, key);
  return meta ? html.replace(meta.tag, () => meta.tag.replace(/\bcontent=(["'])[\s\S]*?\1/i, `content="${raw}"`)) : html;
}
// Social tags follow the title/description only when they were the same as
// the old one (or the old title without the site name): hand-written share
// text stays.
function followMeta(html, attr, key, oldText, raw) {
  const meta = findMeta(html, attr, key);
  if (!meta) return html;
  const v = decode(meta.value).trim();
  return v === oldText || v === oldText.replace(BRAND_RE, "") ? setMeta(html, attr, key, raw) : html;
}

function cutDesc(d) {
  if (len(d) <= MAX_DESC) return d;
  const head = [...d].slice(0, MAX_DESC).join("");
  return head.slice(0, head.lastIndexOf(" ")).replace(/[\s,;:–—-]+$/, "") + "…";
}

// The page's facts: { label: value } from the "facts" panel.
function facts(html) {
  const out = {};
  for (const m of html.matchAll(/class="fact-label">([^<]*)<\/div>\s*<div class="fact-value">([\s\S]*?)<\/div>/g)) out[text(m[1])] = text(m[2]);
  return out;
}

// Description for a Gurudwara page that doesn't name its place.
function gurudwaraDescription(html, lang, title, oldDesc) {
  const f = facts(html);
  if (!ADDRESS_LABELS.some((l) => f[l])) return null; // a listing page, not a Gurudwara
  const name = title.replace(BRAND_RE, "").replace(/\s*[|—]\s*/g, ", ").split(/,\s*/)
    .filter((part, i, all) => part && part !== all[i - 1]).join(", ");
  // The place: the title after the Gurudwara's name, and the hero subtitle
  // ("Chaapri — Tarn Taran, Punjab"), without anything in brackets.
  const subtitle = text((html.match(/<div class="hero-subtitle">([\s\S]*?)<\/div>/) || [])[1] || "");
  const places = [...name.split(", ").slice(1), ...subtitle.split(/\s*[,—·|]\s*/)]
    .map((p) => p.replace(/\s*[[(][^\])]*[\])]/g, "").trim()).filter((p) => len(p) >= 3);
  const lower = oldDesc.toLowerCase();
  if ((places.length ? places : [name]).some((p) => lower.includes(p.toLowerCase()))) return null;
  const w = WORDS[lang];
  const parts = [];
  if (HISTORY_LABELS.some((l) => f[l])) parts.push(w.history);
  parts.push(w.address);
  if (PHONE_LABELS.some((l) => f[l])) parts.push(w.phone);
  if (/id="galleryMain"/.test(html)) parts.push(w.photos);
  const what = parts.length > 1 ? parts.slice(0, -1).join(", ") + w.and + parts[parts.length - 1] : parts[0];
  const intro = text((html.match(/<div class="intro-banner">\s*(?:<!-- seo:aka -->[\s\S]*?<!-- \/seo:aka -->\s*)?<p>([\s\S]*?)<\/p>/) || [])[1] || "") || oldDesc;
  return cutDesc(`${name}: ${what}${w.stop} ${intro.replace(/\s*[.।]?\s*$/, w.stop)}`);
}

// "Also known as" line under the heading: after the hero subtitle when there
// is one, else after the first <h1>. Comments are skipped.
function setAka(html, lang, aka) {
  const eol = html.includes("\r\n") ? "\r\n" : "\n";
  // Removed with the line break and indent in front of it, which is what
  // gets added below, so taking it out gives back the page exactly.
  let h = html.replace(/(\r?\n[ \t]*)?<!-- seo:aka -->[\s\S]*?<!-- \/seo:aka -->/g, "");
  if (!aka || !aka.length) return h;
  const line = `<!-- seo:aka --><p class="seo-aka" style="margin:6px auto 0;font-size:14px;line-height:1.4;opacity:.85;text-align:center">${encode(WORDS[lang].aka)}: ${aka.map(encode).join(" · ")}</p><!-- /seo:aka -->`;
  const visible = h.replace(/<!--[\s\S]*?-->/g, (c) => " ".repeat(c.length));
  const sub = /<div class="hero-subtitle">[\s\S]*?<\/div>/.exec(visible);
  const h1 = /<\/h1>/i.exec(visible);
  const at = sub ? sub.index + sub[0].length : h1 ? h1.index + h1[0].length : -1;
  if (at < 0) return h;
  const indent = (h.slice(0, at).match(/\n([ \t]*)[^\n]*$/) || [, ""])[1];
  return h.slice(0, at) + eol + indent + line + h.slice(at);
}

/* ───────────── main ───────────── */

const stats = { titles: 0, descData: 0, descGurudwara: 0, aka: 0, files: 0 };
const samples = [];
const missing = new Set(Object.keys(DATA));

for (const file of listHtml(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const lang = rel.startsWith("hi/") ? "hi" : rel.startsWith("pa/") ? "pa" : "en";
  const base = lang === "en" ? rel : rel.slice(3);
  const entry = DATA[base] && DATA[base][lang];
  if (DATA[base]) missing.delete(base);
  if (!entry && !/^04-gurudwaras\//.test(base)) continue;

  const html = fs.readFileSync(file, "utf8");
  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html)) continue;
  let h = html;
  const titleM = h.match(/<title>([\s\S]*?)<\/title>/i);
  const oldTitle = titleM ? decode(titleM[1]).trim() : "";
  const descMeta = findMeta(h, "name", "description");
  const oldDesc = descMeta ? decode(descMeta.value).trim() : "";
  const change = { rel };

  if (entry && entry.title && entry.title !== oldTitle) {
    const raw = encode(entry.title);
    h = h.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${raw}</title>`);
    h = followMeta(h, "property", "og:title", oldTitle, raw);
    h = followMeta(h, "name", "twitter:title", oldTitle, raw);
    change.title = [oldTitle, entry.title];
    stats.titles++;
  }
  const title = entry && entry.title ? entry.title : oldTitle;

  const newDesc = entry && entry.description ? entry.description : gurudwaraDescription(h, lang, title, oldDesc);
  if (newDesc && newDesc !== oldDesc && descMeta) {
    const raw = encode(newDesc);
    h = setMeta(h, "name", "description", raw);
    h = followMeta(h, "property", "og:description", oldDesc, raw);
    h = followMeta(h, "name", "twitter:description", oldDesc, raw);
    change.desc = [oldDesc, newDesc];
    entry && entry.description ? stats.descData++ : stats.descGurudwara++;
  }

  const withAka = setAka(h, lang, entry && entry.aka);
  if (withAka !== h) { h = withAka; change.aka = entry && entry.aka; stats.aka++; }

  if (h !== html) {
    stats.files++;
    if (entry || samples.length < 12) samples.push(change);
    if (!DRY) fs.writeFileSync(file, h);
  }
}

for (const c of samples) {
  console.log(`\n${c.rel}`);
  if (c.title) console.log(`  title ${len(c.title[1])}\n    - ${c.title[0]}\n    + ${c.title[1]}`);
  if (c.desc) console.log(`  desc ${len(c.desc[1])}\n    - ${c.desc[0]}\n    + ${c.desc[1]}`);
  if (c.aka) console.log(`  aka   ${c.aka.join(" · ")}`);
}
for (const m of missing) console.warn(`! data/seo-keywords.json names a page that doesn't exist: ${m}`);
console.log(`\n${DRY ? "[dry run] " : ""}${stats.files} files ${DRY ? "would change" : "changed"}: ${stats.titles} titles, ` +
  `${stats.descData} descriptions from the data file, ${stats.descGurudwara} Gurudwara descriptions, ${stats.aka} "also known as" lines.`);
