/*
 * Shortens long page titles and fixes duplicate / too-short meta descriptions
 * on the SikhsinIndia static site. Safe to re-run.
 *
 *   node scripts/seo-titles-descriptions.js --dry        report + samples, write nothing
 *   node scripts/seo-titles-descriptions.js              apply
 *   node scripts/seo-titles-descriptions.js --dry --all  print every change, not just samples
 *
 * Titles longer than 65 characters (what Google shows before cutting off) are
 * shortened one step at a time, stopping as soon as the title fits, so each
 * keeps as much as possible:
 *   0. drop a repeated part, e.g. "X Life Story - Life Story (Part 1)"
 *   1. drop the " | SikhsInIndia.com" brand
 *   2. "Town | Town, State" -> "Town | State"   (district same as the town)
 *   3. "| District, State" -> "| State"
 *   4. drop "Sri" after "Gurdwara" (also in Hindi / Punjabi)
 *   5. drop the "| State" part
 *   6. drop text in brackets, e.g. "(Kodyala)"
 *   7. cut at the last word that fits
 *
 * Descriptions that are shared with another page or shorter than 50
 * characters are made unique by putting the page's own name (its title
 * without the brand) in front, and short ones are filled out with the page's
 * sub-heading. Descriptions are kept to 160 characters.
 *
 * og:title / twitter:title and og:description / twitter:description are
 * updated wherever they matched the old title or description.
 * Run `node scripts/seo-optimize.js` afterwards so the JSON-LD picks up the
 * new titles and descriptions.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");
const SHOW_ALL = process.argv.includes("--all");
const MAX_TITLE = 65;
const MAX_DESC = 160;
const MIN_DESC = 50;
const BRAND_RE = /\s*\|\s*SikhsInIndia\.com\s*$/i;
const SKIP_DIRS = new Set([".git", ".claude", ".cursor", ".vscode", ".github", "node_modules", "cloudflare-worker", "scripts", "data", "js"]);

function listHtml(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listHtml(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const encode = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const len = (s) => [...s].length; // count Gurmukhi / Devanagari code points, not UTF-16 units
const tidy = (s) => s.replace(/\s+/g, " ").replace(/\s+,/g, ",").replace(/,(?=\S)/g, ", ").replace(/\s*\|\s*/g, " | ").replace(/^[\s,|]+|[\s,|]+$/g, "").trim();

// Cuts at the last whole word within `max` characters.
function cutToWords(s, max) {
  if (len(s) <= max) return s;
  const chars = [...s].slice(0, max + 1).join("");
  const cut = chars.slice(0, chars.lastIndexOf(" "));
  return tidy(cut.replace(/[\s,|:;–—-]+$/, ""));
}

const SHORTEN_STEPS = [
  // "X Life Story - Life Story (Part 1)" -> "X Life Story (Part 1)"
  (t) => t.replace(/^(.*?\b(.+?))\s+-\s+\2\b/i, "$1"),
  (t) => t.replace(BRAND_RE, ""),
  (t) => t.replace(/,\s*([^,|]+?)\s*\|\s*\1\s*,\s*([^|]+)$/, ", $1 | $2"),
  (t) => t.replace(/\|\s*[^|,]+,\s*([^|,]+)$/, "| $1"),
  (t) => t.replace(/^(Gurdwara|Gurudwara|Guruwara)\s+(Sri|Shri)\s+/i, "$1 ").replace(/^(गुरुद्वारा)\s+श्री\s+/, "$1 ").replace(/^(ਗੁਰਦੁਆਰਾ)\s+ਸ੍ਰੀ\s+/, "$1 "),
  (t) => t.replace(/\s*\|\s*[^|]+$/, ""),
  (t) => t.replace(/\s*\([^)]*\)/g, ""),
  (t) => cutToWords(t, MAX_TITLE)
];

function shortenTitle(title) {
  let t = tidy(title);
  for (const step of SHORTEN_STEPS) {
    if (len(t) <= MAX_TITLE) break;
    t = tidy(step(t));
  }
  return t;
}

// <meta name|property="key" content="..."> in either attribute order, with
// either quote style. Returns { tag, value } or null.
function findMeta(html, attr, key) {
  const re = new RegExp(`<meta\\b(?=[^>]*\\b${attr}=["']${key}["'])[^>]*>`, "i");
  const tag = (html.match(re) || [])[0];
  if (!tag) return null;
  const m = tag.match(/\bcontent=(["'])([\s\S]*?)\1/i);
  return m ? { tag, value: m[2] } : null;
}

function setMetaIf(html, attr, key, oldRaw, newRaw) {
  const meta = findMeta(html, attr, key);
  if (!meta || decode(meta.value) !== decode(oldRaw)) return html;
  const newTag = meta.tag.replace(/\bcontent=(["'])[\s\S]*?\1/i, `content="${newRaw}"`);
  return html.replace(meta.tag, () => newTag);
}

function textOf(html, re) {
  const m = html.match(re);
  return m ? tidy(decode(m[1].replace(/<[^>]+>/g, " "))) : "";
}

function joinDesc(name, desc, extra) {
  let d = desc;
  if (name && !decode(d).toLowerCase().includes(name.toLowerCase())) d = d ? `${name} — ${d}` : name;
  if (len(d) < 90 && extra && !d.toLowerCase().includes(extra.toLowerCase())) d = `${d.replace(/[.\s]+$/, "")}. ${extra}`;
  if (len(d) > MAX_DESC) {
    // Prefer ending on a full sentence, else on a whole word.
    const head = [...d].slice(0, MAX_DESC).join("");
    const stop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("। "));
    const comma = head.lastIndexOf(", ");
    // End on a full sentence, else after the last complete list item (so a
    // list of Gurus never ends "…, Sri Guru"), else on a whole word.
    d = stop > 120 ? head.slice(0, stop + 1) : comma > 110 ? head.slice(0, comma) : cutToWords(d, MAX_DESC);
  }
  return tidy(d);
}

/* ───────────── main ───────────── */

const pages = listHtml(ROOT)
  .map((file) => ({ file, rel: path.relative(ROOT, file).split(path.sep).join("/"), html: fs.readFileSync(file, "utf8") }))
  .filter((p) => !/^google[0-9a-f]+/i.test(p.rel) && !/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(p.html));

for (const p of pages) {
  p.title = (p.html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const d = findMeta(p.html, "name", "description");
  p.desc = d ? d.value : "";
}

const descCount = new Map();
for (const p of pages) if (p.desc) descCount.set(decode(p.desc).trim(), (descCount.get(decode(p.desc).trim()) || 0) + 1);

const changes = [];
const stats = { titles: 0, descDuplicate: 0, descShort: 0, files: 0 };

for (const p of pages) {
  let h = p.html;
  const change = { rel: p.rel };

  // Titles
  const oldTitle = decode(p.title).trim();
  if (len(oldTitle) > MAX_TITLE) {
    const newTitle = shortenTitle(oldTitle);
    if (newTitle && newTitle !== oldTitle) {
      const raw = encode(newTitle);
      h = h.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${raw}</title>`);
      h = setMetaIf(h, "property", "og:title", p.title, raw);
      h = setMetaIf(h, "name", "twitter:title", p.title, raw);
      change.title = [oldTitle, newTitle];
      stats.titles++;
    }
  }

  // Descriptions
  const oldDesc = decode(p.desc).trim();
  const duplicate = oldDesc && descCount.get(oldDesc) > 1;
  const short = !oldDesc || len(oldDesc) < MIN_DESC;
  if (duplicate || short) {
    // "Gurdwara X, Town | District, State" reads as "Gurdwara X, Town, District, State".
    const name = tidy(decode(p.title).replace(BRAND_RE, "").replace(/\s*\|\s*/g, ", "))
      .split(", ").filter((part, i, all) => part !== all[i - 1]).join(", "); // "Kurukshetra, Kurukshetra" -> once
    const sub = textOf(h, /<div class="hero-sub">([\s\S]*?)<\/div>/i) ||
      textOf(h, /<div class="intro[^"]*">([\s\S]*?)<\/div>/i) ||
      textOf(h, /<p\b[^>]*>([\s\S]{40,400}?)<\/p>/i);
    const newDesc = joinDesc(name, oldDesc, sub);
    if (newDesc && newDesc !== oldDesc) {
      const raw = encode(newDesc);
      const metaDesc = findMeta(h, "name", "description");
      if (metaDesc) h = h.replace(metaDesc.tag, () => metaDesc.tag.replace(/\bcontent=(["'])[\s\S]*?\1/i, `content="${raw}"`));
      else h = h.replace(/<\/title>/i, () => `</title>\n  <meta name="description" content="${raw}">`);
      h = setMetaIf(h, "property", "og:description", p.desc, raw);
      h = setMetaIf(h, "name", "twitter:description", p.desc, raw);
      change.desc = [oldDesc, newDesc];
      duplicate ? stats.descDuplicate++ : stats.descShort++;
    }
  }

  if (p.html.includes("\r\n")) h = h.replace(/\r?\n/g, "\r\n");
  if (h !== p.html) {
    stats.files++;
    changes.push(change);
    if (!DRY) fs.writeFileSync(p.file, h);
  }
}

// Check: no new duplicate descriptions, and every title fits.
const finalDesc = new Map();
for (const p of pages) {
  const c = changes.find((x) => x.rel === p.rel);
  const d = c && c.desc ? c.desc[1] : decode(p.desc).trim();
  if (d) finalDesc.set(d, (finalDesc.get(d) || 0) + 1);
}
const stillDup = [...finalDesc.values()].filter((n) => n > 1).length;
const stillLong = pages.filter((p) => {
  const c = changes.find((x) => x.rel === p.rel);
  return len(c && c.title ? c.title[1] : decode(p.title).trim()) > MAX_TITLE;
}).length;

const shown = SHOW_ALL ? changes : changes.filter((_, i) => i % Math.max(1, Math.floor(changes.length / 25)) === 0);
for (const c of shown) {
  console.log(`\n${c.rel}`);
  if (c.title) console.log(`  title  ${len(c.title[0])} → ${len(c.title[1])}\n    - ${c.title[0]}\n    + ${c.title[1]}`);
  if (c.desc) console.log(`  desc\n    - ${c.desc[0]}\n    + ${c.desc[1]}`);
}
console.log(`\n${DRY ? "[dry run] " : ""}${stats.files} files ${DRY ? "would change" : "changed"}: ${stats.titles} titles shortened, ` +
  `${stats.descDuplicate} duplicate and ${stats.descShort} short descriptions rewritten.`);
console.log(`After: ${stillLong} titles still over ${MAX_TITLE} characters, ${stillDup} descriptions still shared by more than one page.`);
