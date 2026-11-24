/* ──────────────────────────────────────────────────────────────
   "Follow us" bar.
   Loaded from js/push.js, so it appears on every page that has push.js.
   Adds a small bar with the official Sikhs in India social links
   (same links as the email "Stay connected" block,
   100-misc/01-mass-mailers/stay-connected.js), in the page's language:
     /hi/... pages → Hindi, /pa/... pages → Punjabi, all others → English.
   Placed just above the page footer, or at the end of the page if there
   is no footer. Skipped on the home page and on pages that already show
   social links (a .social block or a Facebook link).
   ────────────────────────────────────────────────────────────── */
(function () {
  const path = location.pathname;
  if (path === '/' || path === '/index.html') return;
  if (document.getElementById('sii-follow')) return;

  const lang = (/^\/(hi|pa)(\/|$)/.exec(path) || [])[1] || 'en';
  const T = {
    en: { title: 'Follow Sikhs in India', sub: 'Gurbani, Gurpurab greetings and Sikh heritage, every day.' },
    hi: { title: 'सिख्स इन इंडिया से जुड़ें', sub: 'गुरबाणी, गुरपुरब की शुभकामनाएँ और सिख विरासत — हर दिन।' },
    pa: { title: 'ਸਿੱਖਸ ਇਨ ਇੰਡੀਆ ਨਾਲ ਜੁੜੋ', sub: 'ਗੁਰਬਾਣੀ, ਗੁਰਪੁਰਬ ਦੀਆਂ ਵਧਾਈਆਂ ਅਤੇ ਸਿੱਖ ਵਿਰਾਸਤ — ਹਰ ਰੋਜ਼।' }
  }[lang];

  const ICONS = '/pictures/00-index/icons/';
  const YT = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#fff" d="M9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>';
  const links = [
    ['Facebook', 'https://www.facebook.com/SikhsinWorld', ICONS + 'facebook.png'],
    ['WhatsApp Channel', 'https://whatsapp.com/channel/0029VbE1JrUIyPtUz3qlSd0N', ICONS + 'whatsapp.png'],
    ['Instagram', 'https://www.instagram.com/sikhs_in_india', ICONS + 'instagram.png'],
    ['YouTube', 'https://www.youtube.com/@SikhsInIndia', null],
    ['X (Twitter)', 'https://x.com/SikhsinIndiacom', ICONS + 'x.png']
  ];

  function hasSocialAlready() {
    if (document.querySelector('.social')) return true;
    return [...document.querySelectorAll('a[href*="facebook.com/"]')].some((a) => a.offsetParent !== null);
  }

  function build() {
    if (hasSocialAlready() || !document.body) return;
    const wrap = document.createElement('section');
    wrap.id = 'sii-follow';
    wrap.setAttribute('aria-label', T.title);
    wrap.style.cssText = 'max-width:720px;margin:28px auto 20px;padding:16px 14px 14px;background:#f5f0e8;' +
      'border-top:3px solid #F7941D;border-radius:10px;text-align:center;font-family:Arial,Helvetica,sans-serif;' +
      'box-sizing:border-box;clear:both;';
    const h = document.createElement('div');
    h.textContent = T.title;
    h.style.cssText = 'font-family:Georgia,"Times New Roman",serif;font-size:19px;font-weight:bold;color:#0d1b3e;margin:0 0 4px;';
    const p = document.createElement('div');
    p.textContent = T.sub;
    p.style.cssText = 'font-size:13.5px;line-height:1.5;color:#2b2b2b;margin:0 0 12px;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:12px;';
    links.forEach(([label, href, icon]) => {
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = label;
      a.setAttribute('aria-label', 'Sikhs in India on ' + label);
      a.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;' +
        'border-radius:10px;background:#fff;border:1px solid #e3dccd;text-decoration:none;';
      if (icon) {
        const img = document.createElement('img');
        img.src = icon;
        img.alt = label;
        img.width = 30;
        img.height = 30;
        img.loading = 'lazy';
        img.style.cssText = 'width:30px;height:30px;display:block;border:0;';
        a.appendChild(img);
      } else {
        const s = document.createElement('span');
        s.innerHTML = YT;
        s.style.cssText = 'display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:7px;background:#FF0000;';
        a.appendChild(s);
      }
      row.appendChild(a);
    });
    wrap.append(h, p, row);

    const footer = document.querySelector('body > footer') || [...document.querySelectorAll('footer')].pop();
    const parent = footer && footer.parentNode ? footer.parentNode : document.body;
    // Some pages lay the body (or the footer's parent) out side by side
    // (flex row / grid). Make the bar take a full line of its own there.
    const ps = getComputedStyle(parent);
    if (ps.display.includes('flex') && !ps.flexDirection.startsWith('column')) {
      if (ps.flexWrap === 'nowrap') parent.style.flexWrap = 'wrap';
      wrap.style.flex = '0 0 100%';
    } else if (ps.display.includes('grid')) {
      wrap.style.gridColumn = '1 / -1';
    }
    if (footer && footer.parentNode) footer.parentNode.insertBefore(wrap, footer);
    else document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
