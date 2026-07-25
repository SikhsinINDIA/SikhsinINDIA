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

let player;
let uid = null;
let currentVideoKey = "video1"; // Tracks keys for Firestore mapping

// Map video keys to their respective YouTube IDs and UI Titles
const videoTracks = {
  video1: { title: "Video 1-0001Japji", id: "M7nFjtGkRm0" },
  video2: { title: "Video 2-0008Sodar", id: "f_Hf1aTQSZA" },
  video3: { title: "Video 3-0012Sohila", id: "PyJfhrHzUFQ" },
  video4: { title: "Video 4-0014Sri-g1", id: "TgI3_xAod8M" },
  video5: { title: "Video 5-0026Sri-g3", id: "GPp7Pe3pPTk" },
  video6: { title: "Video 6-0034Sri-g3", id: "7UOJwpG3tUE" },
  video7: { title: "Video 7-0042Sri-g5", id: "mwXhPYGg3oI" },
  video8: { title: "Video 8-0053Sri-a1", id: "GzrTw6_-7ek" },
  video9: { title: "Video 9-0058Sri-a1", id: "w2pSG5xFHTw" },
  video10: { title: "Video 10-0064Sri-a3", id: "4NvjGlWMTKA" },
  video11: { title: "Video 11-0066Sri-a3", id: "4jjJcrQ6djA" },
  video12: { title: "Video 12-0071Sri-g1", id: "pghOa2dItlE" },
  video13: { title: "Video 13-0074Sri-g1", id: "eM29-y_PXn8" },
  video14: { title: "Video 14-0083Sri-v4", id: "1D4GRgN-2b0" }
};

const statusText = document.getElementById("status");
const titleText = document.getElementById("title");

/* ---------------- AUTH & INITIALIZATION ---------------- */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;
  document.getElementById("playerBox").style.display = "block";

  // Fetch the last played track first before initializing the player element
  determineInitialTrackAndLoad();
});

// Fetches user record from Firestore to determine the initial video to embed
async function determineInitialTrackAndLoad() {
  if (!uid) return;
  
  try {
    const ref = doc(db, "progress", uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      // If a lastPlayedKey was previously recorded and exists in our tracking map, select it
      if (data.lastPlayedKey && videoTracks[data.lastPlayedKey]) {
        currentVideoKey = data.lastPlayedKey;
      }
    }
  } catch (error) {
    console.error("Error reading last played configuration: ", error);
  }

  // Initialize the player UI with the corrected video key selection
  initYouTubePlayer();
  // Start the auto-save interval loop
  autoSave();
}

/* ---------------- YOUTUBE PLAYER SETUP ---------------- */
function initYouTubePlayer() {
  if (typeof YT !== 'undefined' && YT.Player) {
    window.onYouTubeIframeAPIReady();
  }
}

window.onYouTubeIframeAPIReady = function() {
  // Use dynamically calculated currentVideoKey instead of hardcoded video1
  const initialTrack = videoTracks[currentVideoKey];
  
  if (titleText) titleText.innerText = initialTrack.title;

  player = new YT.Player('youtube-player', {
    height: '360',
    width: '640',
    videoId: initialTrack.id, 
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange
    }
  });
};

// When the player is fully loaded and ready, fetch progress for the designated track
async function onPlayerReady() {
  if (uid) {
    await loadProgress(currentVideoKey);
  }
}

/* ---------------- LOAD PROGRESS ---------------- */
async function loadProgress(videoKey) {
  if (!uid || !player) return;

  const ref = doc(db, "progress", uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    if (data[videoKey] && data[videoKey].currentTime) {
      const savedTime = data[videoKey].currentTime;
      player.seekTo(savedTime, true);
      statusText.innerText = "Resumed from last position ✔";
      return;
    }
  }
  
  player.seekTo(0, true);
}

/* ---------------- PLAY / SWITCH VIDEO ---------------- */
window.playVideo = async (videoKey) => {
  if (!player || !player.loadVideoById) {
    console.error("YouTube Player is not initialized yet.");
    return;
  }

  currentVideoKey = videoKey;
  const targetVideo = videoTracks[videoKey];

  if (titleText) titleText.innerText = targetVideo.title;

  // 1. Load and auto-play the video inside the Iframe player
  player.loadVideoById(targetVideo.id);

  statusText.innerText = "Fetching progress...";

  // 2. Fetch and seek to the saved timestamp from Firestore
  await loadProgress(videoKey);
};

/* ---------------- STATE LISTENER (AUTO-PLAY NEXT) ---------------- */
function onPlayerStateChange(event) {
  if (event.data == YT.PlayerState.PLAYING) {
    statusText.innerText = "Playing...";
  }
  
  if (event.data == YT.PlayerState.ENDED) {
    const currentNumber = parseInt(currentVideoKey.replace("video", ""), 10);
    const nextVideoKey = `video${currentNumber + 1}`;

    if (videoTracks[nextVideoKey]) {
      statusText.innerText = `Track completed. Transitioning to ${videoTracks[nextVideoKey].title}...`;
      window.playVideo(nextVideoKey);
    } else {
      statusText.innerText = "Entire playback sequence finished.";
    }
  }
}

/* ---------------- REUSABLE FORCE SAVE FUNCTION ---------------- */
async function saveCurrentProgress() {
  // Ensure the player is initialized and possesses a valid timestamp method
  if (!uid || !player || typeof player.getCurrentTime !== 'function') return;

  const ref = doc(db, "progress", uid);
  const currentTime = player.getCurrentTime();

  const payload = {
    lastPlayedKey: currentVideoKey,
    [currentVideoKey]: {
      currentTime: currentTime,
      updatedAt: serverTimestamp()
    }
  };

  try {
    await updateDoc(ref, payload);
  } catch (e) {
    await setDoc(ref, payload);
  }
}

/* ---------------- AUTO SAVE PROGRESS ---------------- */
function autoSave() {
  setInterval(async () => {
    // Only automatically save in the background if the user is actively watching
    if (!player || typeof player.getPlayerState !== 'function') return;
    if (player.getPlayerState() !== YT.PlayerState.PLAYING) return;

    await saveCurrentProgress();
  }, 5000); 
}

/* ---------------- LOGOUT ---------------- */
window.logout = async () => {
  statusText.innerText = "Saving final progress before logging out...";
  
  // Force an immediate save right before authentication context is dropped
  await saveCurrentProgress();

  await signOut(auth);
  alert("Logged out successfully");
  window.location.href = "login.html";
};

