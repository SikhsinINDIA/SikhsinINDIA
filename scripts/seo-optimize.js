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
// Also the unlinked home-page drafts in 100-misc (index1.html, sikhs-in-india-posterN.html).
const NOINDEX_BASE_RE = /(^|\/)old\/| - copy\.html$|-old\d*\.html$|(^|\/)test\d*\.html$|workinprogress|^99 shortcuts\/|^100-misc\/(index\d+|sikhs-in-india-poster\d*)\.html$/i;
// Older copies that nothing links to any more (in every language), each
// superseded by the page named in its comment, plus the Drive photo-upload tool.
const SUPERSEDED = [
  "01-about-sikhism/01-01-sikh-gurus.html", // -> 01-01-sikh-gurus/01-01-sikh-gurus.html
  "01-about-sikhism/01-01-sikh-gurus/01-01-06-guru-har-gobind-ji/01-01-06-05-guru-hargobind-sahib-ji-jyoti-jot-diwas-greetings.html", // -> ...-joti-jot-diwas-greetings.html
  "01-about-sikhism/01-06-sikh-legends/01-06-03-baba-banda-singh-bahadur-ji/01-06-03-baba-banda-singh-bahadur-ji-shaheedi-diwas.html", // -> 01-06-03-01-baba-banda-singh-bahadur-ji-shaheedi-diwas.html
  "02-sikh-heritage/02-02-discover-culture/02-11-sikh-greetings/02-11-06-inspirational.html", // -> 02-11-06-gyan.html
  "02-sikh-heritage/02-02-discover-culture/02-11-sikh-greetings/02-11-04-inspirational/02-11-04-01-inspirational.html", // -> 02-11-04-sabr.html
  "01-about-sikhism/01-01-sikh-gurus/01-01-11-guru-granth-sahib-ji/01-01-11-02-guru-granth-sahib-ji-first-prakash.html", // hi/pa only -> ...-first-prakash-greetings.html
  "100-misc/Photo Upload.html"
].map((p) => p.toLowerCase());
const NOINDEX_RE = {
  test: (rel) => NOINDEX_BASE_RE.test(rel) || SUPERSEDED.includes(rel.replace(/^(hi|pa)\//, "").toLowerCase())
};
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
    // Prefer "<folder>/<folder>.html" (the section index the site links to),
    // then "<folder>.html" beside it; never a noindex page.
    const inside = [...parts.slice(0, i + 1), parts[i] + ".html"].join("/");
    const beside = [...parts.slice(0, i), parts[i] + ".html"].join("/");
    // noindexRels also covers pages marked noindex in their own HTML, such as
    // the redirect pages left at old addresses.
    const candidate = [inside, beside].find((c) => c !== rel && titleByRel.has(c) && !noindexRels.has(c));
    if (candidate) trail.push({ name: titleByRel.get(candidate), url: pageUrl(candidate) });
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
    // A canonical (or og:url) pointing at a page that no longer exists
    // (renamed or removed) falls back to this page's own address.
    if (href.startsWith(SITE + "/")) {
      let target; try { target = decodeURI(href.slice(SITE.length + 1)) || "index.html"; } catch { return own; }
      if (target.endsWith("/")) target += "index.html";
      if (!fs.existsSync(path.join(ROOT, target.split("#")[0].split("?")[0]))) return own;
    }
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

// Pages that are (or will be) noindex, and each page's <html lang>, for the
// hreflang step: only indexable language versions are listed as alternates.
const noindexRels = new Set(pages.filter((p) => NOINDEX_RE.test(p.rel) || /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(p.html)).map((p) => p.rel));
const relSet = new Set(pages.map((p) => p.rel));
const langOf = new Map(pages.map((p) => [p.rel, ((p.html.match(/<html[^>]+lang=["']([^"']+)["']/i) || [])[1] || "").toLowerCase()]));

// 12. hreflang: the page's English / Hindi / Punjabi versions (whichever exist
// and are indexable, always including the page itself) plus x-default =
// the English version, or this page when there is none.
function hreflangLinks(rel) {
  const base = rel.replace(/^(hi|pa)\//, "");
  const variants = [];
  for (const [prefix, fallback] of [["", "en"], ["hi/", "hi"], ["pa/", "pa"]]) {
    const r = prefix + base;
    if (!relSet.has(r) || (noindexRels.has(r) && r !== rel)) continue;
    // English-folder pages use their own <html lang> (a few are in Punjabi);
    // hi/ and pa/ pages are always hi / pa.
    const lang = prefix ? fallback : (langOf.get(r) || "en").split("-")[0];
    if (variants.some((v) => v.lang === lang)) continue;
    variants.push({ lang, url: r === "index.html" ? `${SITE}/` : pageUrl(r) });
  }
  if (!variants.some((v) => v.url === pageUrl(rel) || (rel === "index.html" && v.url === `${SITE}/`))) return null;
  const xDefault = relSet.has(base) && !noindexRels.has(base) ? (base === "index.html" ? `${SITE}/` : pageUrl(base)) : (rel === "index.html" ? `${SITE}/` : pageUrl(rel));
  return [...variants.map((v) => ({ lang: v.lang, url: v.url })), { lang: "x-default", url: xDefault }];
}

const titleByRel = new Map();
for (const p of pages) {
  const t = (p.html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
  if (t) titleByRel.set(p.rel, shortTitle(t));
}

const stats = { gtag: 0, h1: 0, jsonld: 0, desc: 0, lazy: 0, noindex: 0, urls: 0, images: 0, icons: 0, alts: 0, zoom: 0, hreflang: 0, homeLinks: 0, titles: 0, changedFiles: 0 };
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

  // 10. Gallery lightbox: <img id="lightbox-img" src="" alt=""> is filled in by
  // JavaScript when a photo is opened, but SEO checkers read the empty alt as
  // missing. Give it a description in the page's language.
  {
    const lang = rel.startsWith("hi/") ? "hi" : rel.startsWith("pa/") ? "pa" : "en";
    const altText = { en: "Enlarged view of the selected picture", hi: "चुनी गई तस्वीर का बड़ा दृश्य", pa: "ਚੁਣੀ ਹੋਈ ਤਸਵੀਰ ਦਾ ਵੱਡਾ ਦ੍ਰਿਸ਼" }[lang];
    const withAlt = h.replace(/<img\b[^>]*\bid=["']lightbox-img["'][^>]*>/gi, (tag) =>
      /\balt\s*=\s*(["'])\s*\1/i.test(tag) ? tag.replace(/\balt\s*=\s*(["'])\s*\1/i, `alt="${altText}"`)
        : /\balt\s*=/i.test(tag) ? tag : tag.replace(/<img\b/i, `<img alt="${altText}"`));
    if (withAlt !== h) { h = withAlt; stats.alts++; }
  }

  // 11. Viewport: never block pinch-zoom. "maximum-scale=1, user-scalable=no"
  // stops people enlarging small text, and mobile-friendliness checks flag it.
  {
    const fixedViewport = h.replace(/(<meta[^>]+name=["']viewport["'][^>]*content=["'])([^"']*)(["'])/i, (m, a, content, z) => {
      const kept = content.split(",").map((s) => s.trim()).filter((s) => s && !/^(maximum-scale|minimum-scale|user-scalable)\s*=/i.test(s));
      const next = kept.join(", ");
      return next === content ? m : a + next + z;
    });
    if (fixedViewport !== h) { h = fixedViewport; stats.zoom++; }
  }

  // 13. Links to the home page use "/" rather than ".../index.html", so crawlers
  // only ever see https://sikhsinindia.com/ (its canonical and hreflang URL).
  // A second address for the same page shows up as an hreflang conflict.
  {
    const dir = path.posix.dirname(rel);
    const toRoot = h.replace(/(<a\b[^>]*\shref=["'])([^"']+)(["'])/gi, (m, a, href, z) => {
      if (/^[a-z]+:|^#|^\/\//i.test(href) && !href.startsWith(SITE + "/")) return m;
      const [pathPart, ...rest] = href.split(/(?=[?#])/);
      let target;
      if (pathPart.startsWith(SITE + "/")) target = pathPart.slice(SITE.length + 1);
      else if (pathPart.startsWith("/")) target = pathPart.slice(1);
      else target = path.posix.normalize(path.posix.join(dir, pathPart));
      return target === "index.html" ? a + "/" + rest.join("") + z : m;
    });
    if (toRoot !== h) { h = toRoot; stats.homeLinks++; }
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
    // 2. <div class="hero-title"> -> <h1 class="hero-title"> when the page has no
    // <h1>. Only real markup counts: an "<h1" inside a comment or script must
    // not stop this, and a hero-title inside a comment is never converted.
    const visible = h.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[\s\S]*?<\/script>/gi, "");
    if (!/<h1[\s>]/i.test(visible)) {
      const comments = [...h.matchAll(/<!--[\s\S]*?-->/g)].map((m) => [m.index, m.index + m[0].length]);
      const inComment = (i) => comments.some(([a, b]) => i >= a && i < b);
      const hero = [...h.matchAll(/<div class="hero-title">([\s\S]*?)<\/div>/g)].find((m) => !inComment(m.index));
      if (hero) {
        h = h.slice(0, hero.index) + `<h1 class="hero-title">${hero[1]}</h1>` + h.slice(hero.index + hero[0].length);
        stats.h1++;
      }
    }

    // 5. loading="lazy" for every image after the first
    let imgIndex = 0;
    const lazied = h.replace(/<img\b([^>]*)>/gi, (tag, attrs) =>
      imgIndex++ === 0 || /\bloading=/i.test(attrs) ? tag : `<img loading="lazy"${attrs}>`);
    if (lazied !== h) { h = lazied; stats.lazy++; }

    // 7. Canonical / og:url / hreflang addresses
    const fixedUrls = fixPageUrls(h, rel);
    if (fixedUrls !== h) { h = fixedUrls; stats.urls++; }
  } else {
    // Hidden (noindex) pages still need valid canonical/og:url addresses.
    const fixedUrls = fixPageUrls(h, rel);
    if (fixedUrls !== h) { h = fixedUrls; stats.urls++; }
  }
  if (!noindex) {

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

    // 14. Titles over 70 characters (search results cut them off): drop the
    // " | SikhsInIndia.com" ending (Google shows the site name anyway); if
    // still too long, "Name, Town | District, State" -> "Name, Town, State".
    // og:title / twitter:title follow when they matched the old title.
    {
      const m = h.match(/<title>([\s\S]*?)<\/title>/i);
      if (m) {
        const oldTitle = m[1];
        const len = (s) => [...decodeEntities(s).replace(/\s+/g, " ").trim()].length;
        let next = oldTitle;
        if (len(next) > 70) next = next.replace(/\s*[|–-]\s*SikhsInIndia\.com\s*$/i, "");
        if (len(next) > 70) {
          const parts = next.match(/^(.*),\s*([^,|]+?)\s*\|\s*([^,|]+?),\s*([^,|]+)$/);
          if (parts) next = `${parts[1]}, ${parts[2]}, ${parts[4]}`;
        }
        if (next !== oldTitle) {
          h = h.replace(m[0], `<title>${next}</title>`);
          for (const key of ["og:title", "twitter:title"]) {
            h = h.replace(new RegExp(`(<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["'])([^"']*)(["'])`, "i"),
              (mm, a, val, z) => (val === oldTitle ? a + next + z : mm));
          }
          stats.titles++;
        }
      }
    }

    // 12. hreflang alternates (replaces any existing set)
    {
      const links = hreflangLinks(rel);
      if (links) {
        const eol = p.html.includes("\r\n") ? "\r\n" : "\n";
        const block = links.map((l) => `  <link rel="alternate" hreflang="${l.lang}" href="${escAttr(l.url)}">`).join(eol);
        const existing = /[ \t]*<link[^>]+hreflang=["'][^"']+["'][^>]*>[ \t]*(\r?\n)?/gi;
        let withLang;
        if (existing.test(h)) {
          let first = true;
          withLang = h.replace(existing, () => { if (first) { first = false; return block + eol; } return ""; });
        } else if (/<link[^>]+rel=["']canonical["'][^>]*>/i.test(h)) {
          withLang = h.replace(/(<link[^>]+rel=["']canonical["'][^>]*>)/i, (m) => m + eol + block);
        } else {
          withLang = h.replace(/<\/head>/i, () => block + eol + "</head>");
        }
        if (withLang !== h) { h = withLang; stats.hreflang++; }
      }
    }

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
console.log(`  Lightbox alt text added:  ${stats.alts}`);
console.log(`  Pinch-zoom re-enabled:    ${stats.zoom}`);
console.log(`  hreflang sets updated:    ${stats.hreflang}`);
console.log(`  Home links set to "/":   ${stats.homeLinks}`);
console.log(`  Long titles shortened:    ${stats.titles}`);
console.log(`  Sitemap URLs:             ${indexable.length}`);
