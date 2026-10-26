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
    ['notify.png', 'Get notified', 'Tap <b>Get notified</b> at the bottom of any page on SikhsinIndia.com for free notifications on your phone or computer.', 'https://sikhsinindia.com/'],
    ['website.png', 'Website', 'SikhsinIndia.com', 'https://sikhsinindia.com/'],
    ['email.png', 'Email', 'sikhsinindia@gmail.com', 'mailto:sikhsinindia@gmail.com'],
    ['whatsapp.png', 'WhatsApp Channel', 'SikhsinIndia.com channel', 'https://whatsapp.com/channel/0029VbE1JrUIyPtUz3qlSd0N'],
    ['instagram.png', 'Instagram', '@sikhs_in_india', 'https://www.instagram.com/sikhs_in_india'],
    ['x.png', 'X (Twitter)', '@SikhsinIndiacom', 'https://x.com/SikhsinIndiacom'],
    ['linkedin.png', 'LinkedIn', 'SikhsinIndia.com', 'https://www.linkedin.com/in/sikhsinindia-dot-com-preserving-heritage-inspiring-future-580912446']
  ];
  const tile = ([icon, label, value, href], wide) =>
    `<td ${wide ? 'colspan="2"' : 'width="50%"'} valign="top" style="padding:4px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${BORDER};border-radius:8px;"><tr>` +
    `<td width="40" valign="middle" style="padding:10px 0 10px 10px;"><a href="${href}"><img src="${ICONS}${icon}" alt="${label}" width="36" height="36" style="display:block;width:36px;height:36px;border:0;"></a></td>` +
    `<td valign="middle" style="padding:8px 10px;font-family:${font};">` +
    `<a href="${href}" style="font-size:14px;font-weight:bold;color:${NAVY};text-decoration:none;">${label}</a><br>` +
    `<span style="font-size:12.5px;line-height:1.4;color:${TEXT};">${wide ? value : `<a href="${href}" style="color:${NAVY};text-decoration:underline;">${value}</a>`}</span>` +
    `</td></tr></table></td>`;
  const rows = [`<tr>${tile(items[0], true)}</tr>`];
  for (let i = 1; i < items.length; i += 2) rows.push(`<tr>${tile(items[i])}${tile(items[i + 1])}</tr>`);

  const html =
    '<!-- stay-connected -->' +
    `<div data-block="stay-connected" style="max-width:600px;margin:24px auto 0;padding:16px 12px 12px;background:#f5f0e8;border-top:3px solid #F7941D;border-radius:8px;">` +
    `<p style="margin:0 4px 4px;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:bold;color:${NAVY};">Stay connected</p>` +
    `<p style="margin:0 4px 10px;font-family:${font};font-size:13.5px;line-height:1.5;color:${TEXT};">Stay connected with SikhsinIndia.com and let the light of Gurbani, the blessings of our Gurus, and the joy of every Gurpurab remain with you and your family.</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>` +
    // QR card: scan to open the website (pictures/00-index/qr-card.jpg)
    `<p style="margin:14px 0 4px;text-align:center;"><a href="${SITE}"><img src="${SITE}pictures/00-index/qr-card.jpg" alt="Scan to visit sikhsinindia.com" width="320" style="display:inline-block;width:320px;max-width:100%;height:auto;border:0;border-radius:10px;"></a></p>` +
    '</div>' +
    '<!-- /stay-connected -->';

  if (typeof module !== 'undefined' && module.exports) module.exports = html;
  else window.STAY_CONNECTED_HTML = html;
})();
