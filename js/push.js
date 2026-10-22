/* ──────────────────────────────────────────────────────────────
   "Get notified" - free push notifications (Firebase Cloud Messaging)
   Include on a page with:
     <script type="module" src="/js/push.js"></script>
   Adds a small bell button (bottom left). Tapping it asks the browser for
   permission, registers /firebase-messaging-sw.js and saves this browser's
   push token in Firestore (push_subscribers/{token}); tapping again turns
   notifications off and deletes it. scripts/send-daily-event-push.js sends
   to every saved token.

   The button stays hidden where push isn't available - e.g. iPhone Safari
   unless the site has been added to the Home Screen.
   ────────────────────────────────────────────────────────────── */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging.js';
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDq35pvLrPM_HwfJq6TEBbKVJqBapaweEU',
  authDomain: 'sikhsinindia-67a6b.firebaseapp.com',
  projectId: 'sikhsinindia-67a6b',
  storageBucket: 'sikhsinindia-67a6b.appspot.com',
  messagingSenderId: '622603668882',
  appId: '1:622603668882:web:953c6a07864b235fdd054b'
};
// Firebase console > Project settings > Cloud Messaging > Web Push
// certificates. Empty uses Firebase's default key, which works too.
const VAPID_KEY = '';
const COLLECTION = 'push_subscribers';
const STORE_KEY = 'sii-push-token';

const LANG = (document.documentElement.lang || 'en').slice(0, 2);
const TEXT = {
  en: { on: 'Notifications on', off: 'Get notified', blocked: 'Notifications blocked',
    offTip: 'Get a notification for Gurpurabs and Sikh events', onTip: 'Tap to turn notifications off',
    blockedTip: 'Allow notifications for this site in your browser settings', confirmOff: 'Turn off notifications from SikhsInIndia?',
    done: 'You will now be notified of Gurpurabs and Sikh events.', failed: 'Could not turn on notifications: ' },
  hi: { on: 'सूचनाएँ चालू', off: 'सूचनाएँ पाएँ', blocked: 'सूचनाएँ बंद हैं',
    offTip: 'गुरपुरब और सिख आयोजनों की सूचना पाएँ', onTip: 'सूचनाएँ बंद करने के लिए टैप करें',
    blockedTip: 'ब्राउज़र की सेटिंग में इस साइट के लिए सूचनाएँ चालू करें', confirmOff: 'SikhsInIndia की सूचनाएँ बंद करें?',
    done: 'अब आपको गुरपुरब और सिख आयोजनों की सूचना मिलेगी।', failed: 'सूचनाएँ चालू नहीं हो सकीं: ' },
  pa: { on: 'ਸੂਚਨਾਵਾਂ ਚਾਲੂ', off: 'ਸੂਚਨਾਵਾਂ ਪ੍ਰਾਪਤ ਕਰੋ', blocked: 'ਸੂਚਨਾਵਾਂ ਬੰਦ ਹਨ',
    offTip: 'ਗੁਰਪੁਰਬ ਅਤੇ ਸਿੱਖ ਸਮਾਗਮਾਂ ਦੀ ਸੂਚਨਾ ਪ੍ਰਾਪਤ ਕਰੋ', onTip: 'ਸੂਚਨਾਵਾਂ ਬੰਦ ਕਰਨ ਲਈ ਟੈਪ ਕਰੋ',
    blockedTip: 'ਬ੍ਰਾਊਜ਼ਰ ਦੀ ਸੈਟਿੰਗ ਵਿੱਚ ਇਸ ਸਾਈਟ ਲਈ ਸੂਚਨਾਵਾਂ ਚਾਲੂ ਕਰੋ', confirmOff: 'SikhsInIndia ਦੀਆਂ ਸੂਚਨਾਵਾਂ ਬੰਦ ਕਰੀਏ?',
    done: 'ਹੁਣ ਤੁਹਾਨੂੰ ਗੁਰਪੁਰਬ ਅਤੇ ਸਿੱਖ ਸਮਾਗਮਾਂ ਦੀ ਸੂਚਨਾ ਮਿਲੇਗੀ।', failed: 'ਸੂਚਨਾਵਾਂ ਚਾਲੂ ਨਹੀਂ ਹੋ ਸਕੀਆਂ: ' }
}[LANG] || null;
const T = TEXT || {
  on: 'Notifications on', off: 'Get notified', blocked: 'Notifications blocked',
  offTip: '', onTip: '', blockedTip: '', confirmOff: 'Turn off notifications?', done: '', failed: 'Error: '
};

const store = {
  get() { try { return localStorage.getItem(STORE_KEY); } catch (_) { return null; } },
  set(v) { try { v ? localStorage.setItem(STORE_KEY, v) : localStorage.removeItem(STORE_KEY); } catch (_) { /* private mode */ } }
};

async function start() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !(await isSupported().catch(() => false))) return;

  const app = initializeApp(firebaseConfig, 'push');
  const messaging = getMessaging(app);
  const db = getFirestore(app);
  const registration = () => navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const tokenOptions = async () => ({ serviceWorkerRegistration: await registration(), ...(VAPID_KEY ? { vapidKey: VAPID_KEY } : {}) });

  const save = (token) => setDoc(doc(db, COLLECTION, token), {
    token, lang: LANG, page: location.pathname, created_at: serverTimestamp()
  });

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sii-push-btn';
  const style = document.createElement('style');
  style.textContent = `
    .sii-push-btn{position:fixed;left:16px;bottom:16px;z-index:9999;display:flex;align-items:center;gap:6px;
      padding:9px 14px;border:0;border-radius:999px;background:#0d1b3e;color:#fff;font:600 14px/1.2 Lato,Arial,sans-serif;
      box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}
    .sii-push-btn:hover{background:#e8830a}
    .sii-push-btn[data-state="on"]{background:#fff;color:#0d1b3e;border:1px solid rgba(13,27,62,.2)}
    .sii-push-btn[data-state="blocked"]{background:#6b7280;cursor:default}
    .sii-push-btn[disabled]{opacity:.7}
    @media print{.sii-push-btn{display:none}}`;
  document.head.appendChild(style);

  function show(state) {
    btn.dataset.state = state;
    btn.textContent = (state === 'on' ? '🔔 ' : state === 'blocked' ? '🔕 ' : '🔔 ') + T[state];
    btn.title = T[state + 'Tip'] || '';
    btn.setAttribute('aria-pressed', state === 'on' ? 'true' : 'false');
  }

  // Already subscribed: keep the saved token current (browsers rotate them).
  let token = store.get();
  if (Notification.permission === 'granted' && token) {
    show('on');
    getToken(messaging, await tokenOptions()).then(async (fresh) => {
      if (fresh && fresh !== token) {
        await save(fresh);
        await deleteDoc(doc(db, COLLECTION, token)).catch(() => {});
        store.set(token = fresh);
      }
    }).catch(() => {});
  } else {
    show(Notification.permission === 'denied' ? 'blocked' : 'off');
  }

  btn.addEventListener('click', async () => {
    if (btn.dataset.state === 'blocked') { alert(T.blockedTip); return; }
    btn.disabled = true;
    try {
      if (btn.dataset.state === 'on') {
        if (!confirm(T.confirmOff)) return;
        await deleteToken(messaging).catch(() => {});
        if (token) await deleteDoc(doc(db, COLLECTION, token)).catch(() => {});
        store.set(token = null);
        show('off');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { show(permission === 'denied' ? 'blocked' : 'off'); return; }
      token = await getToken(messaging, await tokenOptions());
      if (!token) throw new Error('no token');
      await save(token);
      store.set(token);
      show('on');
      if (T.done) alert(T.done);
    } catch (err) {
      alert(T.failed + (err && err.message ? err.message : err));
    } finally {
      btn.disabled = false;
    }
  });

  // A notification arriving while this page is open isn't shown by the
  // browser, so show it here.
  onMessage(messaging, async (payload) => {
    const n = payload.notification || {};
    const link = (payload.fcmOptions && payload.fcmOptions.link) || (payload.data && payload.data.link) || '/';
    const reg = await registration();
    reg.showNotification(n.title || 'SikhsInIndia', {
      body: n.body || '', icon: n.icon || '/android-chrome-192x192.png', image: n.image, data: { link }
    });
  });

  document.body.appendChild(btn);
}

start().catch(() => { /* push is optional - never break the page */ });
