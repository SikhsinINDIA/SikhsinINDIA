/* ──────────────────────────────────────────────────────────────
   Today in Sikh History
   Reads data/sikh-history.json (365 records keyed MM-DD) and renders
   the entry for the chosen day. Nothing here is year-dependent, so
   14 April always shows Vaisakhi, whatever the year.

   Records marked "anchored" are tied to that calendar date and are
   introduced as history. The rest carry a theme for reflection and
   are worded as such, so the page never claims something happened on
   a day it did not.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var MOUNT_ID = 'todaySikhHistory';
  var DATA_URL = 'data/sikh-history.json';

  /* how many of the day's other events the homepage card lists */
  var MAX_ON_CARD = 4;

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  var records = null;   // MM-DD -> record
  var viewDate = null;  // Date currently shown
  var todayKey = null;

  function pad(n) { return String(n).padStart(2, '0'); }
  function keyOf(d) { return pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function render(d) {
    viewDate = d;
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;

    var rec = lookup(d);
    var prev = new Date(d.getTime()); prev.setDate(prev.getDate() - 1);
    var next = new Date(d.getTime()); next.setDate(next.getDate() + 1);
    var isToday = keyOf(d) === todayKey && d.toDateString() === new Date().toDateString();

    var body;
    if (!rec) {
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
        chip +
        '<div class="tsh-lead">' + lead + '</div>' +
        '<h3 class="tsh-title">' + esc(rec.title) + '</h3>' +
        (rec.detail ? '<p class="tsh-detail">' + esc(rec.detail) + '</p>' : '') +
        (rec.anchored ? '' :
          '<p class="tsh-caveat">This day has no single recorded event in our records; ' +
          'the theme above is offered for reflection.</p>') +
        more;
    }

    mount.innerHTML =
      '<div class="tsh-card">' +
        '<div class="tsh-head">' +
          '<div class="tsh-kicker">Today in Sikh History</div>' +
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
          '<a class="tsh-explore-link" href="sikh-history.html?date=' + keyOf(d) + '">' +
            'Explore all 365 days &rarr;</a>' +
        '</div>' +
      '</div>';
  }

  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-tsh]') : null;
    if (!b) return;
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

  function start() {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    mount.addEventListener('click', onClick);

    /* data/sikh-history.js sets this. Using it avoids fetch(), which browsers
       block when the page is opened straight from disk (file://). */
    if (window.SIKH_HISTORY && window.SIKH_HISTORY.length) {
      use(window.SIKH_HISTORY);
      return;
    }

    /* no data script on the page - fall back to fetching the JSON */
    fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(use)
      .catch(function (err) {
        console.error('Today in Sikh History: could not load ' + DATA_URL, err);
        mount.innerHTML =
          '<div class="tsh-card"><div class="tsh-head">' +
          '<div class="tsh-kicker">Today in Sikh History</div></div>' +
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
