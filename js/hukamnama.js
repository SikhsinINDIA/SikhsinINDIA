/* ──────────────────────────────────────────────────────────────
   Today's Hukamnama
   Reads data/hukamnama.json - a small file rewritten once a day by
   .github/workflows/update-hukamnama.yml - and renders it on the
   homepage. The homepage itself never needs to be touched when the
   Hukamnama changes.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var MOUNT_ID = 'todayHukamnama';
  var DATA_URL = 'data/hukamnama.json';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function render(d) {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;

    mount.innerHTML =
      '<div class="hnm-card">' +
        '<div class="hnm-head">' +
          '<div class="hnm-kicker">&#128591; Today&rsquo;s Hukamnama</div>' +
          '<div class="hnm-sub">Sri Harmandir Sahib, Amritsar</div>' +
          '<div class="hnm-date">' + esc(d.dateDisplay) + '</div>' +
        '</div>' +
        '<div class="hnm-body">' +
          '<div class="hnm-attrib">' +
            esc(d.raagEnglish) + (d.writerEnglish ? ' &middot; ' + esc(d.writerEnglish) : '') +
          '</div>' +
          '<p class="hnm-gurmukhi">' + esc(d.verseGurmukhi) + '</p>' +
          (d.verseTranslation ? '<p class="hnm-translation">' + esc(d.verseTranslation) + '</p>' : '') +
          '<div class="hnm-ang">Ang ' + esc(d.ang) + '</div>' +
          '<a class="hnm-cta" href="hukamnama.html">Read Full Hukamnama &rarr;</a>' +
        '</div>' +
      '</div>';
  }

  function fail() {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    mount.innerHTML =
      '<div class="hnm-card"><div class="hnm-head">' +
      '<div class="hnm-kicker">&#128591; Today&rsquo;s Hukamnama</div></div>' +
      '<div class="hnm-body"><p class="hnm-none">This feature is briefly unavailable.</p></div></div>';
  }

  function start() {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;

    /* data/hukamnama.js sets this. Using it avoids fetch(), which browsers
       block when the page is opened straight from disk (file://). */
    if (window.HUKAMNAMA && window.HUKAMNAMA.verseGurmukhi) {
      render(window.HUKAMNAMA);
      return;
    }

    fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(render)
      .catch(function (err) {
        console.error('Today’s Hukamnama: could not load ' + DATA_URL, err);
        fail();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
