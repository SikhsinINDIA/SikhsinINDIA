import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  signOut
} from "./firebase.js";

const audio = document.getElementById("player");
const status = document.getElementById("status");

let uid = null;

/* IMPORTANT: must match your tracks keys */
let currentSong = "song1";

const tracks = {
  song1: {
    title: "First Song",
    file: "assets/song1.mp3"
  },
  song2: {
    title: "Second Song",
    file: "assets/song2.mp3"
  }
};

/* ---------------- AUTH ---------------- */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;

  document.getElementById("playerBox").style.display = "block";

  loadProgress();
  autoSave();
});

/* ---------------- LOAD PROGRESS ---------------- */
async function loadProgress() {
  const ref = doc(db, "progress", uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();

    if (data[currentSong]) {
      audio.currentTime = data[currentSong].currentTime || 0;
      status.innerText = "Resumed from last position ✔";
    }
  }
}

/* ---------------- PLAY TRACK ---------------- */
window.playTrack = async (id) => {

  currentSong = id;

  audio.src = tracks[id].file;

  document.getElementById("title").innerText = tracks[id].title;

  // 🔥 STEP 1: LOAD SAVED POSITION FROM FIRESTORE
  const ref = doc(db, "progress", uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();

    if (data[currentSong]) {
      audio.currentTime = data[currentSong].currentTime || 0;
    } else {
      audio.currentTime = 0;
    }
  } else {
    audio.currentTime = 0;
  }

  // 🔥 STEP 2: PLAY
  await audio.play();

  status.innerText = "Playing...";
};

window.logout = async () => {
  await signOut(auth);

  alert("Logged out successfully");

  window.location.href = "login.html";
};


/* ---------------- AUTO SAVE ---------------- */
function autoSave() {
  setInterval(async () => {

    if (!uid || audio.paused) return;

    const ref = doc(db, "progress", uid);

    try {
      await updateDoc(ref, {
        [currentSong]: {
          currentTime: audio.currentTime,
          updatedAt: serverTimestamp()
        }
      });
    } catch (e) {
      // first time create doc
      await setDoc(ref, {
        [currentSong]: {
          currentTime: audio.currentTime,
          updatedAt: serverTimestamp()
        }
      });
    }

  }, 5000); // faster + smoother resume
}