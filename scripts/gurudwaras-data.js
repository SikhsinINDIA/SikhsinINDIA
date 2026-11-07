/*
 * Builds data/gurudwaras.json, the list behind the "Gurudwaras near me" page.
 * Safe to re-run: addresses already placed are read back from
 * data/gurudwaras-geocode.json and only new or changed addresses are looked up.
 *
 *   node scripts/gurudwaras-data.js             extract + geocode new addresses
 *   node scripts/gurudwaras-data.js --offline   extract only, never go online
 *   node scripts/gurudwaras-data.js --refresh   look every address up again
 *   node scripts/gurudwaras-data.js --retry     look up again only the ones not placed
 *   node scripts/gurudwaras-data.js --only=delhi  just pages whose path has "delhi"
 *
 * 1. Every Gurudwara page under 04-gurudwaras/ with an Address fact becomes one
 *    entry: name, address and phone in English, plus the Hindi and Punjabi name
 *    and address from the hi/ and pa/ copies of the same page.
 * 2. Each address is placed on the map, best method first:
 *      a. a Google plus code in the address ("98VC+PPV, Sector 15, Faridabad"),
 *         completed from the locality written after it;
 *      b. the address itself, looked up with OpenStreetMap's Nominatim. The
 *         result must be in the page's state, and the first place name in the
 *         address must be the one found (finding only the district town of
 *         "Village Daraj, Barnala" is not good enough);
 *      c. then, near that point, an OpenStreetMap Gurudwara with a matching name
 *         (it marks the building itself, so it is more exact than the address).
 *    An address none of these can place is flagged in "unplaced" with the
 *    reason, and left off the page. Nothing is guessed.
 *
 * Map data: © OpenStreetMap contributors (ODbL). The page credits it.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://sikhsinindia.com";
const OUT = path.join(ROOT, "data", "gurudwaras.json");
const CACHE = path.join(ROOT, "data", "gurudwaras-geocode.json");
const OFFLINE = process.argv.includes("--offline");
const REFRESH = process.argv.includes("--refresh");
const RETRY = process.argv.includes("--retry");
// --only=faridabad  look up just the pages whose path contains this text
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
// Nominatim's usage policy: an identifying user agent, at most one request a second.
const UA = "SikhsinINDIA-gurudwara-geocoder/1.0 (+https://sikhsinindia.com)";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];

// State folders -> the state name OpenStreetMap uses.
const STATES = {
  "andaman-nicobar": "Andaman and Nicobar Islands", "andhra-pradesh": "Andhra Pradesh", "arunachal-pradesh": "Arunachal Pradesh",
  assam: "Assam", bihar: "Bihar", chandigarh: "Chandigarh", chhattisgarh: "Chhattisgarh",
  "daman-diu": "Dadra and Nagar Haveli and Daman and Diu", delhi: "Delhi", goa: "Goa", gujarat: "Gujarat",
  "himachal-pradesh": "Himachal Pradesh", haryana: "Haryana", jharkhand: "Jharkhand", "jammu-kashmir": "Jammu and Kashmir",
  karnataka: "Karnataka", kerala: "Kerala", ladakh: "Ladakh", lakshadweep: "Lakshadweep", maharashtra: "Maharashtra",
  meghalaya: "Meghalaya", manipur: "Manipur", "madhya-pradesh": "Madhya Pradesh", mizoram: "Mizoram", nagaland: "Nagaland",
  orissa: "Odisha", punjab: "Punjab", puducherry: "Puducherry", rajasthan: "Rajasthan", sikkim: "Sikkim",
  telangana: "Telangana", "tamil-nadu": "Tamil Nadu", tripura: "Tripura", "uttar-pradesh": "Uttar Pradesh",
  uttaranchal: "Uttarakhand", "west-bengal": "West Bengal"
};

/* ───────────── helpers ───────────── */

const decodeEntities = (s) => s.replace(/&nbsp;/g, " ").replace(/&[nm]dash;/g, "-").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const stripTags = (s) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listHtml(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listHtml(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

function readPage(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return null;
  const h = fs.readFileSync(file, "utf8");
  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(h)) return null;
  const facts = {};
  for (const m of h.matchAll(/class="fact-label">([^<]*)<\/div>\s*<div class="fact-value">([\s\S]*?)<\/div>/g)) facts[stripTags(m[1])] = stripTags(m[2]);
  const name = stripTags((h.match(/<div class="guru-name-heading"><span>([\s\S]*?)<\/span>/) || [])[1] || "");
  const city = stripTags((h.match(/<div class="hero-subtitle">([\s\S]*?)<\/div>/) || [])[1] || "");
  return {
    name, city,
    address: facts.Address || facts["पता"] || facts["ਪਤਾ"] || "",
    phone: ["Phone", "Phone Number", "फ़ोन", "फ़ोन नंबर", "ਫ਼ੋਨ", "ਫ਼ੋਨ ਨੰਬਰ"].map((l) => facts[l]).find(Boolean) || ""
  };
}

const pageUrl = (rel) => `${SITE}/${encodeURI(rel)}`;
const km = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const round = (n) => Math.round(n * 1e5) / 1e5;

/* ───────────── plus codes (Open Location Code) ───────────── */

const OLC = "23456789CFGHJMPQRVWX";
const PAIR_RES = [20, 1, 0.05, 0.0025, 0.000125];
const PLUS_RE = /(?:^|[\s,(])([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,3})(?=[\s,)]|$)/i;

function olcEncode(lat, lng) {
  lat = Math.min(Math.max(lat, -90), 89.9999999) + 90;
  lng = ((((lng + 180) % 360) + 360) % 360);
  let code = "";
  for (const res of PAIR_RES.slice(0, 4)) {
    const a = Math.floor(lat / res), b = Math.floor(lng / res);
    code += OLC[a] + OLC[b];
    lat -= a * res; lng -= b * res;
  }
  return code.slice(0, 8) + "+";
}

function olcDecode(code) {
  const digits = code.replace("+", "").toUpperCase();
  let lat = -90, lng = -180, latRes = 0, lngRes = 0;
  for (let i = 0; i < Math.min(digits.length, 10); i += 2) {
    latRes = lngRes = PAIR_RES[i / 2];
    lat += OLC.indexOf(digits[i]) * latRes;
    lng += OLC.indexOf(digits[i + 1]) * lngRes;
  }
  for (let i = 10; i < digits.length; i++) {
    latRes /= 5; lngRes /= 4;
    const d = OLC.indexOf(digits[i]);
    lat += Math.floor(d / 4) * latRes;
    lng += (d % 4) * lngRes;
  }
  return { lat: lat + latRes / 2, lng: lng + lngRes / 2 };
}

// A short code ("98VC+PPV") is completed with the digits of a nearby reference point.
function olcRecover(short, ref) {
  short = short.toUpperCase();
  const pad = 8 - short.indexOf("+");
  if (pad <= 0) return olcDecode(short);
  const res = Math.pow(20, 2 - pad / 2);
  const p = olcDecode(olcEncode(ref.lat, ref.lng).slice(0, pad) + short);
  if (ref.lat + res / 2 < p.lat && p.lat - res >= -90) p.lat -= res;
  else if (ref.lat - res / 2 > p.lat && p.lat + res <= 90) p.lat += res;
  if (ref.lng + res / 2 < p.lng) p.lng -= res;
  else if (ref.lng - res / 2 > p.lng) p.lng += res;
  return p;
}

/* ───────────── Nominatim / Overpass ───────────── */

let lastCall = 0;
async function nominatim(params) {
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const url = `${NOMINATIM}?${new URLSearchParams({ format: "jsonv2", addressdetails: "1", countrycodes: "in", limit: "5", ...params })}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) { await sleep(5000 * (attempt + 1)); continue; }
      throw new Error(`Nominatim ${res.status}`);
    } catch (err) {
      if (attempt === 2) throw err;
      await sleep(3000);
    }
  }
  return [];
}

// The state a point is in.
async function nominatimReverse(p) {
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ format: "jsonv2", zoom: "5", lat: p.lat, lon: p.lng })}`, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
  return res.ok ? res.json() : null;
}

// Every Sikh place of worship in OpenStreetMap, downloaded once a week.
async function osmGurudwaras() {
  const file = path.join(os.tmpdir(), "sikhsinindia-osm-gurudwaras.json");
  if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 7 * 864e5) return JSON.parse(fs.readFileSync(file, "utf8"));
  const query = '[out:json][timeout:280];(nwr["amenity"="place_of_worship"]["religion"="sikh"];nwr["amenity"="place_of_worship"]["name"~"gur[u]?d[u]?wara|gurdw|ਗੁਰਦੁਆਰ|गुरुद्वार",i];);out center tags;';
  for (const server of OVERPASS) {
    try {
      const res = await fetch(server, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(query) });
      const text = await res.text();
      if (!res.ok || !text.startsWith("{")) continue;
      const list = JSON.parse(text).elements.map((e) => ({
        id: `${e.type}/${e.id}`, lat: e.lat ?? e.center.lat, lng: e.lon ?? e.center.lon,
        names: [e.tags.name, e.tags["name:en"], e.tags.alt_name, e.tags.old_name].filter(Boolean)
      })).filter((e) => e.names.length);
      fs.writeFileSync(file, JSON.stringify(list));
      return list;
    } catch { /* next server */ }
  }
  console.warn("OpenStreetMap Gurudwara list unavailable; placing by address only.");
  return [];
}

/* ───────────── matching ───────────── */

const STOP = new Set(["sector", "phase", "block", "colony", "model", "town", "city", "street", "market", "main", "new", "old", "central", "gurudwara","gurdwara", "gurudwaras", "gurduara", "sri", "shri", "shree", "sahib", "sahab", "ji", "guru", "the", "of", "and", "baba", "bhai", "mata", "singh", "sabha", "sikh", "temple", "nagar", "road", "dev", "nanak", "gobind", "har", "das", "ram", "teg", "bahadur", "arjan", "angad", "amar", "kishan", "rai", "patshahi", "chhevin", "dasvin", "pehli", "india"]);
const squash = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
// Spelling-proof form of a place name: "Bhatinda" = "Bathinda", "Thulliwal" = "Thuliwal".
const skel = (s) => squash(s).replace(/h/g, "").replace(/(.)\1+/g, "$1").replace(/(?!^)[aeiou]/g, "");
const tokens = (name) => name.toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 4 && !STOP.has(t));
// Same Gurudwara? A distinctive word of our name ("Bangla", "Rakab Ganj")
// must appear in theirs, ignoring spaces ("Sisganj" = "Sis Ganj").
function sameName(ours, theirs) {
  const words = tokens(ours);
  const joined = squash(ours.replace(/\b(gurudwara|gurdwara|sri|shri|sahib|ji)\b/gi, ""));
  return theirs.some((t) => {
    const s = squash(t);
    if (words.some((w) => s.includes(squash(w)))) return true;
    // spelling variants: "Harimandir" = "Harmandir"
    if (words.some((w) => skel(w).length >= 4 && skel(t).includes(skel(w)))) return true;
    // two-word names written together: "Sis Ganj" -> "sisganj"
    return joined.length >= 6 && s.includes(joined);
  });
}

// Address -> lookups to try, most specific first. Each keeps the first place
// name it still contains, so a match that drops it can be told apart.
const ROADISH = /\b(road|rd|marg|street|st|lane|gali|chowk|gate|bazaar|bazar|market|sector|block|phase|near|opp|opposite|behind|plot|house|no|colony|enclave|area|tehsil|teh|district|distt|dist|po|p\.o|ps|via|nh|highway)\b|\d/i;
function cleanAddress(a) {
  return a.replace(/\(approximate location\)/i, "").replace(PLUS_RE, " ").replace(/\b(village|vill|vpo|v\.p\.o\.?)\b\.?/gi, "")
    // "near Humayun's Tomb" -> "Humayun's Tomb": the landmark is what the map knows
    .replace(/(^|,)\s*(?:near|behind|opp\.?|opposite|beside|next to|at the base\/foothill of|at the foot of)\s+/gi, "$1 ")
    // PIN codes are looked up on their own; brackets hold notes ("(UT)", "(Margão)")
    .replace(/\b\d{3}\s?\d{3}\b/g, " ").replace(/\([^)]*\)/g, " ")
    .replace(/[‐-―]/g, "-").replace(/\s+/g, " ").replace(/^[\s,]+|[\s,]+$/g, "");
}
function addressParts(a) {
  return cleanAddress(a).split(",")
    // "Patna City, Bihar - on the banks of the Ganges": the note after a dash isn't an address
    .map((s) => s.split(/\s+-\s+/)[0].replace(/[\s-]+$/, "").replace(/^tehsil\s+/i, "").replace(/\s+(district|distt\.?|dist\.?)$/i, "").trim())
    .filter((s) => s && !/^india$/i.test(s) && !/\bkm\b|^(on|about|in) the\b/i.test(s));
}

function inState(r, state) {
  const s = (r.address && (r.address.state || r.address.territory || r.address.city)) || r.display_name || "";
  return r.display_name.includes(state) || s.includes(state);
}
// Nominatim place_rank: 16 city, 18 town, 19 village, 20+ suburb/neighbourhood, 26+ street/building.
const RANK_PRECISION = (rank) => (rank >= 26 ? "street" : rank >= 16 ? "locality" : null);
const meaningful = (p) => (p.match(/[a-z]/gi) || []).length >= 4;

// b. the address. Returns { point, precision, query } or { reason }.
async function placeAddress(entry) {
  const parts = addressParts(entry.address);
  const state = STATES[entry.stateKey];
  const placeName = parts.find((p) => !ROADISH.test(p) && squash(p) !== squash(state || "")) || "";
  const found = await walkAddress(parts, state, placeName);
  if (found.point) return found;
  if (!placeName) return found.pinOk ? placeByPin(entry, state, found) : found;
  // "Basantpur, Bilaspur, Himachal Pradesh": the village by itself in its
  // state, accepted only when the map puts it in the district / town the
  // address also names (or it is the only place of that name in the state).
  const bare = placeName.replace(/\b(city|town)\b/gi, "").trim();
  const at = parts.indexOf(placeName);
  const streetGiven = parts.slice(0, at).some(meaningful);
  const others = parts.slice(at + 1).map((p) => skel(p.replace(/\b(city|town)\b/gi, ""))).filter((p) => p.length >= 3 && p !== skel(state || ""));
  if (squash(bare).length >= 4 && skel(bare).length >= 3) {
    const results = (await nominatim({ q: [bare, state].filter(Boolean).join(", ") }))
      // a street was given but only a whole city matches: its centre isn't the Gurudwara
      .filter((r) => inState(r, state || "") && r.place_rank >= (streetGiven ? 18 : 16) && skel(r.display_name).includes(skel(bare)));
    const hit = others.length ? results.find((r) => others.some((o) => skel(r.display_name).includes(o))) : (results.length === 1 ? results[0] : null);
    if (hit) return { point: { lat: +hit.lat, lng: +hit.lon }, precision: RANK_PRECISION(hit.place_rank), query: `${bare}, ${state}` };
  }
  return found;
}

async function walkAddress(parts, state, placeName) {
  for (let i = 0; i < parts.length; i++) {
    const rest = parts.slice(i);
    if (!rest.length) break;
    const q = rest.some((p) => state && p.toLowerCase().includes(state.toLowerCase())) ? rest.join(", ") : [...rest, state].filter(Boolean).join(", ");
    const results = await nominatim({ q });
    const hit = results.find((r) => (!state || inState(r, state)) && RANK_PRECISION(r.place_rank));
    if (!hit) continue;
    // The first place name must survive: finding only the district town of
    // "Daraj, Barnala" places it up to 50 km away. Losing a landmark
    // ("R.N.D. Workshop, Betim") is fine when a village or suburb was found.
    const lost = placeName && !rest.includes(placeName) && !skel(hit.display_name).includes(skel(placeName));
    if (lost && hit.place_rank < 19) return { reason: `"${placeName}" not found on the map; only "${rest.join(", ")}" was`, near: { lat: +hit.lat, lng: +hit.lon } };
    // Only the whole city found ("..., Delhi") after skipping the street or
    // landmark: that is the city centre, not the Gurudwara.
    if (hit.place_rank < 18 && parts.slice(0, i).some(meaningful))
      return { reason: `only the city "${rest.join(", ")}" was found, not "${parts.slice(0, i).join(", ")}"`, near: { lat: +hit.lat, lng: +hit.lon } };
    return { point: { lat: +hit.lat, lng: +hit.lon }, precision: RANK_PRECISION(hit.place_rank), query: q };
  }
  // Nothing found: a PIN code may still place it (only when the address names no village / town).
  return { reason: "address not found on the map", pinOk: !placeName };
}

// A PIN code alone places it to its post office area.
async function placeByPin(entry, state, failed) {
  const pin = (entry.address.match(/\b(\d{3})\s?(\d{3})\b/) || []).slice(1).join("");
  if (!pin) return failed;
  const results = await nominatim({ postalcode: pin, country: "India" });
  const hit = results.find((r) => !state || inState(r, state));
  return hit ? { point: { lat: +hit.lat, lng: +hit.lon }, precision: "pin", query: `PIN ${pin}` } : failed;
}

// c. the Gurudwara itself, by name, near the address.
async function placeByName(entry, near, radiusKm, osm) {
  // "Gurudwara Singh Sabha" has no distinctive word: only trust one right at the address.
  if (!tokens(entry.name.en).length) radiusKm = Math.min(radiusKm, 1.5);
  const candidates = osm.filter((o) => km(near, o) <= radiusKm && sameName(entry.name.en, o.names)).sort((a, b) => km(near, a) - km(near, b));
  if (candidates.length) return { point: { lat: candidates[0].lat, lng: candidates[0].lng }, source: `osm ${candidates[0].id}` };
  const d = radiusKm / 111;
  const results = await nominatim({ q: entry.name.en.replace(/\bJi\b/i, "").trim(), viewbox: [near.lng - d, near.lat + d, near.lng + d, near.lat - d].join(","), bounded: "1" });
  const hit = results.find((r) => sameName(entry.name.en, [r.name || "", r.display_name.split(",")[0]]) &&
    (r.type === "place_of_worship" || /gur[u]?d[u]?wara/i.test(r.name || "")));
  return hit ? { point: { lat: +hit.lat, lng: +hit.lon }, source: `osm ${hit.osm_type}/${hit.osm_id}` } : null;
}

// d. the only OpenStreetMap Gurudwara of that name in the page's city
// (e.g. "Mata Sundari" in Delhi). Two of the same name: not placed.
const cityPoints = new Map();
async function placeInCity(entry, osm) {
  if (!tokens(entry.name.en).length || !entry.city.en) return null;
  const state = STATES[entry.stateKey] || "";
  const q = [entry.city.en, state].filter(Boolean).join(", ");
  if (!cityPoints.has(q)) {
    const hit = (await nominatim({ q })).find((r) => RANK_PRECISION(r.place_rank) && inState(r, state));
    cityPoints.set(q, hit ? { lat: +hit.lat, lng: +hit.lon } : null);
  }
  const city = cityPoints.get(q);
  if (!city) return null;
  const found = osm.filter((o) => km(city, o) <= 25 && sameName(entry.name.en, o.names));
  if (!found.length || found.some((o) => km(o, found[0]) > 0.5)) return null;
  return { point: { lat: found[0].lat, lng: found[0].lng }, source: `osm ${found[0].id} (only one of that name in ${entry.city.en})` };
}

const RADIUS = { street: 2, pin: 6, locality: 8, pluscode: 0.3 };

async function geocode(entry, osm) {
  const plus = (entry.address.match(PLUS_RE) || [])[1];
  let base;
  if (plus) {
    const full = plus.indexOf("+") === 8;
    let ref = null;
    if (!full) {
      const located = await placeAddress({ ...entry, address: entry.address.replace(PLUS_RE, " ") });
      ref = located.point || located.near;
      if (!ref) return { reason: `plus code ${plus} has no locality that could be found` };
    }
    const point = full ? olcDecode(plus) : olcRecover(plus, ref);
    if (ref && km(point, ref) > 30) return { reason: `plus code ${plus} lands ${Math.round(km(point, ref))} km from its locality` };
    // A plus code copied from another page lands in the wrong state.
    const state = STATES[entry.stateKey];
    const where = await nominatimReverse(point);
    if (state && where && !inState(where, state)) return { reason: `plus code ${plus} is in ${(where.address && where.address.state) || "another state"}, not ${state}` };
    return { point, precision: "exact", source: `plus code ${plus}` };
  }
  base = await placeAddress(entry);
  // Even when the address only reaches a town, a named OSM Gurudwara inside
  // it is exact; when the address fails entirely, nothing is guessed.
  if (!base.point) {
    const named = (base.near && await placeByName(entry, base.near, 15, osm)) || await placeInCity(entry, osm);
    if (named) return { point: named.point, precision: "exact", source: named.source };
    return base;
  }
  const named = await placeByName(entry, base.point, RADIUS[base.precision], osm)
    || await placeInCity(entry, osm);
  if (named) return { point: named.point, precision: "exact", source: named.source };
  return { point: base.point, precision: base.precision, source: `address: ${base.query}` };
}

/* ───────────── main ───────────── */

async function main() {
  const entries = [];
  for (const file of listHtml(path.join(ROOT, "04-gurudwaras"))) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const en = readPage(rel);
    if (!en || !en.address || !en.name) continue;
    const stateKey = (rel.split("/")[1] || "").replace(/^\d+-/, "");
    const hi = readPage("hi/" + rel), pa = readPage("pa/" + rel);
    entries.push({
      id: rel, stateKey,
      name: { en: en.name, hi: hi && hi.name, pa: pa && pa.name },
      city: { en: en.city, hi: hi && hi.city, pa: pa && pa.city },
      address: en.address,
      addressLocal: { hi: hi && hi.address !== en.address ? hi.address : undefined, pa: pa && pa.address !== en.address ? pa.address : undefined },
      phone: (en.phone && /\d{5}/.test(en.phone.replace(/\D/g, ""))) ? en.phone : "",
      url: { en: pageUrl(rel), hi: hi ? pageUrl("hi/" + rel) : undefined, pa: pa ? pageUrl("pa/" + rel) : undefined }
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));

  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  const key = (e) => `${e.id}|${e.address}`;
  const todo = entries.filter((e) => (REFRESH || !cache[key(e)] || (RETRY && cache[key(e)].lat == null)) && (!ONLY || e.id.includes(ONLY)));
  if (todo.length && !OFFLINE) {
    const osm = await osmGurudwaras();
    console.log(`Placing ${todo.length} address(es) on the map (about ${Math.ceil(todo.length * 2.5 / 60)} min)...`);
    let n = 0;
    for (const e of todo) {
      let r;
      try { r = await geocode(e, osm); } catch (err) { console.warn(`  ${e.id}: ${err.message}`); continue; }
      cache[key(e)] = r.point
        ? { lat: round(r.point.lat), lng: round(r.point.lng), precision: r.precision, source: r.source }
        : { reason: r.reason };
      if (++n % 20 === 0) { fs.writeFileSync(CACHE, JSON.stringify(sortKeys(cache), null, 1)); console.log(`  ${n}/${todo.length}`); }
    }
  }
  // Positions placed only by address: an OpenStreetMap Gurudwara of the same
  // name close by marks the building itself (no lookups needed, so cheap to repeat).
  if (!OFFLINE) {
    const osm = await osmGurudwaras();
    for (const e of entries) {
      const g = cache[key(e)];
      if (!g || g.lat == null || g.precision === "exact") continue;
      let radius = RADIUS[g.precision] || 2;
      if (!tokens(e.name.en).length) radius = Math.min(radius, 1.5);
      const near = osm.filter((o) => km(g, o) <= radius && sameName(e.name.en, o.names)).sort((a, b) => km(g, a) - km(g, b))[0];
      if (near) cache[key(e)] = { lat: round(near.lat), lng: round(near.lng), precision: "exact", source: `osm ${near.id} (named, ${Math.round(km(g, near) * 10) / 10} km from the address)` };
    }
  }
  // Drop cache entries for pages or addresses that no longer exist.
  const live = new Set(entries.map(key));
  for (const k of Object.keys(cache)) if (!live.has(k)) delete cache[k];
  fs.writeFileSync(CACHE, JSON.stringify(sortKeys(cache), null, 1));

  const placed = [], unplaced = [];
  for (const e of entries) {
    const g = cache[key(e)];
    if (g && g.lat != null) {
      placed.push({
        id: e.id, lat: g.lat, lng: g.lng, precision: g.precision,
        name: e.name, city: e.city, address: e.address, addressLocal: e.addressLocal, phone: e.phone || undefined, url: e.url
      });
    } else {
      unplaced.push({ id: e.id, name: e.name.en, address: e.address, reason: g ? g.reason : "not looked up yet" });
    }
  }
  const data = {
    about: "Gurudwaras listed on sikhsinindia.com, with map positions. Built by scripts/gurudwaras-data.js.",
    attribution: "Map positions © OpenStreetMap contributors (ODbL), via Nominatim and Overpass.",
    generated: new Date().toISOString().slice(0, 10),
    count: placed.length,
    gurudwaras: placed,
    unplaced
  };
  fs.writeFileSync(OUT, JSON.stringify(data));
  const by = placed.reduce((m, g) => ((m[g.precision] = (m[g.precision] || 0) + 1), m), {});
  console.log(`\n${entries.length} Gurudwara pages: ${placed.length} placed (${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(", ")}), ${unplaced.length} not placed.`);
  for (const u of unplaced) console.log(`  NOT PLACED  ${u.id}\n              ${u.address}\n              ${u.reason}`);
}

function sortKeys(o) { return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]])); }

main().catch((err) => { console.error(err); process.exit(1); });
