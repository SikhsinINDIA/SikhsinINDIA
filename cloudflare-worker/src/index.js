/*
 * Cloudflare Worker for the SikhsinIndia static site. Three jobs:
 *
 * 1. Send email via the Resend API. Exists because none of the client-side
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
 *    list of body variables, not a message string. See
 *    03-nitnem/03-06-akhand-path/firebase.js's WHATSAPP_* constants for
 *    the exact template names/wording this site currently has approved.
 *
 * Deploy: see cloudflare-worker's own docs / wrangler.toml comments.
 * Requires these secrets, set via `wrangler secret put <NAME>`:
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

async function sendWhatsAppTemplate(env, { to, templateName, languageCode, params }) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("WhatsApp is not configured yet (missing WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID secrets).");
  }

  const template = {
    name: templateName,
    language: { code: languageCode || "en_US" }
  };
  if (Array.isArray(params) && params.length) {
    template.components = [{
      type: "body",
      parameters: params.map((p) => ({ type: "text", text: String(p == null ? "" : p) }))
    }];
  }

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
  return resBody;
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

async function sendEmail(env, { to, subject, text, html, attachments }) {
  const body = {
    from: env.FROM_ADDRESS || "SikhsinIndia <onboarding@resend.dev>",
    to: [to],
    subject,
    text,
    html
  };
  if (Array.isArray(attachments) && attachments.length) {
    body.attachments = await Promise.all(attachments.map(resolveAttachment));
  }
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

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Secret"
    };
    const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      return json({ error: "Invalid JSON body" }, 400);
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
