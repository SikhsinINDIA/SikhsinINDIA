/* ──────────────────────────────────────────────────────────────
   Push notification service worker (Firebase Cloud Messaging)
   Must live at the site root so it can show notifications for every
   page. Registered by js/push.js when a visitor taps "Get notified".

   Notifications sent by scripts/send-daily-event-push.js arrive with a
   title, body and link; while no page of the site is in front, Firebase
   shows them itself and opens the link when tapped. js/push.js shows the
   ones that arrive while a page is open, and the click handler below
   opens their link.
   ────────────────────────────────────────────────────────────── */
importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDq35pvLrPM_HwfJq6TEBbKVJqBapaweEU',
  authDomain: 'sikhsinindia-67a6b.firebaseapp.com',
  projectId: 'sikhsinindia-67a6b',
  storageBucket: 'sikhsinindia-67a6b.appspot.com',
  messagingSenderId: '622603668882',
  appId: '1:622603668882:web:953c6a07864b235fdd054b'
});
firebase.messaging();

// Notifications shown by js/push.js carry their own link (Firebase's own
// carry FCM_MSG instead and are opened by Firebase).
self.addEventListener('notificationclick', (event) => {
  const link = event.notification.data && event.notification.data.link;
  if (!link) return;
  event.notification.close();
  event.waitUntil(clients.openWindow(link));
});
