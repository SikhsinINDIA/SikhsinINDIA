/* ──────────────────────────────────────────────────────────────
   Today in Sikh History
   Reads data/sikh-history.json (365 records keyed MM-DD) and renders
   the entry for the chosen day. Nothing here is year-dependent, so
   14 April always shows Vaisakhi, whatever the year.

   Records marked "anchored" are tied to that calendar date and are
   introduced as history. The rest carry a theme for reflection and
   are worded as such, so the page never claims something happened on
   a day it did not.

   The card also shows what the site's Sikh calendar (the Calendar
   collection in Firestore, the same data as the homepage's events bar)
   observes on that date this year. Gurpurabs follow the lunar calendar,
   so they fall on different dates each year; showing them here, labelled
   as this year's observance, keeps the card and the events bar in step.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var MOUNT_ID = 'todaySikhHistory';
  var DATA_URL = 'data/sikh-history.json';

  /* how many of the day's other events the homepage card lists.
     Kept small (rather than the full-page's list) so this card's
     height stays close to the Hukamnama card next to it. */
  var MAX_ON_CARD = 2;

  /* the main event description is capped too, for the same reason -
     some days' "detail" text runs much longer than others. */
  var MAX_DETAIL_CHARS = 150;

  var FIRESTORE_QUERY_URL = 'https://firestore.googleapis.com/v1/projects/' +
    'sikhsinindia-67a6b/databases/(default)/documents:runQuery';

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  var records = null;   // MM-DD -> record
  var viewDate = null;  // Date currently shown
  var todayKey = null;
  var observances = {}; // 'YYYY-MM' -> { 'YYYY-MM-DD': [{category, description}] }, or 'loading'

  function pad(n) { return String(n).padStart(2, '0'); }
  function keyOf(d) { return pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Cuts at the last full word before the limit, so the card never
     mid-word-truncates a long "detail" entry. */
  function truncate(s, max) {
    s = String(s == null ? '' : s);
    if (s.length <= max) return s;
    var cut = s.slice(0, max);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 0) cut = cut.slice(0, lastSpace);
    return cut.replace(/[.,;:\s]+$/, '') + '…';
  }

  /* The sheet has no 29 February, so on a leap day we show 28 February. */
  function lookup(d) {
    var k = keyOf(d);
    if (!records[k] && k === '02-29') k = '02-28';
    return records[k] || null;
  }

  function longDate(d) {
    return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  }
  function shortDate(d) {
    return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()].slice(0, 3);
  }

  function shiftDay(n) {
    var d = new Date(viewDate.getTime());
    d.setDate(d.getDate() + n);
    render(d);
  }

  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* Calendar entries that are about the site rather than the Panth
     (the monthly newsletter) are left out of the card. */
  function isObservance(o) { return o.description && !/newsletter/i.test(o.description); }

  /* The calendar's entries for d's month, grouped by India date. Fetched
     once per month; the card re-renders when they arrive. */
  function loadMonth(d) {
    var mk = d.getFullYear() + '-' + pad(d.getMonth() + 1);
    if (observances[mk]) return;
    observances[mk] = 'loading';
    var y = d.getFullYear(), m = d.getMonth() + 1;
    var last = new Date(y, m, 0).getDate();
    var start = new Date(y + '-' + pad(m) + '-01T00:00:00+05:30');
    var end = new Date(y + '-' + pad(m) + '-' + pad(last) + 'T23:59:59+05:30');
    var fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
    fetch(FIRESTORE_QUERY_URL, {
      method: 'POST',
      // text/plain keeps this a "simple" request (no OPTIONS round trip first)
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: 'Calendar' }],
        where: { compositeFilter: { op: 'AND', filters: [
          { fieldFilter: { field: { fieldPath: 'Date' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: start.toISOString() } } },
          { fieldFilter: { field: { fieldPath: 'Date' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: end.toISOString() } } }
        ] } },
        orderBy: [{ field: { fieldPath: 'Date' }, direction: 'ASCENDING' }]
      } })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows) {
        var byDay = {};
        rows.forEach(function (r) {
          var f = r.document && r.document.fields;
          if (!f || !f.Date) return;
          var o = {
            category: (f.Category || {}).stringValue || '',
            description: (f.Description || {}).stringValue || ''
          };
          if (!isObservance(o)) return;
          var k = fmt.format(new Date(f.Date.timestampValue));
          (byDay[k] = byDay[k] || []).push(o);
        });
        observances[mk] = byDay;
        if (viewDate && ymd(viewDate).slice(0, 7) === mk) render(viewDate);
      })
      .catch(function (err) {
        console.error('Today in Sikh History: could not load the Sikh calendar', err);
        observances[mk] = {};
      });
  }

  function obsFor(d) {
    var month = observances[ymd(d).slice(0, 7)];
    return month && month !== 'loading' ? (month[ymd(d)] || []) : null;
  }

  function render(d) {
    viewDate = d;
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    var isToday = keyOf(d) === todayKey && d.toDateString() === new Date().toDateString();
    var obs = obsFor(d);
    if (obs === null) {
      loadMonth(d);
      /* until the calendar arrives, keep today's observance if the
         page already shows it (written in by the daily script) */
      if (isToday) {
        var cur = mount.querySelector('.tsh-card[data-key="' + keyOf(d) + '"][data-obs]');
        if (cur) return;
      }
    }
    mount.innerHTML = cardHtml(d, lookup(d), isToday, obs);
  }

  /* The card's markup for date d and its record. Also used by
     scripts/update-homepage-today.js, which writes today's card straight
     into index.html each morning so it is in the page without JavaScript. */
  function cardHtml(d, rec, isToday, obs) {
    var prev = new Date(d.getTime()); prev.setDate(prev.getDate() - 1);
    var next = new Date(d.getTime()); next.setDate(next.getDate() + 1);

    obs = (obs || []).filter(isObservance);
    var obsLabel = (isToday ? 'Observed today' : 'Observed on this date in ' + d.getFullYear()) +
      ' &middot; Sikh calendar';
    function obsItems(list) {
      return '<ul class="tsh-obs-list">' + list.map(function (o) {
        return '<li>' + (o.category ? '<b>' + esc(o.category) + '</b> &middot; ' : '') +
          esc(o.description) + '</li>';
      }).join('') + '</ul>';
    }

    var body;
    if (obs.length && (!rec || !rec.anchored)) {
      /* No dated event in the history records, but the calendar marks
         the day: the observance becomes the card's main entry. */
      body =
        '<div class="tsh-lead-row"><span class="tsh-chip tsh-chip-' +
          (/historical/i.test(obs[0].category) ? 'historical' : 'gurpurab') + '">' +
          esc(obs[0].category || 'Observance') + '</span>' +
          '<span class="tsh-lead">' + obsLabel + '</span></div>' +
        '<h3 class="tsh-title">' + esc(obs[0].description) + '</h3>' +
        (obs.length > 1 ? '<div class="tsh-obs">' + obsItems(obs.slice(1)) + '</div>' : '') +
        '<p class="tsh-caveat">Sikh calendar dates follow the traditional lunar calendar, so many of them move from year to year.</p>';
    } else if (!rec) {
      body = '<p class="tsh-none">No entry recorded for this date.</p>';
    } else {
      var chip = '<span class="tsh-chip tsh-chip-' +
        (rec.category === 'Gurpurab' ? 'gurpurab' : 'historical') + '">' +
        esc(rec.category) + '</span>';

      /* anchored entries are introduced as history; the rest as a theme */
      var lead = rec.anchored
        ? (rec.year ? 'On this day in ' + esc(rec.year) : 'Marked on this day')
        : 'A theme to reflect on today';

      /* Most days carry more than one recorded event. The rest are listed
         under the headline, oldest first, so the day reads as a timeline. */
      var more = '';
      if (rec.more && rec.more.length) {
        /* Some days carry a dozen entries. The card shows the first few and
           points at the 365-day page for the rest, rather than growing until
           it pushes the whole homepage down. */
        var shown = rec.more.slice(0, MAX_ON_CARD);
        var hidden = rec.more.length - shown.length;
        more =
          '<div class="tsh-more">' +
            '<div class="tsh-more-head">Also on this day</div>' +
            '<ul class="tsh-more-list">' +
              shown.map(function (m) {
                return '<li><span class="tsh-more-year">' + esc(m.year) + '</span>' +
                  esc(m.title) +
                  (m.note ? '<span class="tsh-more-note">' + esc(m.note) + '</span>' : '') +
                  '</li>';
              }).join('') +
            '</ul>' +
            (hidden > 0
              ? '<div class="tsh-more-rest">' + hidden +
                ' more on this day &mdash; see the 365-day page below</div>'
              : '') +
          '</div>';
      }

      body =
        (obs.length
          ? '<div class="tsh-obs"><div class="tsh-obs-head">' + obsLabel + '</div>' +
              obsItems(obs) + '</div>'
          : '') +
        '<div class="tsh-lead-row">' + chip + '<span class="tsh-lead">' + lead + '</span></div>' +
        '<h3 class="tsh-title">' + esc(rec.title) + '</h3>' +
        (rec.detail ? '<p class="tsh-detail">' + esc(truncate(rec.detail, MAX_DETAIL_CHARS)) + '</p>' : '') +
        (rec.anchored ? '' :
          '<p class="tsh-caveat">This day has no single recorded event in our records; ' +
          'the theme above is offered for reflection.</p>') +
        more;
    }

    return '<div class="tsh-card" data-key="' + keyOf(d) + '"' + (obs.length ? ' data-obs' : '') + '>' +
        '<div class="tsh-head">' +
          '<h2 class="tsh-kicker">&#128220; Today in Sikh History</h2>' +
          '<div class="tsh-date">' + esc(longDate(d)) +
            (rec && rec.nanakshahi ? ' <span class="tsh-dot">&middot;</span> ' +
              esc(rec.nanakshahi) + ' <span class="tsh-nk">Nanakshahi</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="tsh-body">' + body + '</div>' +
        '<div class="tsh-nav">' +
          '<button type="button" class="tsh-btn" data-tsh="prev" aria-label="Previous day">' +
            '&larr; ' + esc(shortDate(prev)) + '</button>' +
          (isToday
            ? '<span class="tsh-today-label">Today</span>'
            : '<button type="button" class="tsh-btn tsh-btn-today" data-tsh="today">Back to Today</button>') +
          '<button type="button" class="tsh-btn" data-tsh="next" aria-label="Next day">' +
            esc(shortDate(next)) + ' &rarr;</button>' +
        '</div>' +
        '<div class="tsh-explore">' +
          /* each day has its own page, built by scripts/build-sikh-history-pages.js */
          '<a class="tsh-explore-link" href="sikh-history/' + MONTH_NAMES[d.getMonth()].toLowerCase() +
            '-' + d.getDate() + '.html">Read ' + esc(shortDate(d)) + ' in full &rarr;</a>' +
          ' &middot; <a class="tsh-explore-link" href="sikh-history.html">All 365 days</a>' +
        '</div>' +
      '</div>';
  }

  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-tsh]') : null;
    if (!b || !records) return; // day data still loading (the built-in card shows today)
    var what = b.getAttribute('data-tsh');
    if (what === 'prev') shiftDay(-1);
    else if (what === 'next') shiftDay(1);
    else if (what === 'today') render(new Date());
  }

  function use(list) {
    records = {};
    list.forEach(function (r) { records[r.date] = r; });
    var now = new Date();
    todayKey = keyOf(now);
    render(now);
  }

  // In Node (scripts/update-homepage-today.js) only the markup builder is needed.
  if (typeof module === 'object' && module.exports) {
    module.exports = { cardHtml: cardHtml, keyOf: keyOf };
    return;
  }

  function start() {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    if (!mount.hasAttribute('data-tsh-ready')) {
      mount.setAttribute('data-tsh-ready', '');
      mount.addEventListener('click', onClick);
    }

    /* data/sikh-history.js sets this. Using it avoids fetch(), which browsers
       block when the page is opened straight from disk (file://). */
    if (window.SIKH_HISTORY && window.SIKH_HISTORY.length) {
      use(window.SIKH_HISTORY);
      return;
    }

    /* no data script on the page - fetch the JSON. It holds all 365 days
       (the card can step to any day), so it waits until the page has
       loaded rather than competing with the Hukamnama text above it. */
    if (document.readyState !== 'complete') {
      window.addEventListener('load', function () { setTimeout(start, 0); }, { once: true });
      return;
    }
    fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(use)
      .catch(function (err) {
        console.error('Today in Sikh History: could not load ' + DATA_URL, err);
        // Keep today's card if it is already in the page; only the day buttons need the data.
        if (mount.querySelector('.tsh-card[data-key="' + keyOf(new Date()) + '"]')) return;
        mount.innerHTML =
          '<div class="tsh-card"><div class="tsh-head">' +
          '<h2 class="tsh-kicker">&#128220; Today in Sikh History</h2></div>' +
          '<div class="tsh-body"><p class="tsh-none">This feature is briefly unavailable.</p>' +
          '</div></div>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
