import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDq35pvLrPM_HwfJq6TEBbKVJqBapaweEU",
  authDomain: "sikhsinindia-67a6b.firebaseapp.com",
  databaseURL: "https://sikhsinindia-67a6b-default-rtdb.firebaseio.com",
  projectId: "sikhsinindia-67a6b",
  storageBucket: "sikhsinindia-67a6b.firebasestorage.app",
  messagingSenderId: "622603668882",
  appId: "1:622603668882:web:953c6a07864b235fdd054b",
  measurementId: "G-LHNTFNW14H"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* Secondary Firebase App instance — used ONLY for creating invitee Auth
   accounts from the admin page. Firebase signs the caller in as whichever
   user was just created via createUserWithEmailAndPassword(); running that
   call against a SEPARATE app instance keeps the admin's own session on
   the primary `auth` instance untouched. */
const provisioningApp = initializeApp(firebaseConfig, "akhand-path-provisioning");
export const provisioningAuth = getAuth(provisioningApp);

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  increment
};

export const ADMIN_EMAIL = "akhandpath.sikhsinindia@gmail.com";
export const INVITEE_PASSWORD = "123456";
export const DEFAULT_TRACK_DURATION_SECONDS = 900; // 15 min fallback estimate until a track's real length is measured

/* Firestore doc IDs for invitees/attendance are keyed by a sanitized email
   rather than the Firebase Auth UID. Reason: the admin has no Admin SDK
   access from a static site, so if the same person is invited to a second
   Akhand Path later, createUserWithEmailAndPassword() will fail with
   auth/email-already-in-use and there'd be no client-side way to look up
   their existing UID. Keying by email sidesteps that entirely. */
export function emailKey(email) {
  return (email || "").trim().toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
}

/* The video sequence itself is hardcoded in index.html (not stored per-session
   in Firestore) — every program plays the same fixed playlist, so there's
   nothing session-specific to configure. See VIDEO_SEQUENCE in index.html. */

/* Suggestions only (purpose is stored as free text, e.g. "salana yaad") */
export const PURPOSE_SUGGESTIONS = [
  "Birthday",
  "Wedding Anniversary",
  "Death Anniversary",
  "Barsi",
  "Salana Yaad",
  "Bhog Ceremony",
  "Thanksgiving"
];

export const EMAILJS_PUBLIC_KEY = "K78OA7rLhPrvdRITV";
/* EmailJS "Strict Mode" is enabled on this account — sends fail with HTTP 412
   unless the private key is also passed at init. Strict Mode is EmailJS's own
   intended way to use this key client-side (paired with the dashboard's
   allowed-origins list), not a workaround of their security model. */
export const EMAILJS_PRIVATE_KEY = "8aSZFwaDi1iveGhPwPE_Q";
export const EMAILJS_SERVICE_ID = "service_02r0ak5";
export const EMAILJS_TEMPLATE_ID = "template_gzwnh1j";

/* Firestore collection: one flat document per Akhand Path program, matching
   the "akhand_path" schema already seeded (name, email, mobie, purpose,
   sponsor, akhand_path_id). Invitees/attendance live in subcollections
   underneath each program doc so the invitee count is unbounded, rather
   than fixed name_1..5/mail_1..5 slots. */
export const SESSIONS_COLLECTION = "akhand_path";

/** Returns the next sequential integer ID for a new program doc. */
export async function nextAkhandPathId() {
  const q = query(collection(db, SESSIONS_COLLECTION), orderBy("akhand_path_id", "desc"), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return 1;
  const top = snap.docs[0].data();
  return (Number(top.akhand_path_id) || 0) + 1;
}
