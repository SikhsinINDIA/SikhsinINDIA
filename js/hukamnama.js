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

  /* SGPC's own recordings of the Hukamnama from Sri Harmandir Sahib and its
     Katha (explanation). Each day's file is named by date (DDMMYY), so the
     audio matches the date of the text on the card; if that file is missing,
     the player falls back to SGPC's "latest" file. */
  var SGPC_AUDIO = {
    hukamnama: {
      label: 'Hukamnama',
      dated: function (ddmmyy) { return 'https://hs.sgpc.net/hukamnamaaudio/SGPCNET' + ddmmyy + '.mp3'; },
      latest: 'https://hs.sgpc.net/uploadhukamnama/hukamnama.mp3'
    },
    katha: {
      label: 'Katha',
      dated: function (ddmmyy) { return 'https://hs.sgpc.net/kathaaudio/katha' + ddmmyy + '.mp3'; },
      latest: 'https://hs.sgpc.net/uploadkatha/katha.mp3'
    }
  };

  function ddmmyy(isoDate) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '');
    return m ? m[3] + m[2] + m[1].slice(2) : null;
  }

  function audioSrc(kind, d) {
    var a = SGPC_AUDIO[kind];
    var day = ddmmyy(d.date);
    return day ? a.dated(day) : a.latest;
  }

  function audioHtml(d) {
    return '<div class="hnm-audio">' +
        '<div class="hnm-audio-top">' +
          '<span class="hnm-audio-label">&#128266; Listen</span>' +
          '<div class="hnm-audio-tabs" role="group" aria-label="Choose recording">' +
            '<button type="button" class="hnm-audio-tab active" data-kind="hukamnama" aria-pressed="true">Hukamnama</button>' +
            '<button type="button" class="hnm-audio-tab" data-kind="katha" aria-pressed="false">Katha</button>' +
          '</div>' +
        '</div>' +
        '<audio class="hnm-audio-player" controls preload="none" src="' + esc(audioSrc('hukamnama', d)) + '"' +
          ' aria-label="Today&rsquo;s Hukamnama audio from Sri Harmandir Sahib">' +
          'Your browser can&rsquo;t play this audio.</audio>' +
        '<div class="hnm-audio-credit">Audio: SGPC, Sri Amritsar</div>' +
      '</div>';
  }

  function wireAudio(mount, d) {
    var player = mount.querySelector('.hnm-audio-player');
    var tabs = mount.querySelectorAll('.hnm-audio-tab');
    if (!player) return;
    var kind = 'hukamnama';

    // Dated file missing (e.g. not uploaded yet): use SGPC's latest file.
    player.addEventListener('error', function () {
      var latest = SGPC_AUDIO[kind].latest;
      if (player.src !== latest) {
        player.src = latest;
        player.play().catch(function () { /* user presses play */ });
      }
    });

    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener('click', function () {
        if (tab.dataset.kind === kind) return;
        var wasPlaying = !player.paused;
        kind = tab.dataset.kind;
        Array.prototype.forEach.call(tabs, function (t) {
          var on = t === tab;
          t.classList.toggle('active', on);
          t.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        player.src = audioSrc(kind, d);
        player.setAttribute('aria-label', 'Today’s ' + SGPC_AUDIO[kind].label + ' audio from Sri Harmandir Sahib');
        if (wasPlaying) player.play().catch(function () { /* user presses play */ });
      });
    });

    player.addEventListener('play', function () {
      if (window.gtag) window.gtag('event', 'hukamnama_audio_play', { recording: kind });
    });
  }

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

  /* The card's markup. Also used by scripts/update-hukamnama.js, which
     writes it straight into index.html each morning so the Gurbani shows
     without waiting for any script (it is the page's largest element). */
  function cardHtml(d, kicker) {
    var verses = pickVerses(d);
    var versesHtml = verses.map(function (v) {
      return '<div class="hnm-verse">' +
        '<p class="hnm-gurmukhi">' + esc(v.gurmukhi) + '</p>' +
        (v.translation ? '<p class="hnm-translation">' + esc(v.translation) + '</p>' : '') +
        '</div>';
    }).join('');

    return '<div class="hnm-card" data-date="' + esc(d.date) + '">' +
        '<div class="hnm-head">' +
          '<h2 class="hnm-kicker">&#128591; ' + kicker + '</h2>' +
          '<div class="hnm-date">' + esc(d.dateDisplay) + '</div>' +
        '</div>' +
        '<div class="hnm-body">' +
          audioHtml(d) +
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

  var TODAY = 'Today&rsquo;s Hukamnama';
  var LATEST = 'Latest Hukamnama';

  function render(d) {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    /* The data file is refreshed each morning by a GitHub Action. If that run
       is late or fails, don't call an older Hukamnama "today's". */
    mount.innerHTML = cardHtml(d, d.date === indiaToday() ? TODAY : LATEST);
    wireAudio(mount, d);
  }

  // Today's date in India as YYYY-MM-DD (the same form as d.date).
  function indiaToday() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    } catch (e) {
      return '';
    }
  }

  function fail() {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    mount.innerHTML =
      '<div class="hnm-card"><div class="hnm-head">' +
      '<h2 class="hnm-kicker">&#128591; Today&rsquo;s Hukamnama</h2></div>' +
      '<div class="hnm-body"><p class="hnm-none">This feature is briefly unavailable.</p></div></div>';
  }

  // In Node (scripts/update-hukamnama.js) only the markup builder is needed.
  if (typeof module === 'object' && module.exports) {
    module.exports = { cardHtml: cardHtml, TODAY: TODAY };
    return;
  }

  function start() {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;

    /* The card is already in the page (written into index.html with the
       day's data): keep it, so nothing is redrawn, and just wire up the
       audio - and relabel it if that day has passed. */
    var d = window.HUKAMNAMA;
    var built = mount.querySelector('.hnm-card[data-date]');
    if (built && d && built.getAttribute('data-date') === d.date) {
      if (d.date !== indiaToday()) {
        var kicker = built.querySelector('.hnm-kicker');
        if (kicker) kicker.innerHTML = '&#128591; ' + LATEST;
      }
      wireAudio(mount, d);
      return;
    }

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
