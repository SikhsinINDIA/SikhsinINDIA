/*
 * Cloudflare Worker for the SikhsinIndia static site. Four jobs:
 *
 * 1. Send email via the Brevo API, falling back to Resend (see sendEmail
 *    for which goes first). Exists because none of the client-side
 *    form backends tried (EmailJS free tier, SnapitForms, FormSubmit,
 *    Formspree) can send to an arbitrary, dynamically-chosen recipient for
 *    free — this Worker is a thin authenticated proxy that can, since the
 *    Resend API key lives here server-side and is never exposed to the
 *    browser. Default action (no `action` field in the request body).
 *    Optional `attachments: [{filename, content}]` (content pre-encoded as
 *    base64 by the caller) or `[{filename, url}]` (fetched and base64-encoded
 *    here instead — used by 100-misc/01-mass-mailers, whose attachments live
 *    in Drive; a browser can't fetch() a Drive URL's bytes itself due to
 *    CORS, but a Worker isn't subject to CORS and can).
 *
 * 2. Force-reset an Akhand Path participant's Firebase Auth password
 *    (action: "reset_password"). Needed because Firebase's client SDK has
 *    no way to overwrite an EXISTING user's password without already
 *    knowing it — only the Admin SDK can, and that requires a real
 *    server with real credentials, which this Worker now is. Used when a
 *    sponsor/invitee's email already had an unrelated account on the site
 *    from before Akhand Path touched it, so the shared "123456" password
 *    the invite/approval emails promise doesn't actually apply to them.
 *
 * 3. Send a WhatsApp template message via the Meta WhatsApp Business
 *    Cloud API (action: "send_whatsapp"). Business-initiated WhatsApp
 *    messages (as opposed to a reply within 24h of the user messaging
 *    first) can only ever be a pre-approved message *template* — never
 *    free-form text — so the caller sends a template name + an ordered
 *    list of body variables, not a message string. Optional
 *    headerImageUrl fills an IMAGE header for templates that have one
 *    (public https JPEG/PNG, max 5 MB). See
 *    03-nitnem/03-06-akhand-path/firebase.js's WHATSAPP_* constants for
 *    the exact template names/wording this site currently has approved.
 *
 * 4. Search YouTube for shabad kirtan (action: "youtube_search", fields
 *    q, mode: "lyrics" | "kirtaniya", optional pageToken) for
 *    03-nitnem/03-07-shabad-search.html, so the YouTube Data API key stays
 *    here instead of in the page. Public — no sign-in needed.
 *
 * Deploy: see cloudflare-worker's own docs / wrangler.toml comments.
 * Requires these secrets, set via `wrangler secret put <NAME>`:
 *   BREVO_API_KEY         — from Brevo: SMTP & API → API keys, Restricted,
 *                            "Transactional email: All". Optional; without
 *                            it all mail goes via Resend.
 *   RESEND_API_KEY        — from the Resend dashboard
 *   APP_SHARED_SECRET     — random string used ONLY by the server-side
 *                            GitHub Actions scripts in scripts/ (stored there
 *                            as the APP_SHARED_SECRET Actions secret), sent
 *                            as the X-App-Secret header. Never put it in
 *                            browser code — see AUTH below.
 *   GOOGLE_SA_EMAIL        — the service account's client_email (from its
 *                            downloaded JSON key)
 *   GOOGLE_SA_PRIVATE_KEY  — the service account's private_key (same JSON
 *                            key; keep the literal "\n" sequences as-is,
 *                            wrangler secret put handles it as one string)
 *   WHATSAPP_ACCESS_TOKEN  — a permanent (System User) access token from
 *                            Meta for Developers, for the WhatsApp Business
 *                            app that owns the sending phone number
 *   WHATSAPP_PHONE_NUMBER_ID — that WhatsApp Business phone number's
 *                            numeric Phone Number ID (not the phone number
 *                            itself), from the same app's API Setup page
 *   YOUTUBE_API_KEY        — a Google Cloud API key with the YouTube Data
 *                            API v3 enabled, used only for shabad search
 *   WHATSAPP_APP_SECRET    — the Meta app's App Secret (App settings >
 *                            Basic), used to verify delivery-status webhooks
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN — any random string, also typed into the
 *                            Meta app's WhatsApp > Configuration > Webhook
 * Optional KV binding WA_STATUS (wrangler.toml) stores per-message delivery
 * status; POST /whatsapp-webhook receives Meta's status updates and the
 * admin-only action "whatsapp_statuses" lists them.
 *
 * AUTH. Every request is one of three callers:
 *   - "server": a scripts/ job presenting X-App-Secret. Full access.
 *   - "admin": a browser sending `Authorization: Bearer <Firebase ID token>`
 *     (auth.currentUser.getIdToken()) for a VERIFIED email listed in the
 *     ADMIN_EMAILS var (wrangler.toml). Full access.
 *   - anyone else (no/invalid token, or a non-admin account — anyone can
 *     create a Firebase account on this site, so "signed in" alone proves
 *     nothing): may only notify the site admin — email to ADMIN_NOTIFY_EMAIL
 *     or WhatsApp to ADMIN_NOTIFY_WHATSAPP — which is what the public
 *     03-06-01-request-akhand-path.html form does. Everything else
 *     (send_whatsapp to anyone else, reset_password, email to anyone else,
 *     i.e. invites/approvals/mass mail) is rejected with 403.
 * email_verified is required because Firebase lets anyone register an
 * address nobody has claimed yet without proving they own it.
 *
 * The service account needs the "Firebase Authentication Admin" IAM role
 * on the sikhsinindia-67a6b Google Cloud project — nothing broader. This
 * key can reset ANY user's password in the whole Firebase project, not
 * just Akhand Path ones, so treat it as sensitive as the Firebase project
 * itself.
 */

const IDENTITY_TOOLKIT_BASE = "https://identitytoolkit.googleapis.com/v1";
const FIREBASE_PROJECT_ID = "sikhsinindia-67a6b";
const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

function base64urlDecode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(str.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Google rotates these signing keys every few hours; cache them per isolate
// for as long as Google's Cache-Control says they're valid.
let jwksCache = { keys: null, expiresAt: 0 };
async function getFirebaseSigningKeys() {
  if (jwksCache.keys && Date.now() < jwksCache.expiresAt) return jwksCache.keys;
  const res = await fetch(FIREBASE_JWKS_URL);
  if (!res.ok) throw new Error(`Could not fetch Firebase signing keys: HTTP ${res.status}`);
  const { keys } = await res.json();
  const maxAge = Number((/max-age=(\d+)/.exec(res.headers.get("Cache-Control") || "") || [])[1]) || 3600;
  jwksCache = { keys, expiresAt: Date.now() + maxAge * 1000 };
  return keys;
}

// Verifies a Firebase Auth ID token per
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
// and returns its claims, or throws.
async function verifyFirebaseIdToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm");

  const jwk = (await getFirebaseSigningKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Unknown token signing key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, base64urlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw new Error("Bad token signature");

  const now = Math.floor(Date.now() / 1000);
  const skew = 60;
  if (claims.aud !== FIREBASE_PROJECT_ID) throw new Error("Token audience mismatch");
  if (claims.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) throw new Error("Token issuer mismatch");
  if (!claims.sub) throw new Error("Token has no subject");
  if (!(claims.exp > now - skew)) throw new Error("Token expired");
  if (!(claims.iat <= now + skew) || !(claims.auth_time <= now + skew)) throw new Error("Token issued in the future");
  return claims;
}

function listVar(value) {
  return String(value || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// Length-independent-timing compare so the shared secret can't be guessed
// byte-by-byte from response times.
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Returns { role: "server" | "admin" | "public", ... } — see AUTH above.
async function identifyCaller(request, env) {
  const secret = request.headers.get("X-App-Secret");
  if (secret && env.APP_SHARED_SECRET && safeEqual(secret, env.APP_SHARED_SECRET)) return { role: "server" };

  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") || "");
  if (!match) return { role: "public", reason: "not signed in" };
  try {
    const claims = await verifyFirebaseIdToken(match[1].trim());
    const email = String(claims.email || "").toLowerCase();
    if (!listVar(env.ADMIN_EMAILS).includes(email)) return { role: "public", reason: `${email || "this account"} is not an admin` };
    if (claims.email_verified !== true) return { role: "public", reason: `${email} has not verified its email address` };
    return { role: "admin", email };
  } catch (err) {
    return { role: "public", reason: "invalid sign-in token: " + (err.message || err) };
  }
}

function base64url(bytes) {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlFromString(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Signs a short-lived JWT with the service account's private key and
// exchanges it with Google for an OAuth access token — the standard
// "JWT bearer" flow for server-to-server auth with no interactive login.
async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: env.GOOGLE_SA_EMAIL,
    scope: "https://www.googleapis.com/auth/identitytoolkit",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const signingInput = `${base64urlFromString(JSON.stringify(header))}.${base64urlFromString(JSON.stringify(claimSet))}`;

  const pemContents = env.GOOGLE_SA_PRIVATE_KEY
    .replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64url(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) throw new Error("Could not get Google access token: " + JSON.stringify(tokenJson));
  return tokenJson.access_token;
}

async function resetFirebasePassword(env, email, newPassword) {
  const accessToken = await getGoogleAccessToken(env);

  const lookupRes = await fetch(`${IDENTITY_TOOLKIT_BASE}/accounts:lookup`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: [email] })
  });
  const lookupJson = await lookupRes.json();
  if (!lookupRes.ok) throw new Error("Account lookup failed: " + JSON.stringify(lookupJson));
  const user = lookupJson.users && lookupJson.users[0];
  if (!user) throw new Error(`No account exists for ${email}`);

  const updateRes = await fetch(`${IDENTITY_TOOLKIT_BASE}/accounts:update`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ localId: user.localId, password: newPassword })
  });
  const updateJson = await updateRes.json();
  if (!updateRes.ok) throw new Error("Password update failed: " + JSON.stringify(updateJson));
  return { email, localId: user.localId };
}

// Meta requires E.164 (leading "+", country code, no spaces/dashes/parens).
// Sponsors/invitees have typed numbers in all sorts of local formats, so
// this is a best-effort cleanup, not real validation — a malformed number
// just gets rejected by the WhatsApp API itself with a clear error.
function normalizePhone(raw) {
  const digits = String(raw || "").replace(/[^0-9+]/g, "");
  if (!digits) return digits;
  return digits.startsWith("+") ? digits : "+" + digits;
}

async function sendWhatsAppTemplate(env, { to, templateName, languageCode, params, headerImageUrl }) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("WhatsApp is not configured yet (missing WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID secrets).");
  }

  const template = {
    name: templateName,
    language: { code: languageCode || "en_US" }
  };
  const components = [];
  if (headerImageUrl) {
    if (!/^https:\/\//i.test(headerImageUrl)) throw new Error("headerImageUrl must be a public https:// link.");
    components.push({ type: "header", parameters: [{ type: "image", image: { link: headerImageUrl } }] });
  }
  if (Array.isArray(params) && params.length) {
    components.push({
      type: "body",
      parameters: params.map((p) => ({ type: "text", text: String(p == null ? "" : p) }))
    });
  }
  if (components.length) template.components = components;

  const res = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "template",
      template
    })
  });
  const resBody = await res.text();
  if (!res.ok) throw new Error("WhatsApp API error: " + resBody);
  await recordWhatsAppSend(env, { to, templateName }, resBody);
  return resBody;
}

/* ---------------- WHATSAPP DELIVERY TRACKING ----------------
   Meta's send API only says a message was *accepted*; whether it reached
   the phone arrives later as a webhook status (sent / delivered / read /
   failed + reason). Each sent message is kept in the WA_STATUS KV
   namespace as an empty value whose metadata holds the status, so one
   list() call returns everything the broadcast page's Delivery Report
   needs without a read per key. Optional: if WA_STATUS isn't bound,
   sending works exactly as before, just untracked. */
const WA_STATUS_TTL_SECONDS = 45 * 24 * 3600;
const WA_STATUS_RANK = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

async function recordWhatsAppSend(env, { to, templateName }, resBody) {
  if (!env.WA_STATUS) return;
  try {
    const id = JSON.parse(resBody).messages[0].id;
    await env.WA_STATUS.put(`msg:${id}`, "", {
      expirationTtl: WA_STATUS_TTL_SECONDS,
      metadata: { to: normalizePhone(to), t: templateName, at: Date.now(), s: "accepted" }
    });
  } catch (_) { /* tracking must never fail a send */ }
}

function hexFromBuffer(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Meta signs every webhook POST with the app secret (X-Hub-Signature-256),
// which is what stops anyone else from posting fake statuses here.
async function isValidMetaSignature(env, rawBody, header) {
  if (!env.WHATSAPP_APP_SECRET || !header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.WHATSAPP_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hexFromBuffer(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const given = header.slice("sha256=".length).toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

async function handleWhatsAppWebhook(request, env) {
  const url = new URL(request.url);
  // One-time subscription check from Meta's app dashboard.
  if (request.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe"
      && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
      && url.searchParams.get("hub.verify_token") === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("Forbidden", { status: 403 });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await request.text();
  if (!(await isValidMetaSignature(env, rawBody, request.headers.get("X-Hub-Signature-256")))) {
    return new Response("Invalid signature", { status: 401 });
  }
  if (!env.WA_STATUS) return new Response("OK", { status: 200 });

  let body;
  try { body = JSON.parse(rawBody); } catch (_) { return new Response("OK", { status: 200 }); }
  const statuses = [];
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      for (const st of (change.value && change.value.statuses) || []) statuses.push(st);
    }
  }
  for (const st of statuses) {
    if (!st.id || !(st.status in WA_STATUS_RANK)) continue;
    const key = `msg:${st.id}`;
    const existing = await env.WA_STATUS.getWithMetadata(key);
    const meta = (existing && existing.metadata) || { to: normalizePhone(st.recipient_id), t: "", at: Number(st.timestamp) * 1000 || Date.now(), s: "accepted" };
    // Statuses can arrive out of order (read before delivered) — never step back.
    if (WA_STATUS_RANK[st.status] < (WA_STATUS_RANK[meta.s] || 0)) continue;
    meta.s = st.status;
    meta.u = Number(st.timestamp) * 1000 || Date.now();
    if (st.status === "failed" && Array.isArray(st.errors) && st.errors[0]) {
      const e = st.errors[0];
      const detail = (e.error_data && e.error_data.details) || e.message || e.title || "";
      meta.e = `${e.code || ""} ${e.title || ""}${detail && detail !== e.title ? " — " + detail : ""}`.trim().slice(0, 300);
    }
    await env.WA_STATUS.put(key, "", { expirationTtl: WA_STATUS_TTL_SECONDS, metadata: meta });
  }
  return new Response("OK", { status: 200 });
}

// Admin-only: every tracked message (optionally one template's, sent
// after `since` ms), for the broadcast page's Delivery Report.
async function listWhatsAppStatuses(env, { templateName, since }) {
  if (!env.WA_STATUS) throw new Error("Delivery tracking isn't set up yet (no WA_STATUS KV namespace bound to the Worker).");
  const rows = [];
  let cursor;
  do {
    const page = await env.WA_STATUS.list({ prefix: "msg:", cursor });
    for (const k of page.keys) {
      const m = k.metadata || {};
      if (templateName && m.t !== templateName) continue;
      if (since && (m.at || 0) < since) continue;
      rows.push({ id: k.name.slice(4), ...m });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor && rows.length < 20000);
  return rows;
}

// Turns a Uint8Array into a base64 string without blowing the call stack on
// large files (String.fromCharCode(...bytes) spreads the whole array as
// arguments, which throws for anything more than ~100KB in most engines).
function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Resend's `attachments` field wants { filename, content: <base64, no data-URI
// prefix> } per file. The mass mailer (and anything else attaching a file
// already sitting in Drive rather than freshly picked in the browser) sends
// { filename, url } instead — fetched and base64-encoded here, server-side,
// specifically because a browser's own fetch() would be blocked by Drive's
// CORS policy for reading the response body (an <img src="drive .../thumbnail">
// tag or a plain top-level download link both work from a browser; the same
// URL read via fetch() typically doesn't, since that requires the server to
// send permissive CORS headers, which Drive doesn't). A Worker isn't a
// browser and isn't subject to CORS, so it can just fetch it directly.
async function resolveAttachment(att) {
  if (att.content) return { filename: att.filename, content: att.content };
  if (!att.url) throw new Error(`Attachment "${att.filename || "(unnamed)"}" has neither content nor url`);
  const res = await fetch(att.url);
  if (!res.ok) throw new Error(`Could not fetch attachment "${att.filename}" from ${att.url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { filename: att.filename, content: bytesToBase64(bytes) };
}

// Pictures inserted into a Mass Mailer body are Google Drive links
// (drive.google.com/thumbnail?id=..., which 302-redirects to
// lh3.googleusercontent.com). They show in a browser, but mail apps fetch
// remote images through their own proxies, and those often get nothing back
// from Drive - so the reader saw the logo (hosted on sikhsinindia.com) but
// not the picture. Each Drive image is therefore fetched here and sent INSIDE
// the email as an inline (cid:) attachment, so nothing is fetched from Drive
// when the mail is opened. An image that can't be fetched keeps its original
// link rather than failing the send.
const DRIVE_IMG_RE = /(<img\b[^>]*?\bsrc=)(["'])(https:\/\/(?:drive\.google\.com|lh3\.googleusercontent\.com|docs\.google\.com)\/[^"']+)\2/gi;
const IMAGE_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

async function inlineDriveImages(html) {
  if (!html) return { html, inline: [] };
  const urls = [...new Set([...html.matchAll(DRIVE_IMG_RE)].map((m) => m[3]))];
  const cids = new Map();
  const inline = [];
  for (const [i, src] of urls.entries()) {
    try {
      const res = await fetch(src.replace(/&amp;/g, "&"), { redirect: "follow" });
      const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!res.ok || !type.startsWith("image/")) continue;
      const cid = `img${i + 1}@sikhsinindia.com`;
      inline.push({
        filename: `image-${i + 1}.${IMAGE_EXT[type] || "jpg"}`,
        content: bytesToBase64(new Uint8Array(await res.arrayBuffer())),
        content_type: type,
        content_id: cid
      });
      cids.set(src, cid);
    } catch (_) { /* leave this image as a remote link */ }
  }
  return {
    html: html.replace(DRIVE_IMG_RE, (m, pre, q, src) => (cids.has(src) ? `${pre}${q}cid:${cids.get(src)}${q}` : m)),
    inline
  };
}

// Two providers, each free up to a daily cap: Brevo (300/day) and Resend
// (100/day). Mail goes via Brevo, falling back to Resend when Brevo refuses
// it (daily cap reached, outage). Mail with Drive pictures sent inline goes
// the other way round, because only Resend supports inline (cid:) images -
// but only up to RESEND_DAILY_SOFT_LIMIT a day; after that, and if Resend
// is out, Brevo sends it with the pictures as ordinary links.
// Without a BREVO_API_KEY secret everything goes via Resend, as before.
async function sendEmail(env, { to, subject, text, html, attachments }) {
  const inlined = await inlineDriveImages(html);
  const files = Array.isArray(attachments) && attachments.length
    ? await Promise.all(attachments.map(resolveAttachment))
    : [];
  const mail = { to, subject, text, files };
  const viaResend = async () => {
    const sent = await sendViaResend(env, { ...mail, html: inlined.html, inline: inlined.inline });
    await countResendSend(env);
    return sent;
  };
  const viaBrevo = () => sendViaBrevo(env, { ...mail, html });
  if (!env.BREVO_API_KEY) return viaResend();
  // Resend first only for inline pictures, and only while today's Resend
  // count is under RESEND_DAILY_SOFT_LIMIT - after that Brevo takes them.
  const resendFirst = inlined.inline.length && (await resendSentToday(env)) < RESEND_DAILY_SOFT_LIMIT;
  const [first, second] = resendFirst ? [viaResend, viaBrevo] : [viaBrevo, viaResend];
  // Logged so `wrangler tail` shows which provider sent each mail.
  try {
    const sent = await first();
    console.log(`email to ${to}: sent via ${first === viaBrevo ? "Brevo" : "Resend"}`);
    return sent;
  } catch (firstErr) {
    console.log(`email to ${to}: ${firstErr.message} - trying ${second === viaBrevo ? "Brevo" : "Resend"}`);
    try {
      return await second();
    } catch (secondErr) {
      throw new Error(`${firstErr.message} | ${secondErr.message}`);
    }
  }
}

// Resend's free plan allows 100 emails a day (UTC) and emails warnings at 80%,
// so it is used for at most 75; the count lives in the WA_STATUS KV namespace
// under "resend-count:<UTC date>" (kept two days). KV is eventually
// consistent, so the count can lag by a send or two - hence the margin.
const RESEND_DAILY_SOFT_LIMIT = 75;
const resendCountKey = () => "resend-count:" + new Date().toISOString().slice(0, 10);

async function resendSentToday(env) {
  if (!env.WA_STATUS) return 0;
  return parseInt((await env.WA_STATUS.get(resendCountKey())) || "0", 10) || 0;
}

async function countResendSend(env) {
  if (!env.WA_STATUS) return;
  const key = resendCountKey();
  const n = (parseInt((await env.WA_STATUS.get(key)) || "0", 10) || 0) + 1;
  await env.WA_STATUS.put(key, String(n), { expirationTtl: 2 * 86400 });
}

const fromAddress = (env) => env.FROM_ADDRESS || "SikhsinIndia <onboarding@resend.dev>";

async function sendViaResend(env, { to, subject, text, html, files, inline }) {
  const body = { from: fromAddress(env), to: [to], subject, text, html };
  if (env.REPLY_TO) body.reply_to = env.REPLY_TO;
  if (files.length || inline.length) body.attachments = [...files, ...inline];
  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const resendBody = await resendRes.text();
  if (!resendRes.ok) throw new Error("Resend API error: " + resendBody);
  return resendBody;
}

async function sendViaBrevo(env, { to, subject, text, html, files }) {
  // "SikhsinIndia <noreply@sikhsinindia.com>" -> { name, email }
  const m = fromAddress(env).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const body = {
    sender: m ? { name: m[1], email: m[2] } : { email: fromAddress(env) },
    to: [{ email: to }],
    subject
  };
  if (html) body.htmlContent = html;
  if (text) body.textContent = text;
  if (env.REPLY_TO) body.replyTo = { email: env.REPLY_TO };
  if (files.length) body.attachment = files.map((f) => ({ name: f.filename, content: f.content }));
  const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });
  const brevoBody = await brevoRes.text();
  if (!brevoRes.ok) throw new Error("Brevo API error: " + brevoBody);
  return brevoBody;
}

// YouTube's search.list costs 100 of the default 10,000 daily quota units,
// i.e. ~100 uncached searches a day, so identical searches are served from
// Cloudflare's edge cache for a few hours instead of hitting the API again.
const YT_SEARCH_CACHE_SECONDS = 6 * 3600;
const YT_SEARCH_SUFFIX = { lyrics: "shabad kirtan", kirtaniya: "kirtan", both: "kirtan" };

// "PT7M32S" → "7:32", "PT1H2M15S" → "1:02:15", "P1DT2H" → "26:00:00".
// Live streams report "P0D", which gives "" (no badge).
function formatIsoDuration(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(iso || ""));
  if (!m) return "";
  const total = (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
  if (!total) return "";
  const h = Math.floor(total / 3600), min = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(min)}:${pad(s)}` : `${min}:${pad(s)}`;
}

async function searchYouTube(env, { q, mode, pageToken, kirtaniya }) {
  let query = String(q || "").trim().slice(0, 120);
  if (!query) throw Object.assign(new Error("Missing search text"), { status: 400 });
  // "both": shabad words plus the kirtaniya's name as an exact phrase, so
  // e.g. Harbans Singh + Thir Ghar Baiso finds his rendition specifically.
  if (mode === "both") {
    const name = String(kirtaniya || "").replace(/"/g, "").trim().slice(0, 60);
    if (!name) throw Object.assign(new Error("Missing kirtaniya name"), { status: 400 });
    query = `${query} "${name}"`;
  }
  if (!env.YOUTUBE_API_KEY) throw new Error("Shabad search is not configured yet (missing YOUTUBE_API_KEY secret).");

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    // Only videos that are allowed to play embedded on another site, since
    // the shabad search page never sends visitors to youtube.com.
    videoEmbeddable: "true",
    videoSyndicated: "true",
    safeSearch: "strict",
    maxResults: "12",
    q: `${query} ${YT_SEARCH_SUFFIX[mode] || YT_SEARCH_SUFFIX.lyrics}`
  });
  if (pageToken) params.set("pageToken", String(pageToken).slice(0, 100));

  // The cache key must not contain the API key.
  const cacheKey = new Request(`https://yt-search.cache/?${params}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  params.set("key", env.YOUTUBE_API_KEY);
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const body = await res.json();
  if (!res.ok) throw new Error("YouTube API error: " + ((body.error && body.error.message) || res.status));

  const items = (body.items || []).filter((it) => it.id && it.id.videoId);

  // search.list has no durations; one videos.list call (1 quota unit, up to
  // 50 IDs) fills them in. A failure here just leaves durations blank.
  const durations = {};
  if (items.length) {
    const vParams = new URLSearchParams({ part: "contentDetails", id: items.map((it) => it.id.videoId).join(","), key: env.YOUTUBE_API_KEY });
    const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${vParams}`);
    if (vRes.ok) {
      for (const v of (await vRes.json()).items || []) durations[v.id] = formatIsoDuration(v.contentDetails && v.contentDetails.duration);
    }
  }

  const result = {
    nextPageToken: body.nextPageToken || null,
    items: items.map((it) => ({
      videoId: it.id.videoId,
      title: it.snippet.title,
      channel: it.snippet.channelTitle,
      publishedAt: it.snippet.publishedAt,
      duration: durations[it.id.videoId] || "",
      thumbnail: ((it.snippet.thumbnails || {}).medium || (it.snippet.thumbnails || {}).default || {}).url || ""
    }))
  };
  await cache.put(cacheKey, new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${YT_SEARCH_CACHE_SECONDS}` }
  }));
  return result;
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Secret"
    };
    const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Meta's delivery-status webhook (its own path; authenticated by Meta's
    // signature rather than the caller check below).
    if (new URL(request.url).pathname === "/whatsapp-webhook") return handleWhatsAppWebhook(request, env);

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      return json({ error: "Invalid JSON body" }, 400);
    }

    // Public and read-only, so it skips the caller check below entirely.
    if (payload.action === "youtube_search") {
      try {
        return json(await searchYouTube(env, payload), 200);
      } catch (err) {
        return json({ error: String(err.message || err) }, err.status || 502);
      }
    }

    const caller = await identifyCaller(request, env);
    if (caller.role === "public") {
      // The only thing an unprivileged caller may do is notify the admin.
      const toAdminEmail = !payload.action
        && listVar(env.ADMIN_NOTIFY_EMAIL).includes(String(payload.to || "").trim().toLowerCase())
        && !(Array.isArray(payload.attachments) && payload.attachments.length);
      const toAdminWhatsApp = payload.action === "send_whatsapp" && !!env.ADMIN_NOTIFY_WHATSAPP
        && normalizePhone(payload.to) === normalizePhone(env.ADMIN_NOTIFY_WHATSAPP);
      if (!toAdminEmail && !toAdminWhatsApp) {
        return json({ error: `Forbidden: this needs a signed-in admin account (${caller.reason}).` }, 403);
      }
    }

    if (payload.action === "send_whatsapp") {
      if (!payload.to || !payload.templateName) {
        return json({ error: "Missing required fields: to, templateName" }, 400);
      }
      try {
        const result = await sendWhatsAppTemplate(env, payload);
        return new Response(result, { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        return json({ error: String(err.message || err) }, 502);
      }
    }

    if (payload.action === "whatsapp_statuses") {
      try {
        return json({ rows: await listWhatsAppStatuses(env, payload) }, 200);
      } catch (err) {
        return json({ error: String(err.message || err) }, 502);
      }
    }

    if (payload.action === "reset_password") {
      if (!payload.email || !payload.newPassword) {
        return json({ error: "Missing required fields: email, newPassword" }, 400);
      }
      try {
        const result = await resetFirebasePassword(env, payload.email, payload.newPassword);
        return json({ success: true, ...result }, 200);
      } catch (err) {
        return json({ error: String(err.message || err) }, 502);
      }
    }

    const { to, subject, text, html, attachments } = payload;
    if (!to || !subject || (!text && !html)) {
      return json({ error: "Missing required fields: to, subject, and text or html" }, 400);
    }
    try {
      const resendBody = await sendEmail(env, { to, subject, text, html, attachments });
      return new Response(resendBody, { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err) {
      return json({ error: String(err.message || err) }, 502);
    }
  }
};
