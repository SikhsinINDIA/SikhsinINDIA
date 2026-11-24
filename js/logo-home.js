/* ──────────────────────────────────────────────────────────────
   Logo → home page.
   Loaded from js/push.js, so it runs on every page that has push.js.
   Wraps the SikhsInIndia.com logo in a link to the landing page:
     /hi/...  pages → /hi/   (Hindi home page)
     /pa/...  pages → /pa/   (Punjabi home page)
     all other pages → /
   Pages whose logo already has a link are left alone.
   ────────────────────────────────────────────────────────────── */
(function () {
  const LOGO = /(^|\/)sikhsinindia(-logo)?\.(png|webp)(\?|#|$)/i;
  const path = location.pathname;
  const lang = /^\/(hi|pa)(\/|$)/.exec(path);
  const home = lang ? '/' + lang[1] + '/' : '/';
  const label = !lang ? 'SikhsInIndia.com home page'
    : lang[1] === 'hi' ? 'सिख्स इन इंडिया होम पेज' : 'ਸਿੱਖਸ ਇਨ ਇੰਡੀਆ ਹੋਮ ਪੇਜ';

  function link() {
    document.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (!LOGO.test(src)) return;
      const parentLink = img.closest('a');
      if (parentLink) {
        const h = (parentLink.getAttribute('href') || '').trim();
        if (h === '' || h === '#') parentLink.setAttribute('href', home);
        return;
      }
      const a = document.createElement('a');
      a.href = home;
      a.title = label;
      a.setAttribute('aria-label', label);
      a.className = 'sii-logo-home';
      img.parentNode.insertBefore(a, img);
      a.appendChild(img);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', link);
  } else {
    link();
  }
})();
