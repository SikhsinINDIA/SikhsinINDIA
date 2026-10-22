/* ──────────────────────────────────────────────────────────────
   Related reading - contextual links between related pages
   Adds a "Related reading" block (between <!-- seo:reading --> and
   <!-- /seo:reading -->) that ties the site's topics together:

     Sikh Gurus      -> the Guru's life story, the Gurus before and after,
                        Gurudwaras connected to the Guru, the Guru's days
                        in Sikh History, banis and traditions
     Gurudwaras      -> the Gurus named on the page, the Takht it is
     Sikh History    -> the Gurus, festivals and people the day is about
     Festivals       -> their history, Gurus, Gurudwaras and history days
     Nitnem / Gurbani-> the other banis, their Gurus and the Guru Granth Sahib
     Panj Takhts, Panj Pyare, Sahibzaade, Chali Mukte -> the same

   Link text is always the target page's own name ("Life story of Guru
   Amar Das Ji", "23 May: Prakash Purab of Guru Amar Das Ji"), never
   "click here". Links already on the page are not repeated. The Hindi
   and Punjabi copies get the same links to their own-language pages.
   The block sits after the "Explore nearby" block, else before the footer.

   Re-run after adding pages, or after build-sikh-history-pages.js:
     node scripts/related-links.js          (--dry: report only, --list: name files)
   ────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const LIST = process.argv.includes('--list');
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', '.github', '.cursor', 'scripts', 'data', 'css', 'js',
  'fonts', 'pictures', 'images', '00-index', '99 Shortcuts', 'cloudflare-worker', 'hi', 'pa']);

const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => {
  const rel = d ? d + '/' + e.name : e.name;
  if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walk(rel);
  return e.name.endsWith('.html') ? [rel] : [];
});
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&quot;/g, '"')
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&nbsp;/g, ' ');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// "GURU AMAR DAS JI" -> "Guru Amar Das Ji"; mixed-case titles stay as written.
const tidy = (t) => (/[a-z]/.test(t) ? t : t.toLowerCase().replace(/(^|[\s(\-–/])(\S)/g, (m, a, c) => a + c.toUpperCase()));

const pageCache = new Map();
function page(rel) {
  if (pageCache.has(rel)) return pageCache.get(rel);
  let p = null;
  if (exists(rel)) {
    const html = read(rel);
    const head = html.split(/<\/head>/i)[0];
    const robots = (head.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)/i) || [])[1] || '';
    const title = decode(((head.match(/<title>([^<]*)<\/title>/i) || [])[1] || '').trim())
      .replace(/\s+[|]\s+.*$/, '').replace(/\s+-\s+Sikh Festivals$/, '').trim();
    const desc = decode((head.match(/<meta[^>]+name=["']description["'][^>]*content=(["'])(.*?)\1/i) || [])[2] || '');
    p = { rel, html, title: tidy(title), desc, indexable: !/noindex/i.test(robots) };
  }
  pageCache.set(rel, p);
  return p;
}

// Every page this page already links to (site-relative paths).
function linkedFrom(rel, html) {
  const body = (html.split(/<body[^>]*>/i)[1] || '').replace(/<!-- seo:reading -->[\s\S]*?<!-- \/seo:reading -->/, '');
  const out = new Set();
  for (const m of body.matchAll(/<a\s[^>]*href=["']([^"'#?]+)/gi)) {
    let h = m[1];
    if (/^https?:\/\/(www\.)?sikhsinindia\.com\//i.test(h)) h = h.replace(/^https?:\/\/[^/]+\//, '');
    else if (/^[a-z]+:/i.test(h)) continue;
    else h = h.startsWith('/') ? h.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(rel), h));
    out.add(h === '' ? 'index.html' : h);
  }
  return out;
}

/* ── The Gurus ── */
const GURU_DIR = '01-about-sikhism/01-01-sikh-gurus';
const GURUS = [
  ['Guru Nanak Dev Ji', 'First', '01-01-01-guru-nanak-dev-ji', /Guru Nanak/i],
  ['Guru Angad Dev Ji', 'Second', '01-01-02-guru-angad-dev-ji', /Guru Angad/i],
  ['Guru Amar Das Ji', 'Third', '01-01-03-guru-amar-das-ji', /Guru Amar ?das/i],
  ['Guru Ram Das Ji', 'Fourth', '01-01-04-guru-ram-das-ji', /Guru Ram ?das/i],
  ['Guru Arjan Dev Ji', 'Fifth', '01-01-05-guru-arjan-dev-ji', /Guru Arjan/i],
  ['Guru Hargobind Sahib Ji', 'Sixth', '01-01-06-guru-har-gobind-ji', /Guru Hari? ?gobind/i],
  ['Guru Har Rai Ji', 'Seventh', '01-01-07-guru-har-rai-ji', /Guru Har ?Rai/i],
  ['Guru Harkrishan Sahib Ji', 'Eighth', '01-01-08-guru-har-krishan-ji', /Guru Har ?K(r|ri)ishan/i],
  ['Guru Tegh Bahadur Ji', 'Ninth', '01-01-09-guru-tegh-bahadur-ji', /Guru Teg(h)? Bahadur/i],
  ['Guru Gobind Singh Ji', 'Tenth', '01-01-10-guru-gobind-singh-ji', /Guru Gobind Singh/i],
].map(([name, ord, dir, re], i) => {
  const folder = `${GURU_DIR}/${dir}`;
  const life = fs.readdirSync(path.join(ROOT, folder)).filter((f) => /life-story/.test(f)).sort()[0];
  return { i, name, ord, folder, re, hub: `${folder}/${dir}.html`, life: life && `${folder}/${life}` };
});
const GGS = `${GURU_DIR}/01-01-11-guru-granth-sahib-ji/01-01-11-01-guru-granth-sahib-ji.html`;
const guruLink = (g) => ({ to: g.hub, text: `${g.name}, the ${g.ord} Sikh Guru` });
const gurusIn = (text) => GURUS.filter((g) => g.re.test(text));

/* ── Gurudwaras: every detail page under 04-gurudwaras (not the lists) ── */
const allPages = walk('');
const gurudwaras = allPages.filter((f) => f.startsWith('04-gurudwaras/') && !/gurd?u?waras-in|-old\.html$/i.test(f))
  .map(page).filter((p) => p && p.indexable && !/^Gurud?waras in/i.test(p.title));
function gw(re) {
  const p = gurudwaras.find((x) => re.test(x.title));
  if (!p) console.warn('  (no Gurudwara page matches ' + re + ')');
  return p ? { to: p.rel, text: p.title } : null;
}

/* ── Sikh History days ── */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const days = JSON.parse(read('data/sikh-history.json')).map((r) => {
  const m = parseInt(r.date.slice(0, 2), 10) - 1, d = parseInt(r.date.slice(3), 10);
  return { ...r, rel: `sikh-history/${MONTHS[m].toLowerCase()}-${d}.html`, when: `${d} ${MONTHS[m]}` };
});
// Days whose main event (first) or another event that day (after) matches;
// headlineOnly ignores the main event's detail text.
function daysAbout(re, max = 6, headlineOnly = false) {
  const about = (r) => re.test(headlineOnly ? r.title : r.title + ' ' + r.detail);
  const main = days.filter(about)
    .map((r) => ({ to: r.rel, text: `${r.when}: ${r.title}` }));
  const also = days.filter((r) => !about(r))
    .flatMap((r) => (r.more || []).filter((e) => re.test(e.title)).slice(0, 1)
      .map((e) => ({ to: r.rel, text: `${r.when}: ${e.title}` })));
  return [...main, ...also].slice(0, max);
}

/* ── Fixed pages ── */
const P = (rel, text) => (exists(rel) ? { to: rel, text } : (console.warn('  (missing ' + rel + ')'), null));
const FEST = '02-sikh-heritage/02-02-discover-culture/02-02-01-sikh-festivals';
const TAKHT = '01-about-sikhism/01-05-panj-takhts';
const L = {
  vaisakhi: P(`${FEST}/02-02-01-04-01-Baisakhi-E1.html`, 'Vaisakhi: the birth of the Khalsa Panth'),
  hola: P(`${FEST}/02-02-01-03-hola-mohalla.html`, 'Hola Mohalla'),
  maghi: P(`${FEST}/02-02-01-05-maghi.html`, 'Maghi: Jorh Mela of Sri Muktsar Sahib'),
  bandiChhor: P(`${FEST}/02-02-01-06-bandi-chhor-diwas.html`, 'Bandi Chhor Diwas'),
  khalsaDarbar: P(`${FEST}/02-02-01-06a-khalsa-darbar-dussehra.html`, 'Khalsa Darbar and Dussehra'),
  chetSangrand: P(`${FEST}/02-02-01-01-01-chet-sangrand-sikh-new-year.html`, 'Chet Sangrand: the Sikh New Year'),
  lohri: P(`${FEST}/02-02-01-02-01-lohri.html`, 'Lohri'),
  festivals: P(`${FEST}/02-02-01-sikh-festivals.html`, 'All Sikh festivals'),
  calendar: P(`${FEST}/02-02-01b-view-calendar.html`, 'Sikh festivals calendar'),
  history: P('sikh-history.html', 'Sikh History: important events for every day of the year'),
  panjPyare: P('01-about-sikhism/01-02-panj-pyaras.html', 'The Panj Pyare, the Five Beloved Ones'),
  sahibzaade: P('01-about-sikhism/01-03-chaar-sahibjade.html', 'The Chaar Sahibzaade'),
  chaliMukte: P('01-about-sikhism/01-04-chali-mukte.html', 'The Chali Mukte, the Forty Liberated Ones'),
  takhts: P(`${TAKHT}/01-05-00-panj-takhts.html`, 'The Panj Takhts, the five seats of Sikh authority'),
  akalTakht: P(`${TAKHT}/01-05-01-akal-takht-sahib.html`, 'Sri Akal Takht Sahib'),
  keshgarh: P(`${TAKHT}/01-05-02-keshgarh-sahib.html`, 'Takht Sri Keshgarh Sahib, Anandpur Sahib'),
  damdama: P(`${TAKHT}/01-05-03-damdama-sahib.html`, 'Takht Sri Damdama Sahib, Talwandi Sabo'),
  patna: P(`${TAKHT}/01-05-04-patna-sahib.html`, 'Takht Sri Patna Sahib'),
  hazur: P(`${TAKHT}/01-05-05-hazur-sahib.html`, 'Takht Sri Hazur Sahib, Nanded'),
  ggs: P(GGS, 'Sri Guru Granth Sahib Ji, the eternal Guru'),
  nitnem: P('03-nitnem/03-nitnem-path.html', 'Nitnem: the daily Sikh prayers and banis'),
  nitnemPdf: P('03-nitnem/03-03-nitnem-path.html', 'Nitnem path in Punjabi, Hindi and English (PDF)'),
  moolMantar: P('03-nitnem/03-01-mool-mantra.html', 'The Mool Mantar: meaning and significance'),
  ardaas: P('03-nitnem/03-02-ardaas.html', 'Ardaas, the Sikh prayer of supplication'),
  sukhmani: P('03-nitnem/03-05-Sukhmani-Sahib/03-05-sukhmani-sahib.html', 'Sukhmani Sahib, the Psalm of Peace'),
  sehajPath: P('03-nitnem/03-04-Sehaj-Path/Sehaj-Path.html', 'Sehaj Path: reading the Guru Granth Sahib at your own pace'),
  akhandPath: P('03-nitnem/03-06-akhand-path/03-06-akhand-path.html', 'Akhand Path: the continuous reading'),
  shabadSearch: P('03-nitnem/03-07-shabad-search.html', 'Search a Shabad or kirtan'),
  sggsReader: P('03-nitnem/03-08-sri-guru-granth-sahib.html', 'Read Sri Guru Granth Sahib Ji online, Ang 1 to 1430'),
  hukamnama: P('hukamnama.html', "Today's Hukamnama from Sri Harmandir Sahib"),
  fiveKs: P('02-sikh-heritage/02-01-discover-sikhi/02-01-02-5ks.html', 'The Five Ks of Sikhism'),
};
const G = Object.fromEntries(GURUS.map((g, i) => [i + 1, guruLink(g)]));
const GW = {
  darbarSahib: gw(/Darbar Sahib Ji .*Golden Temple/i),
  ramsar: gw(/Ramsar Sahib/i),
  goindwal: gw(/Sri Goindwal Sahib, Tarn Taran/i),
  khadoor: gw(/Gurdwara Sri Khadoor Sahib/i),
  kesgarh: gw(/Kesgarh Sahib, Anandpur/i),
  anandpur: gw(/Gurudwara Anandpur Sahib Ji/i),
  qilaFatehgarh: gw(/Qila Fatehgarh Sahib, Anandpur/i),
  bandiChhor: gw(/Data Bandi Chod Sahib, Gwalior/i),
  patnaSahib: gw(/Harmandir Sahib Ji, Patna/i),
  hazurSahib: gw(/Hazur Sahib/i),
  damdamaSahib: gw(/Damdama Sahib.*(Bathinda|Bhatinda|Talwandi)/i),
  fatehgarhSahib: gw(/Sri Fathegarh Sahib, Fatehgarh Sahib/i),
  garhiSahib: gw(/Garhi Sahib Ji, Chamkaur/i),
  bangla: gw(/Bangla Sahib/i),
  sisGanj: gw(/Sis Ganj Sahib/i),
  rakabGanj: gw(/Rakab Ganj Sahib/i),
  paonta: gw(/Paonta Sahib Ji - Sirmaur/i),
  bhangani: gw(/Bhangani Sahib, Bhangani/i),
  babaBakala: gw(/Baba Bakala Sahib/i),
};

// Hand-picked links for a topic, then its days in Sikh History.
const S = (heading, links) => ({ heading, links: links.filter(Boolean) });
const TOPICS = {
  vaisakhi: () => [
    S('The history behind Vaisakhi', [G[10], L.panjPyare, L.keshgarh, GW.kesgarh, GW.anandpur, G[3], L.fiveKs]),
    S('Vaisakhi in Sikh History', daysAbout(/Vaisakhi|Baisakhi|creation of the Khalsa|Khalsa Sajna/i, 4, true)),
  ],
  hola: () => [
    S('The history behind Hola Mohalla', [G[10], L.keshgarh, GW.kesgarh, GW.qilaFatehgarh, GW.anandpur, L.vaisakhi]),
    S('Hola Mohalla in Sikh History', daysAbout(/Hola Mohalla|Holla Mohalla/i, 4, true)),
  ],
  maghi: () => [
    S('The history behind Maghi', [L.chaliMukte, G[10], L.damdama, GW.damdamaSahib, L.lohri]),
    S('Maghi in Sikh History', daysAbout(/Muktsar|Khidrana|Chali Mukte|Forty Mukte|Mai Bhago/i, 4)),
  ],
  bandiChhor: () => [
    S('The history behind Bandi Chhor Diwas', [G[6], GW.bandiChhor, L.akalTakht, GW.darbarSahib, L.khalsaDarbar]),
    S('Bandi Chhor Diwas in Sikh History', daysAbout(/Bandi Chhor|Bandi Chhod|Gwalior/i, 4, true)),
  ],
  khalsaDarbar: () => [S('Related history', [G[10], L.panjPyare, L.vaisakhi, L.bandiChhor, L.takhts])],
  newYear: () => [S('Related reading', [L.calendar, L.history, L.vaisakhi, L.maghi, L.lohri])],
  lohri: () => [S('Related reading', [L.maghi, L.chaliMukte, L.calendar, L.chetSangrand])],
  festivals: () => [S('More Sikh festivals', [L.vaisakhi, L.hola, L.bandiChhor, L.maghi, L.khalsaDarbar, L.chetSangrand, L.lohri, L.calendar])],

  moolMantar: () => [S('Gurbani and prayer', [G[1], L.nitnem, L.nitnemPdf, L.ardaas, L.sggsReader, L.ggs])],
  ardaas: () => [S('Remembered in the Ardaas', [L.panjPyare, L.sahibzaade, L.chaliMukte, L.takhts]), S('Gurbani and prayer', [L.nitnem, L.moolMantar, L.sukhmani])],
  nitnemPdf: () => [S('Gurbani and prayer', [L.nitnem, L.moolMantar, L.ardaas, L.sukhmani, L.sggsReader, G[1], G[10]])],
  nitnem: () => [S('The Gurus who wrote the Nitnem banis', [G[1], G[3], G[5], G[10], L.ggs, L.hukamnama])],
  sukhmani: () => [S('Gurbani and prayer', [G[5], GW.ramsar, L.sggsReader, L.sehajPath, L.nitnem, L.ardaas])],
  sehajPath: () => [S('Gurbani and prayer', [L.sggsReader, L.akhandPath, L.ggs, L.shabadSearch, L.nitnem, L.hukamnama])],
  akhandPath: () => [S('Gurbani and prayer', [L.sehajPath, L.sggsReader, L.ggs, L.ardaas, L.sukhmani])],
  shabadSearch: () => [S('Gurbani and prayer', [L.sggsReader, L.hukamnama, L.nitnem, L.ggs, L.sehajPath])],
  sggsReader: () => [S('Gurbani and prayer', [L.ggs, L.shabadSearch, L.hukamnama, L.sehajPath, L.akhandPath, L.nitnem])],

  takhts: () => [S('Gurudwaras of the Panj Takhts', [GW.darbarSahib, GW.kesgarh, GW.damdamaSahib, GW.patnaSahib, GW.hazurSahib, G[6], G[10]])],
  akalTakht: () => [S('Related reading', [G[6], GW.darbarSahib, L.bandiChhor, L.takhts]), S('Sri Akal Takht Sahib in Sikh History', daysAbout(/Akal Takht/i, 4))],
  keshgarh: () => [S('Related reading', [G[10], GW.kesgarh, GW.anandpur, L.vaisakhi, L.hola, L.panjPyare, L.takhts])],
  damdama: () => [S('Related reading', [G[10], GW.damdamaSahib, L.ggs, L.maghi, L.takhts])],
  patna: () => [S('Related reading', [G[10], GW.patnaSahib, G[9], L.takhts])],
  hazur: () => [S('Related reading', [G[10], GW.hazurSahib, L.takhts]), S('Hazur Sahib in Sikh History', daysAbout(/Nanded|Hazur Sahib/i, 4))],
  panjPyare: () => [S('Related reading', [G[10], L.vaisakhi, L.keshgarh, GW.kesgarh, L.fiveKs, L.sahibzaade]), S('The Panj Pyare in Sikh History', daysAbout(/Panj Pyar/i, 4))],
  sahibzaade: () => [S('Related reading', [G[10], GW.garhiSahib, GW.fatehgarhSahib, L.chaliMukte]), S('The Sahibzaade in Sikh History', daysAbout(/Sahibzad|Chamkaur|Fatehgarh|Sirhind|Mata Gujri/i, 5))],
  chaliMukte: () => [S('Related reading', [G[10], L.maghi, L.damdama, L.sahibzaade]), S('The Chali Mukte in Sikh History', daysAbout(/Muktsar|Khidrana|Chali Mukte|Mai Bhago/i, 4))],
};
const T = (k) => TOPICS[k]();

// Which topic a page is about.
const BY_PAGE = {
  [`${FEST}/02-02-01-01-01-chet-sangrand-sikh-new-year.html`]: 'newYear',
  [`${FEST}/02-02-01-01-02-happy-new-year.html`]: 'newYear',
  [`${FEST}/02-02-01-01-03-sikh-happy-new-year.html`]: 'newYear',
  [`${FEST}/02-02-01-02-01-lohri.html`]: 'lohri',
  [`${FEST}/02-02-01-02-02-lohri.html`]: 'lohri',
  [`${FEST}/02-02-01-03-hola-mohalla.html`]: 'hola',
  [`${FEST}/02-02-01-04-01-Baisakhi-E1.html`]: 'vaisakhi',
  [`${FEST}/02-02-01-04-02-Baisakhi-E2.html`]: 'vaisakhi',
  [`${FEST}/02-02-01-04-03-Baisakhi-E3.html`]: 'vaisakhi',
  [`${FEST}/02-02-01-04-04-Baisakhi-P1.html`]: 'vaisakhi',
  [`${FEST}/02-02-01-04-05-Baisakhi.html`]: 'vaisakhi',
  [`${FEST}/02-02-01-05-maghi.html`]: 'maghi',
  [`${FEST}/02-02-01-06-bandi-chhor-diwas.html`]: 'bandiChhor',
  [`${FEST}/02-02-01-06a-khalsa-darbar-dussehra.html`]: 'khalsaDarbar',
  [`${FEST}/02-02-01-sikh-festivals.html`]: 'festivals',
  [`${FEST}/02-02-01b-view-calendar.html`]: 'festivals',
  '03-nitnem/03-01-mool-mantra.html': 'moolMantar',
  '03-nitnem/03-02-ardaas.html': 'ardaas',
  '03-nitnem/03-03-nitnem-path.html': 'nitnemPdf',
  '03-nitnem/03-nitnem-path.html': 'nitnem',
  '03-nitnem/03-05-Sukhmani-Sahib/03-05-sukhmani-sahib.html': 'sukhmani',
  '03-nitnem/03-05-Sukhmani-Sahib/sukhmani-sahib.html': 'sukhmani',
  '03-nitnem/03-04-Sehaj-Path/Sehaj-Path.html': 'sehajPath',
  '03-nitnem/03-04-Sehaj-Path/03-04-sehaj-path.html': 'sehajPath',
  '03-nitnem/03-04-Sehaj-Path/03-04-sehaj-path-audio234.html': 'sehajPath',
  '03-nitnem/03-04-Sehaj-Path/03-04-sehaj-path-video.html': 'sehajPath',
  '03-nitnem/03-06-akhand-path/03-06-akhand-path.html': 'akhandPath',
  '03-nitnem/03-06-akhand-path/03-06-01-request-akhand-path.html': 'akhandPath',
  '03-nitnem/03-06-akhand-path/index.html': 'akhandPath',
  '03-nitnem/03-07-shabad-search.html': 'shabadSearch',
  '03-nitnem/03-08-sri-guru-granth-sahib.html': 'sggsReader',
  [`${TAKHT}/01-05-00-panj-takhts.html`]: 'takhts',
  [`${TAKHT}/01-05-01-akal-takht-sahib.html`]: 'akalTakht',
  [`${TAKHT}/01-05-02-keshgarh-sahib.html`]: 'keshgarh',
  [`${TAKHT}/01-05-03-damdama-sahib.html`]: 'damdama',
  [`${TAKHT}/01-05-04-patna-sahib.html`]: 'patna',
  [`${TAKHT}/01-05-05-hazur-sahib.html`]: 'hazur',
  '01-about-sikhism/01-02-panj-pyaras.html': 'panjPyare',
  '01-about-sikhism/01-03-chaar-sahibjade.html': 'sahibzaade',
  '01-about-sikhism/01-04-chali-mukte.html': 'chaliMukte',
};

// Gurudwaras that are Takhts, or that a festival is about.
const GW_EXTRA = new Map([
  [GW.darbarSahib, [G[3], G[5], L.akalTakht, L.bandiChhor, L.hukamnama]], [GW.kesgarh, [G[10], L.keshgarh, L.vaisakhi, L.hola, L.panjPyare]],
  [GW.anandpur, [G[10], G[9], L.keshgarh, L.vaisakhi, L.hola]], [GW.qilaFatehgarh, [G[10], L.hola]],
  [GW.damdamaSahib, [G[10], L.damdama, L.maghi]], [GW.patnaSahib, [G[10], L.patna]], [GW.hazurSahib, [G[10], L.hazur]],
  [GW.bandiChhor, [G[6], L.bandiChhor]], [GW.ramsar, [G[5], L.sukhmani]],
  [GW.garhiSahib, [G[10], L.sahibzaade]], [GW.fatehgarhSahib, [L.sahibzaade]],
].filter(([k]) => k).map(([k, v]) => [k.to, v]));

// Gurudwaras connected to a Guru: named in the title first, then in the description.
function gurudwarasOf(g, max = 6) {
  const t = gurudwaras.filter((p) => g.re.test(p.title));
  const d = gurudwaras.filter((p) => !g.re.test(p.title) && g.re.test(p.desc))
    .sort((a, b) => a.desc.search(g.re) - b.desc.search(g.re));
  return [...t, ...d].slice(0, max).map((p) => ({ to: p.rel, text: p.title }));
}

const GURU_EXTRA = {
  0: [L.moolMantar, L.nitnem, L.chetSangrand], 2: [L.vaisakhi, GW.goindwal], 1: [GW.khadoor],
  3: [GW.darbarSahib], 4: [L.sukhmani, L.sggsReader, GW.ramsar], 5: [L.bandiChhor, L.akalTakht],
  8: [GW.sisGanj, GW.rakabGanj, GW.babaBakala], 7: [GW.bangla],
  9: [L.vaisakhi, L.panjPyare, L.sahibzaade, L.hola, L.keshgarh, GW.paonta],
};

function sectionsFor(rel) {
  if (BY_PAGE[rel]) return T(BY_PAGE[rel]);

  // A Guru's own pages.
  const g = GURUS.find((x) => rel.startsWith(x.folder + '/'));
  if (g) {
    const prev = GURUS[g.i - 1], next = GURUS[g.i + 1];
    return [
      S(`More about ${g.name}`, [
        { to: g.hub, text: `${g.name}: life, teachings and Gurpurabs` },
        g.life && { to: g.life, text: `Life story of ${g.name}` },
        prev && { to: prev.hub, text: `${prev.name}, the ${prev.ord} Sikh Guru` },
        next && { to: next.hub, text: `${next.name}, the ${next.ord} Sikh Guru` },
        ...(GURU_EXTRA[g.i] || []),
      ]),
      S(`Gurudwaras connected to ${g.name}`, gurudwarasOf(g)),
      S(`${g.name} in Sikh History`, daysAbout(g.re)),
    ];
  }
  if (rel.startsWith(`${GURU_DIR}/01-01-11-guru-granth-sahib-ji/`))
    return [S('Gurbani', [L.sggsReader, L.shabadSearch, L.hukamnama, L.sehajPath, L.akhandPath, L.nitnem, G[5], G[10]])];

  // A Gurudwara: the Gurus it is about, its Takht or festival.
  if (rel.startsWith('04-gurudwaras/')) {
    const p = gurudwaras.find((x) => x.rel === rel);
    if (!p) return [];
    const named = gurusIn(p.title);
    const gs = [...named, ...gurusIn(p.desc).filter((x) => !named.includes(x))].slice(0, 3);
    return [S('Sikh history of this Gurudwara', [...gs.map(guruLink), ...(GW_EXTRA.get(rel) || [])])];
  }

  // A day in Sikh History: the Gurus and topics it is about.
  if (/^sikh-history\/[a-z]+-\d+\.html$/.test(rel)) {
    const r = days.find((x) => x.rel === rel);
    if (!r) return [];
    const text = [r.title, r.detail, ...(r.more || []).map((e) => e.title)].join(' ');
    const links = gurusIn(text).slice(0, 4).map(guruLink);
    const topical = [
      [/Vaisakhi|Baisakhi|Khalsa (Panth )?(was )?(created|founded)|creation of the Khalsa/i, [L.vaisakhi, L.panjPyare]],
      [/Panj Pyar/i, [L.panjPyare]], [/Sahibzad|Chamkaur|Sirhind|Mata Gujri/i, [L.sahibzaade]],
      [/Muktsar|Khidrana|Chali Mukte|Mai Bhago/i, [L.chaliMukte, L.maghi]], [/Bandi Chhor|Gwalior/i, [L.bandiChhor]],
      [/Hola Mohalla/i, [L.hola]], [/Akal Takht/i, [L.akalTakht]], [/Kesgarh|Keshgarh/i, [L.keshgarh]],
      [/Damdama Sahib|Talwandi Sabo/i, [L.damdama]], [/Patna/i, [L.patna]], [/Nanded|Hazur Sahib/i, [L.hazur]],
      [/Guru Granth Sahib|Adi Granth|Pothi/i, [L.ggs]], [/Harmandir Sahib|Darbar Sahib|Golden Temple/i, [GW.darbarSahib]],
    ].filter(([re]) => re.test(text)).flatMap(([, l]) => l);
    return [S('Read more about this day', [...links, ...topical])];
  }
  return [];
}

/* ── Hindi and Punjabi ── */
const LANGS = {
  en: { h2: 'Related reading', h3: null },
  hi: { h2: 'संबंधित लेख', h3: 'और पढ़ें' },
  pa: { h2: 'ਸੰਬੰਧਿਤ ਲੇਖ', h3: 'ਹੋਰ ਪੜ੍ਹੋ' },
};

const CSS = `  <style>
  .seo-reading{max-width:1100px;margin:24px auto 8px;padding:0 16px;font-family:inherit;box-sizing:border-box}
  .seo-reading h2{font-size:17px;margin:0 0 8px;color:#002B6D}
  .seo-reading h3{font-size:14px;margin:14px 0 6px;color:#002B6D}
  .seo-reading ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px 18px}
  .seo-reading a{display:block;padding:8px 0;color:#002B6D;text-decoration:none;border-bottom:1px solid rgba(0,43,109,.12);font-size:14px}
  .seo-reading a:hover{color:#e8830a}
</style>`;

function block(rel, lang, sections) {
  const L10N = LANGS[lang];
  const prefix = lang === 'en' ? '' : lang + '/';
  const me = prefix + rel;
  const already = linkedFrom(me, page(me).html);
  const seen = new Set();
  const out = [];
  for (const s of sections) {
    const items = [];
    for (const l of s.links) {
      const target = prefix + l.to;
      if (target === me || seen.has(target) || already.has(target)) continue;
      const tp = page(target);
      if (!tp || !tp.indexable) continue;
      seen.add(target);
      // Other languages: the target's own title, in that language.
      let text = lang === 'en' ? l.text : tp.title;
      if (text.length > 95) text = text.slice(0, 90).replace(/[\s,;:]+\S*$/, '') + '…';
      const href = path.posix.relative(path.posix.dirname(me), target);
      items.push(`    <li><a href="${href.startsWith('.') ? href : './' + href}">${esc(text)}</a></li>`);
    }
    if (items.length) out.push({ heading: lang === 'en' ? s.heading : L10N.h3, items });
  }
  if (!out.length) return '';
  const lines = ['<!-- seo:reading -->', '<nav class="seo-reading" aria-labelledby="seo-reading-h">', CSS,
    `  <h2 id="seo-reading-h">${L10N.h2}</h2>`];
  // Other languages: one heading, every link in a single list.
  const groups = lang === 'en' ? out : [{ items: out.flatMap((o) => o.items) }];
  groups.forEach((o) => {
    if (o.heading && !(lang === 'en' && groups.length === 1 && o.heading === 'Related reading')) lines.push(`  <h3>${esc(o.heading)}</h3>`);
    lines.push('  <ul>', ...o.items, '  </ul>');
  });
  lines.push('</nav>', '<!-- /seo:reading -->');
  return lines.join('\n');
}

// Where the block goes: after "Explore nearby", else before the footer, else before </main> / </body>.
function place(html, blk) {
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const b = blk.replace(/\n/g, eol);
  const RE = /\s*<!-- seo:reading -->[\s\S]*?<!-- \/seo:reading -->/;
  const clean = html.replace(RE, '');
  if (!blk) return clean;
  const anchors = [
    [/<!-- \/seo:related -->/, 'after'],
    [/(\s*)(<footer[\s>]|<div class="footer"|<div class="footer )/i, 'before'],
    [/(\s*)<\/main>/i, 'before'],
    [/(\s*)<\/body>/i, 'before'],
  ];
  for (const [re, where] of anchors) {
    const m = clean.match(re);
    if (!m) continue;
    if (where === 'after') { const at = m.index + m[0].length; return clean.slice(0, at) + eol + b + clean.slice(at); }
    return clean.slice(0, m.index) + eol + b + clean.slice(m.index);
  }
  return null;
}

// --show <page.html>: print that page's block (and its Hindi/Punjabi copies) and stop.
const SHOW = process.argv[process.argv.indexOf('--show') + 1];
if (process.argv.includes('--show')) {
  const rel = SHOW.replace(/^(hi|pa)\//, '');
  for (const lang of ['en', 'hi', 'pa']) {
    const me = lang === 'en' ? rel : lang + '/' + rel;
    if (page(me)) console.log(`== ${me}\n${block(rel, lang, sectionsFor(rel)).replace(/  <style>[\s\S]*?<\/style>\n/, '') || '(no block)'}\n`);
  }
  process.exit(0);
}

const stats = { changed: 0, withBlock: { en: 0, hi: 0, pa: 0 }, links: 0, noPlace: [] };
for (const rel of allPages) {
  const p = page(rel);
  if (!p || !p.indexable) continue;
  const sections = sectionsFor(rel);
  if (!sections.length) continue;
  for (const lang of ['en', 'hi', 'pa']) {
    const me = lang === 'en' ? rel : lang + '/' + rel;
    const mp = page(me);
    if (!mp || !mp.indexable) continue;
    const blk = block(rel, lang, sections);
    const next = place(mp.html, blk);
    if (next === null) { stats.noPlace.push(me); continue; }
    if (blk) { stats.withBlock[lang]++; stats.links += (blk.match(/<li>/g) || []).length; }
    if (next !== mp.html) {
      stats.changed++;
      if (LIST) console.log('  changes: ' + me);
      if (!DRY) fs.writeFileSync(path.join(ROOT, me), next);
    }
  }
}
console.log(`${DRY ? '[dry run] ' : ''}Related reading: ${stats.changed} files ${DRY ? 'would change' : 'changed'}; ` +
  `blocks on ${stats.withBlock.en} English, ${stats.withBlock.hi} Hindi, ${stats.withBlock.pa} Punjabi pages; ${stats.links} links`);
if (stats.noPlace.length) console.log('  No place for the block: ' + stats.noPlace.join(', '));
