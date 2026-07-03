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
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
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

/* 🔥 IMPORTANT: export Firebase functions properly */
export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  signOut
};