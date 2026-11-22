/* ──────────────────────────────────────────────────────────────
   Admin sign-in gate for SikhsInIndia.com admin pages.

   Add to an admin page, after its Firebase scripts and initializeApp():
     <script src="https://www.gstatic.com/firebasejs/<same version>/firebase-auth-compat.js"></script>
     <script src="/js/admin-gate.js"></script>

   The page stays hidden behind a sign-in screen until someone signs in
   with Google as one of ADMIN_EMAILS (the same list as the Mass Mailer,
   03-nitnem/03-06-akhand-path/firebase.js and the Worker). Signing in
   gives the page's database requests the admin's sign-in, which the
   Firestore security rules check.
   ────────────────────────────────────────────────────────────── */
(function () {
  var ADMIN_EMAILS = ['tpsarora@gmail.com', 'sikhsinindia@gmail.com'];

  function isAdmin(user) {
    return !!(user && user.email && user.emailVerified !== false &&
      ADMIN_EMAILS.indexOf(user.email.trim().toLowerCase()) !== -1);
  }

  // Hide the page straight away, before any content shows.
  var style = document.createElement('style');
  style.textContent =
    'html.admin-locked body > *:not(#admin-gate){visibility:hidden !important;}' +
    '#admin-gate{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;' +
    'background:linear-gradient(160deg,#0d1b3e,#1a2a5e);font-family:Arial,Helvetica,sans-serif;padding:20px;}' +
    '#admin-gate .box{background:#fff;border-radius:12px;max-width:380px;width:100%;padding:30px 26px;text-align:center;' +
    'box-shadow:0 10px 40px rgba(0,0,0,.35);border-top:5px solid #F7941D;}' +
    '#admin-gate h2{margin:0 0 8px;color:#0d1b3e;font-family:Georgia,serif;font-size:22px;}' +
    '#admin-gate p{margin:0 0 18px;color:#444;font-size:14px;line-height:1.5;}' +
    '#admin-gate button{background:#0d1b3e;color:#fff;border:0;border-radius:6px;padding:12px 22px;font-size:15px;font-weight:bold;cursor:pointer;}' +
    '#admin-gate button:hover{background:#F7941D;color:#0d1b3e;}' +
    '#admin-gate .err{color:#c0392b;font-size:13px;margin-top:14px;min-height:16px;}' +
    '#admin-chip{position:fixed;right:12px;bottom:12px;z-index:2147483646;background:#0d1b3e;color:#fff;font:12px Arial,Helvetica,sans-serif;' +
    'padding:7px 10px;border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,.3);}' +
    '#admin-chip a{color:#F7941D;margin-left:8px;cursor:pointer;text-decoration:underline;}';
  document.head.appendChild(style);
  document.documentElement.classList.add('admin-locked');

  var gate, msgEl, errEl, btn;
  function showGate(message, buttonText, onClick) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', function () { showGate(message, buttonText, onClick); }); return; }
    if (!gate) {
      gate = document.createElement('div');
      gate.id = 'admin-gate';
      gate.innerHTML = '<div class="box"><h2>Admin sign-in</h2><p></p><button type="button"></button><div class="err"></div></div>';
      document.body.appendChild(gate);
      msgEl = gate.querySelector('p'); btn = gate.querySelector('button'); errEl = gate.querySelector('.err');
    }
    msgEl.textContent = message;
    btn.textContent = buttonText;
    btn.style.display = buttonText ? '' : 'none';
    btn.onclick = onClick;
    errEl.textContent = '';
  }

  function unlock(user) {
    document.documentElement.classList.remove('admin-locked');
    if (gate) { gate.remove(); gate = null; }
    var put = function () {
      if (document.getElementById('admin-chip')) return;
      var chip = document.createElement('div');
      chip.id = 'admin-chip';
      chip.innerHTML = 'Signed in as ' + user.email + '<a>Sign out</a>';
      chip.querySelector('a').onclick = function () { firebase.auth().signOut().then(function () { location.reload(); }); };
      document.body.appendChild(chip);
    };
    if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
  }

  function signIn() {
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    btn.disabled = true;
    firebase.auth().signInWithPopup(provider)
      .then(function (res) {
        if (isAdmin(res.user)) { location.reload(); return; } // reload so the page loads its data signed in
        btn.disabled = false;
      })
      .catch(function (e) {
        btn.disabled = false;
        if (errEl) errEl.textContent = (e && e.code === 'auth/popup-blocked')
          ? 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'
          : 'Sign-in did not complete: ' + ((e && e.message) || e);
      });
  }

  function start() {
    if (!window.firebase || !firebase.auth || !firebase.apps || !firebase.apps.length) {
      return setTimeout(start, 50); // wait until the page has initialised Firebase
    }
    showGate('Checking your sign-in…', '', null);
    firebase.auth().onAuthStateChanged(function (user) {
      if (isAdmin(user)) return unlock(user);
      if (user) {
        showGate('You are signed in as ' + user.email + ', which is not an admin account for this page.', 'Sign in with a different account', function () {
          firebase.auth().signOut().then(signIn);
        });
      } else {
        showGate('This page is for SikhsInIndia.com admins. Please sign in with your admin Google account.', 'Sign in with Google', signIn);
      }
    });
  }
  start();
})();
