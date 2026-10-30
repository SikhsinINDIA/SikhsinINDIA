/* ──────────────────────────────────────────────────────────────
   "Stay connected" footer for every Mass Mailer email
   One copy of the footer, used by 01-mass-mailer.html (it starts every new
   message) and by scripts that update the saved templates. Email-safe HTML:
   tables, inline styles, and icons loaded from sikhsinindia.com
   (pictures/00-index/icons), ending with the "Scan to visit" QR card
   (pictures/00-index/qr-card.jpg). It sits between <!-- stay-connected --> and
   <!-- /stay-connected -->, so it can be found and replaced later.
   ────────────────────────────────────────────────────────────── */
(function () {
  const SITE = 'https://sikhsinindia.com/';
  const ICONS = SITE + 'pictures/00-index/icons/';
  const NAVY = '#0d1b3e', TEXT = '#2b2b2b', BORDER = '#e3dccd';
  const font = 'Arial,Helvetica,sans-serif';
  const items = [
    ['notify.png', 'Get notified', 'Tap the bell on any page', 'https://sikhsinindia.com/'],
    ['website.png', 'Website', 'SikhsinIndia.com', 'https://sikhsinindia.com/'],
    ['email.png', 'Email', 'sikhsinindia@gmail.com', 'mailto:sikhsinindia@gmail.com'],
    ['whatsapp.png', 'WhatsApp Channel', 'SikhsinIndia.com channel', 'https://whatsapp.com/channel/0029VbE1JrUIyPtUz3qlSd0N'],
    ['facebook.png', 'Facebook', 'Sikhs in India', 'https://www.facebook.com/profile.php?id=61594681240659'],
    ['instagram.png', 'Instagram', '@sikhs_in_india', 'https://www.instagram.com/sikhs_in_india'],
    ['x.png', 'X (Twitter)', '@SikhsinIndiacom', 'https://x.com/SikhsinIndiacom'],
    ['linkedin.png', 'LinkedIn', 'SikhsinIndia.com', 'https://www.linkedin.com/in/sikhsinindia-dot-com-preserving-heritage-inspiring-future-580912446']
  ];
  // Eight tiles of one size, two per row.
  const tile = ([icon, label, value, href]) =>
    `<td width="50%" valign="top" style="padding:4px;">` +
    `<table role="presentation" width="100%" height="58" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${BORDER};border-radius:8px;height:58px;"><tr>` +
    `<td width="40" valign="middle" style="padding:10px 0 10px 10px;"><a href="${href}"><img src="${ICONS}${icon}" alt="${label}" width="36" height="36" style="display:block;width:36px;height:36px;border:0;"></a></td>` +
    `<td valign="middle" style="padding:8px 10px;font-family:${font};">` +
    `<a href="${href}" style="font-size:14px;font-weight:bold;color:${NAVY};text-decoration:none;">${label}</a><br>` +
    `<span style="font-size:12.5px;line-height:1.4;color:${TEXT};"><a href="${href}" style="color:${NAVY};text-decoration:underline;">${value}</a></span>` +
    `</td></tr></table></td>`;
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(`<tr>${tile(items[i])}${tile(items[i + 1])}</tr>`);

  // Sister site card: Sikhs in World logo (pictures/00-index/sikhsinworld-logo.png,
  // a copy of sikhsinworld.com's own) + link, full width under the tiles.
  const WORLD = 'https://sikhsinworld.com/';
  const world =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#ffffff;border:1px solid ${BORDER};border-radius:8px;"><tr>` +
    `<td width="96" valign="middle" style="padding:10px 4px 10px 12px;"><a href="${WORLD}"><img src="${SITE}pictures/00-index/sikhsinworld-logo.png" alt="Sikhs in World logo" width="84" style="display:block;width:84px;height:auto;border:0;"></a></td>` +
    `<td valign="middle" style="padding:10px 12px 10px 8px;font-family:${font};">` +
    `<span style="font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#F7941D;">Our sister website</span><br>` +
    `<a href="${WORLD}" style="font-size:17px;font-weight:bold;color:${NAVY};text-decoration:none;">Sikhs in World</a><br>` +
    `<span style="font-size:13px;line-height:1.5;color:${TEXT};">Sikh communities, Gurudwaras and heritage in every country.</span><br>` +
    `<a href="${WORLD}" style="display:inline-block;margin-top:8px;padding:7px 14px;background:#F7941D;color:${NAVY};font-size:13px;font-weight:bold;text-decoration:none;border-radius:999px;">&#127757; Visit SikhsinWorld.com</a>` +
    `</td></tr></table>`;
  // Marked so applyLatestFooter() can find and replace it on its own (the
  // newsletter carries this card without the rest of this footer).
  const worldBlock = '<!-- sikhsinworld -->' + world + '<!-- /sikhsinworld -->';

  const html =
    '<!-- stay-connected -->' +
    `<div data-block="stay-connected" style="max-width:600px;margin:24px auto 0;padding:16px 12px 12px;background:#f5f0e8;border-top:3px solid #F7941D;border-radius:8px;">` +
    `<p style="margin:0 4px 4px;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:bold;color:${NAVY};">Stay connected</p>` +
    `<p style="margin:0 4px 10px;font-family:${font};font-size:13.5px;line-height:1.5;color:${TEXT};">Stay connected with SikhsinIndia.com and let the light of Gurbani, the blessings of our Gurus, and the joy of every Gurpurab remain with you and your family.</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>` +
    worldBlock +
    // QR card: scan to open the website (pictures/00-index/qr-card.jpg)
    `<p style="margin:14px 0 4px;text-align:center;"><a href="${SITE}"><img src="${SITE}pictures/00-index/qr-card.jpg" alt="Scan to visit sikhsinindia.com" width="320" style="display:inline-block;width:320px;max-width:100%;height:auto;border:0;border-radius:10px;"></a></p>` +
    '</div>' +
    '<!-- /stay-connected -->';

  /* Brings a saved format up to date with the current footer. Returns
     { html, status }: 'replaced' (swapped its stay-connected block),
     'inserted' (a format with its own closing section, like the newsletter:
     the Sikhs in World card goes in a new row just above its navy
     "Waheguru Ji Ka Khalsa" footer), 'unchanged', or 'skipped' (no
     footer found to update). Used by 01-mass-mailer.html's
     "Update footer in all saved formats" button. */
  const STAY_RE = /<!-- stay-connected -->[\s\S]*?<!-- \/stay-connected -->/;
  const WORLD_RE = /<!-- sikhsinworld -->[\s\S]*?<!-- \/sikhsinworld -->/;
  const NAVY_ROW_RE = /<tr[^>]*>\s*<td style="[^"]*background:\s*(?:#0d1b3e|rgb\(13, 27, 62\));[^"]*padding:\s*20px 28px;/i;
  function applyLatestFooter(body) {
    const h = String(body || '');
    let out, status;
    if (STAY_RE.test(h)) { out = h.replace(STAY_RE, () => html); status = 'replaced'; }
    else if (WORLD_RE.test(h)) { out = h.replace(WORLD_RE, () => worldBlock); status = 'replaced'; }
    else if (NAVY_ROW_RE.test(h)) {
      const i = h.search(NAVY_ROW_RE);
      out = h.slice(0, i) + `<tr><td style="padding:0 28px 22px;">${worldBlock}</td></tr>` + h.slice(i);
      status = 'inserted';
    } else return { html: h, status: 'skipped' };
    return { html: out, status: out === h ? 'unchanged' : status };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { html, worldBlock, applyLatestFooter };
  else { window.STAY_CONNECTED_HTML = html; window.applyLatestFooter = applyLatestFooter; }
})();
