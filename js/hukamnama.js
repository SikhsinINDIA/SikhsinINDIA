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

  /* Show more than just the first line - a handful of verses, so the
     card is filled with real Gurbani rather than empty space. Capped
     by count AND a rough character budget, since some Hukamnamas run
     much longer per verse than others; "Read Full Hukamnama" covers
     the rest either way. */
  var MAX_VERSES_ON_CARD = 2;
  var CHAR_BUDGET = 230;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pickVerses(d) {
    /* verses[0] is just the title line (e.g. "Dhanaasaree, Fifth
       Mehla:"), already duplicated in raagEnglish/writerEnglish up in
       the attribution line, so skip it here and start from the first
       real line. Falls back to the single verseGurmukhi/verseTranslation
       pair for older cached data that has no "verses" array yet. */
    var all = Array.isArray(d.verses) ? d.verses.slice(1) : [];
    if (!all.length) {
      return d.verseGurmukhi ? [{ gurmukhi: d.verseGurmukhi, translation: d.verseTranslation }] : [];
    }
    var picked = [];
    var chars = 0;
    for (var i = 0; i < all.length && picked.length < MAX_VERSES_ON_CARD; i++) {
      var v = all[i];
      picked.push(v);
      chars += (v.gurmukhi || '').length + (v.translation || '').length;
      if (chars >= CHAR_BUDGET && picked.length > 0) break;
    }
    return picked;
  }

  function render(d) {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;

    var verses = pickVerses(d);
    var versesHtml = verses.map(function (v) {
      return '<div class="hnm-verse">' +
        '<p class="hnm-gurmukhi">' + esc(v.gurmukhi) + '</p>' +
        (v.translation ? '<p class="hnm-translation">' + esc(v.translation) + '</p>' : '') +
        '</div>';
    }).join('');

    mount.innerHTML =
      '<div class="hnm-card">' +
        '<div class="hnm-head">' +
          '<div class="hnm-kicker">&#128591; Today&rsquo;s Hukamnama</div>' +
          '<div class="hnm-date">' + esc(d.dateDisplay) + '</div>' +
        '</div>' +
        '<div class="hnm-body">' +
          '<div class="hnm-attrib">' +
            esc(d.raagEnglish) + (d.writerEnglish ? ' &middot; ' + esc(d.writerEnglish) : '') +
            ' &middot; Sri Harmandir Sahib, Amritsar' +
          '</div>' +
          (versesHtml || '<p class="hnm-none">No Hukamnama available right now.</p>') +
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
