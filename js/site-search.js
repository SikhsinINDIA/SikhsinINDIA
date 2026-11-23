/* ──────────────────────────────────────────────────────────────
   Site search button
   Loaded on every indexable page by js/push.js (which
   scripts/seo-optimize.js already adds everywhere). Adds a small
   "Search" button under the language switcher and the Sikhs in World
   button that opens search.html in the page's language. Pressing "/"
   anywhere outside a text box opens it too.
   ────────────────────────────────────────────────────────────── */
(function () {
  if (/\/search\.html$/.test(location.pathname)) return;
  if (document.getElementById('sii-search-btn')) return;

  var lang = (document.documentElement.lang || 'en').slice(0, 2);
  if (lang !== 'hi' && lang !== 'pa') lang = 'en';
  var LABEL = { en: 'Search', hi: 'खोजें', pa: 'ਖੋਜੋ' }[lang];
  var HREF = lang === 'en' ? '/search.html' : '/' + lang + '/search.html';

  function add() {
    var a = document.createElement('a');
    a.id = 'sii-search-btn';
    a.href = HREF;
    a.title = LABEL + ' SikhsInIndia.com';
    a.setAttribute('aria-label', LABEL);
    a.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style="flex-shrink:0">' +
      '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/>' +
      '<path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>' +
      '<span></span>';
    a.querySelector('span').textContent = LABEL;
    a.style.cssText = 'position:fixed;right:10px;top:96px;z-index:9989;display:inline-flex;align-items:center;gap:6px;' +
      'background:#0d1b3e;color:#F7941D;border:2px solid #F7941D;border-radius:999px;padding:7px 14px;' +
      'font:bold 14px/1.2 Arial,sans-serif;text-decoration:none;box-shadow:0 2px 10px rgba(0,0,0,.3);';
    var style = document.createElement('style');
    style.textContent = '#sii-search-btn:hover{background:#F7941D!important;color:#0d1b3e!important}' +
      '@media (max-width:600px){#sii-search-btn{top:86px!important;font-size:12px!important;padding:5px 10px!important}}' +
      '@media print{#sii-search-btn{display:none!important}}';
    document.head.appendChild(style);
    document.body.appendChild(a);
  }

  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);

  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
    e.preventDefault();
    location.href = HREF;
  });
})();
