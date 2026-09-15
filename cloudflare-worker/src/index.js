/*
 * Cloudflare Worker: sends email via the Resend API on behalf of the
 * SikhsinIndia static site. Exists because none of the client-side form
 * backends tried (EmailJS free tier, SnapitForms, FormSubmit, Formspree)
 * can send to an arbitrary, dynamically-chosen recipient for free — this
 * Worker is a thin authenticated proxy that can, since the Resend API key
 * lives here server-side and is never exposed to the browser.
 *
 * Deploy: see the repo root README instructions. Requires two secrets set
 * via `wrangler secret put`:
 *   RESEND_API_KEY    — from the Resend dashboard
 *   APP_SHARED_SECRET — a random string; the site sends it back as the
 *                        X-App-Secret header so randos on the internet can't
 *                        use this Worker to burn your Resend send quota.
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-App-Secret"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!env.APP_SHARED_SECRET || request.headers.get("X-App-Secret") !== env.APP_SHARED_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { to, subject, text, html } = payload;
    if (!to || !subject || (!text && !html)) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, subject, and text or html" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.FROM_ADDRESS || "SikhsinIndia <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
        html
      })
    });

    const resendBody = await resendRes.text();
    if (!resendRes.ok) {
      return new Response(JSON.stringify({ error: "Resend API error", detail: resendBody }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(resendBody, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};
