/*
 * SEO optimiser for the SikhsinIndia static site. Safe to re-run: every change
 * is idempotent, so run it again after adding or editing pages.
 *
 *   node scripts/seo-optimize.js           apply changes + rebuild sitemap.xml
 *   node scripts/seo-optimize.js --dry     report what would change, write nothing
 *
 * What it does to each HTML page:
 *   1. Google tag loader: replaces the placeholder id G-XXXXXXXXXX with the
 *      real measurement id (gtag('config', ...) already uses the real one).
 *   2. Main heading: pages with no <h1> get their <div class="hero-title">
 *      turned into <h1 class="hero-title"> (same class, so same look).
 *   3. Structured data: adds a JSON-LD block (WebPage + BreadcrumbList, plus
 *      Organization + WebSite on the home page) between
 *      <!-- seo:jsonld --> markers, regenerated on every run.
 *   4. Descriptions: strips folder-number prefixes such as
 *      "From the 01 01 Sikh Gurus collection" -> "From the Sikh Gurus collection".
 *   5. Images: adds loading="lazy" to every image after the first one on a
 *      page (the first is usually the visible hero/logo, so it stays eager).
 *   6. Old / copy / test pages and the "99 Shortcuts" share-link copies get
 *      <meta name="robots" content="noindex, follow">.
 * Then sitemap.xml is rebuilt from every indexable page, with <lastmod> taken
 * from the page's last git commit and hreflang alternates for en/hi/pa.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://sikhsinindia.com";
const GA_ID = "G-LHNTFNW14H";
const DRY = process.argv.includes("--dry");
const SKIP_DIRS = new Set([".git", ".claude", ".cursor", ".vscode", ".github", "node_modules", "cloudflare-worker", "scripts", "data", "js"]);

// Pages that must never be indexed: backups, copies, tests, drafts, and the
// short share-link copies under "99 Shortcuts".
const NOINDEX_RE = /(^|\/)old\/| - copy\.html$|-old\d*\.html$|(^|\/)test\d*\.html$|workinprogress|^99 shortcuts\//i;
// Google Search Console verification files must stay byte-for-byte as issued.
const UNTOUCHED_RE = /^google[0-9a-f]+.*\.html$/i;

const ORG = {
  "@type": "Organization",
  "@id": `${SITE}/#organization`,
  name: "Sikhs in India",
  alternateName: "SikhsInIndia.com",
  url: `${SITE}/`,
  logo: {
    "@type": "ImageObject",
    "@id": `${SITE}/#logo`,
    url: `${SITE}/sikhsinindia.png`,
    contentUrl: `${SITE}/sikhsinindia.png`,
    width: 1244,
    height: 1122,
    caption: "Sikhs in India"
  },
  image: { "@id": `${SITE}/#logo` },
  email: "sikhsinindia@gmail.com",
  description: "Sikhs in India preserves and shares Sikh heritage: the Gurus, Gurbani, Gurudwaras across India, festivals, Nitnem and community services.",
  // The site's own social links (home page footer).
  sameAs: [
    "https://www.youtube.com/@SikhsInIndia",
    "https://www.instagram.com/sikhs_in_india",
    "https://www.facebook.com/groups/1472776657526407",
    "https://www.linkedin.com/groups/18803017/"
  ]
};
const WEBSITE = {
  "@type": "WebSite",
  "@id": `${SITE}/#website`,
  name: "Sikhs in India",
  url: `${SITE}/`,
  inLanguage: ["en", "hi", "pa"],
  publisher: { "@id": `${SITE}/#organization` }
};

/* ───────────── helpers ───────────── */

function listHtml(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listHtml(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const relPath = (file) => path.relative(ROOT, file).split(path.sep).join("/");
const pageUrl = (rel) => `${SITE}/${rel === "index.html" ? "" : encodeURI(rel)}`;
const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const decodeEntities = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const stripTags = (s) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// "01-01-sikh-gurus" -> "Sikh Gurus"
function prettyName(slug) {
  const words = slug.replace(/\.html$/, "").replace(/^[0-9a-z]{0,3}(-\d+[a-z]?\d*)*-(?=[a-z])/i, "").replace(/^\d+[-_]/, "").split(/[-_ ]+/).filter(Boolean);
  return words.map((w) => (w.length <= 2 && w !== "of" ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ").replace(/\bJi\b/gi, "Ji");
}

function metaContent(head, attr, name) {
  const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]*content=["']([^"']*)["']`, "i");
  return (head.match(re) || [])[1] || "";
}

// Breadcrumb trail: Home > section pages that exist as "<folder>.html" next
// to their folder (the site's convention, e.g. 01-about-sikhism/01-01-sikh-gurus.html
// sits beside 01-about-sikhism/01-01-sikh-gurus/) > this page. Folders with no
// such page are skipped so every crumb points at a real URL.
function breadcrumbs(rel, pageName, titleByRel) {
  const parts = rel.split("/");
  const lang = parts[0] === "hi" || parts[0] === "pa" ? parts[0] : "";
  // hi/ and pa/ have no home page of their own; all languages share the main one.
  const trail = [{ name: "Home", url: `${SITE}/` }];
  const start = lang ? 1 : 0;
  for (let i = start; i < parts.length - 1; i++) {
    const candidate = [...parts.slice(0, i), parts[i] + ".html"].join("/");
    if (candidate !== rel && titleByRel.has(candidate)) trail.push({ name: titleByRel.get(candidate), url: pageUrl(candidate) });
  }
  trail.push({ name: pageName, url: pageUrl(rel) });
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url }))
  };
}

// Short page name for breadcrumbs: the title without the " | SikhsInIndia.com" suffix.
const shortTitle = (title) => stripTags(title).replace(/\s*[|–-]\s*Sikhs ?In ?India(\.com)?\s*$/i, "").trim();

function lastCommitDates() {
  const dates = new Map();
  try {
    const log = execSync("git -c core.quotepath=off log --format=@%cs --name-only --no-renames", { cwd: ROOT, maxBuffer: 512 * 1024 * 1024 }).toString();
    let current = "";
    for (const line of log.split("\n")) {
      if (line.startsWith("@")) current = line.slice(1).trim();
      else if (line.trim() && !dates.has(line.trim())) dates.set(line.trim(), current);
    }
  } catch (err) {
    console.warn("git log unavailable, using today's date for <lastmod>:", err.message);
  }
  return dates;
}

// Same page, written differently? Compares two URLs on this site after
// decoding, so "Photo Upload.html" and "Photo%20Upload.html" match.
function samePage(a, b) {
  const norm = (u) => { try { return decodeURI(u); } catch { return u; } };
  return norm(a) === norm(b);
}

// 7. Self-referencing URLs (canonical, og:url, hreflang) must be valid,
// consistent addresses:
//   - percent-encode file names with spaces or unusual characters;
//   - the home page is https://sikhsinindia.com/ (not /index.html);
//   - a hi/ or pa/ translation is its own canonical page. Pointing it at the
//     English page while also listing it as an hreflang alternate gives
//     Google conflicting signals.
function fixPageUrls(h, rel) {
  const own = pageUrl(rel);
  const english = rel.startsWith("hi/") || rel.startsWith("pa/") ? pageUrl(rel.slice(3)) : null;
  const fixHref = (href) => {
    if (rel === "index.html" && /^https:\/\/sikhsinindia\.com\/(index\.html)?$/.test(href)) return own;
    if (samePage(href, own)) return own;
    return href;
  };
  let out = h.replace(/(<link[^>]+rel=["']canonical["'][^>]*href=["'])([^"']+)(["'])/i, (m, a, href, z) => {
    let next = fixHref(decodeEntities(href));
    if (english && samePage(next, english)) next = own;
    return a + escAttr(next) + z;
  });
  out = out.replace(/(<meta[^>]+property=["']og:url["'][^>]*content=["'])([^"']+)(["'])/i,
    (m, a, href, z) => a + escAttr(fixHref(decodeEntities(href))) + z);
  // hreflang alternates: re-encode links whose file names have odd characters.
  out = out.replace(/(<link[^>]+hreflang=["'][^"']+["'][^>]*href=["'])([^"']+)(["'])/gi, (m, a, rawHref, z) => {
    const href = decodeEntities(rawHref);
    if (!href.startsWith(SITE + "/")) return m;
    const target = href.slice(SITE.length + 1) || "index.html";
    let decoded; try { decoded = decodeURI(target); } catch { return m; }
    return a + escAttr(decoded === "index.html" ? `${SITE}/` : pageUrl(decoded)) + z;
  });
  return out;
}

/* ───────────── main ───────────── */

const dates = lastCommitDates();
const today = new Date().toISOString().slice(0, 10);

const files = listHtml(ROOT).filter((f) => !UNTOUCHED_RE.test(relPath(f)));
const pages = files.map((file) => ({ file, rel: relPath(file), html: fs.readFileSync(file, "utf8") }));

const titleByRel = new Map();
for (const p of pages) {
  const t = (p.html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
  if (t) titleByRel.set(p.rel, shortTitle(t));
}

const stats = { gtag: 0, h1: 0, jsonld: 0, desc: 0, lazy: 0, noindex: 0, urls: 0, images: 0, icons: 0, changedFiles: 0 };
const DEFAULT_IMAGE = `${SITE}/sikhsinindia.jpg`;
const indexable = [];

for (const p of pages) {
  let h = p.html;
  const rel = p.rel;

  // 6. noindex for backups / copies / tests / share-link copies
  if (NOINDEX_RE.test(rel) && !/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(h)) {
    if (/<meta[^>]+name=["']robots["'][^>]*>/i.test(h)) h = h.replace(/<meta[^>]+name=["']robots["'][^>]*>/i, '<meta name="robots" content="noindex, follow">');
    else h = h.replace(/<head([^>]*)>/i, '<head$1>\n  <meta name="robots" content="noindex, follow">');
    stats.noindex++;
  }
  const noindex = /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(h);

  // 9. Favicon links (every page, indexable or not, so every browser tab shows
  // the logo). Root-relative paths work on any page of sikhsinindia.com.
  // Old hand-written icon links are replaced by this one block.
  {
    const eol = p.html.includes("\r\n") ? "\r\n" : "\n";
    const icons = [
      "<!-- seo:icons -->",
      '  <link rel="icon" href="/favicon.ico" sizes="any">',
      '  <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">',
      '  <link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png">',
      '  <link rel="apple-touch-icon" href="/apple-touch-icon.png">',
      '  <link rel="manifest" href="/site.webmanifest">',
      "  <!-- /seo:icons -->"
    ].join(eol);
    let withIcons = h.replace(/[ \t]*<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>\r?\n?/gi, (tag) => (/seo:icons/.test(h) ? tag : ""));
    withIcons = /<!-- seo:icons -->[\s\S]*?<!-- \/seo:icons -->/.test(withIcons)
      ? withIcons.replace(/<!-- seo:icons -->[\s\S]*?<!-- \/seo:icons -->/, () => icons)
      : withIcons.replace(/<\/head>/i, () => `  ${icons}${eol}</head>`);
    if (withIcons !== h) { h = withIcons; stats.icons++; }
  }

  // 1. Google tag placeholder id
  if (h.includes("gtag/js?id=G-XXXXXXXXXX")) {
    h = h.split("gtag/js?id=G-XXXXXXXXXX").join(`gtag/js?id=${GA_ID}`);
    stats.gtag++;
  }

  // 4. Folder-number prefixes in descriptions ("From the 01 01 Sikh Gurus collection")
  const cleaned = h.replace(/(From the )(?:\d{2}[a-z]?\d*(?: \d{2}[a-z]?\d*)*) (?=[A-Z][^"<]{0,60} collection)/g, "$1");
  if (cleaned !== h) { h = cleaned; stats.desc++; }

  if (!noindex) {
    // 2. <div class="hero-title"> -> <h1 class="hero-title"> when the page has no <h1>
    if (!/<h1[\s>]/i.test(h) && /<div class="hero-title">[\s\S]*?<\/div>/.test(h)) {
      h = h.replace(/<div class="hero-title">([\s\S]*?)<\/div>/, '<h1 class="hero-title">$1</h1>');
      stats.h1++;
    }

    // 5. loading="lazy" for every image after the first
    let imgIndex = 0;
    const lazied = h.replace(/<img\b([^>]*)>/gi, (tag, attrs) =>
      imgIndex++ === 0 || /\bloading=/i.test(attrs) ? tag : `<img loading="lazy"${attrs}>`);
    if (lazied !== h) { h = lazied; stats.lazy++; }

    // 7. Canonical / og:url / hreflang addresses
    const fixedUrls = fixPageUrls(h, rel);
    if (fixedUrls !== h) { h = fixedUrls; stats.urls++; }

    // 8. Share images (og:image / twitter:image) that point at a file this
    // site doesn't have, or at a web page, fall back to the site's default
    // share image. A broken image breaks link previews and structured data.
    const fixedImages = h.replace(/(<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["'])([^"']+)(["'])/gi, (m, a, src, z) => {
      const url = decodeEntities(src);
      if (!url.startsWith(SITE + "/")) return m;
      let file; try { file = decodeURI(url.slice(SITE.length + 1)); } catch { return m; }
      const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(file);
      return isImage && fs.existsSync(path.join(ROOT, file)) ? m : a + DEFAULT_IMAGE + z;
    });
    if (fixedImages !== h) { h = fixedImages; stats.images++; }

    // 3. JSON-LD structured data
    const head = (h.match(/<head[\s\S]*?<\/head>/i) || [""])[0];
    const title = (head.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "";
    const name = shortTitle(title) || prettyName(path.basename(rel));
    const description = decodeEntities(metaContent(head, "name", "description"));
    // Attribute values are HTML-escaped ("&amp;"); JSON-LD needs the real URL.
    const image = decodeEntities(metaContent(head, "property", "og:image"));
    const lang = (h.match(/<html[^>]+lang=["']([^"']+)["']/i) || [])[1] || (rel.startsWith("hi/") ? "hi" : rel.startsWith("pa/") ? "pa" : "en");
    const url = pageUrl(rel);
    const isHome = rel === "index.html" || rel === "hi/index.html" || rel === "pa/index.html";

    const webPage = {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name,
      inLanguage: lang,
      isPartOf: { "@id": `${SITE}/#website` },
      publisher: { "@id": `${SITE}/#organization` }
    };
    if (description) webPage.description = description;
    if (image) webPage.primaryImageOfPage = { "@type": "ImageObject", url: image };    const graph = [ORG, WEBSITE, webPage];
    if (!isHome) {
      const crumbs = { "@id": `${url}#breadcrumb`, ...breadcrumbs(rel, name, titleByRel) };
      webPage.breadcrumb = { "@id": crumbs["@id"] };
      graph.push(crumbs);
    }

    const eol = p.html.includes("\r\n") ? "\r\n" : "\n";
    const block = `<!-- seo:jsonld -->${eol}  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>${eol}  <!-- /seo:jsonld -->`;
    const withLd = /<!-- seo:jsonld -->[\s\S]*?<!-- \/seo:jsonld -->/.test(h)
      ? h.replace(/<!-- seo:jsonld -->[\s\S]*?<!-- \/seo:jsonld -->/, () => block)
      : h.replace(/<\/head>/i, () => `  ${block}${eol}</head>`);
    if (withLd !== h) { h = withLd; stats.jsonld++; }

    indexable.push(rel);
  }

  // Keep the file's own line endings (Windows checkouts use CRLF).
  if (p.html.includes("\r\n")) h = h.replace(/\r?\n/g, "\r\n");

  if (h !== p.html) {
    stats.changedFiles++;
    if (!DRY) fs.writeFileSync(p.file, h);
  }
}

/* ───────────── sitemap.xml ───────────── */

const indexableSet = new Set(indexable);

// en page <-> hi/pa page pairs, read from each English page's hreflang links.
const pageByRel = new Map(pages.map((p) => [p.rel, p]));
function alternates(rel) {
  const p = pageByRel.get(rel);
  const links = [...(p.html.match(/<link[^>]+hreflang=["'][^"']+["'][^>]*>/gi) || [])]
    .map((tag) => ({ lang: (tag.match(/hreflang=["']([^"']+)["']/i) || [])[1], href: (tag.match(/href=["']([^"']+)["']/i) || [])[1] }))
    .filter((l) => l.lang && l.href && l.href.startsWith(SITE));
  // Only keep alternates whose target page exists and is indexable.
  return links.filter((l) => indexableSet.has(decodeURI(l.href.slice(SITE.length + 1)) || "index.html"));
}

const xml = ['<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
for (const rel of indexable.sort()) {
  xml.push("  <url>");
  xml.push(`    <loc>${pageUrl(rel).replace(/&/g, "&amp;")}</loc>`);
  xml.push(`    <lastmod>${dates.get(rel) || today}</lastmod>`);
  for (const alt of alternates(rel)) xml.push(`    <xhtml:link rel="alternate" hreflang="${alt.lang}" href="${alt.href.replace(/&/g, "&amp;")}"/>`);
  xml.push("  </url>");
}
xml.push("</urlset>", "");
if (!DRY) fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml.join("\n"));

console.log(`${DRY ? "[dry run] " : ""}Scanned ${pages.length} pages; ${stats.changedFiles} files ${DRY ? "would change" : "changed"}.`);
console.log(`  Google tag id fixed:      ${stats.gtag}`);
console.log(`  <h1> added:               ${stats.h1}`);
console.log(`  JSON-LD added/updated:    ${stats.jsonld}`);
console.log(`  Descriptions cleaned:     ${stats.desc}`);
console.log(`  Pages with lazy images:   ${stats.lazy}`);
console.log(`  Pages set to noindex:     ${stats.noindex}`);
console.log(`  Page URLs fixed:          ${stats.urls}`);
console.log(`  Share images fixed:       ${stats.images}`);
console.log(`  Favicon links added:      ${stats.icons}`);
console.log(`  Sitemap URLs:             ${indexable.length}`);
