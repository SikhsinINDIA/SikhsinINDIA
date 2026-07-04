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
  video9: { title: "Video 9-0058Sri-a1", id: "w2pSG5xFHTw" }, // Fixed trailing whitespace here
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

  // Initialize the YouTube API Player after authentication is confirmed
  initYouTubePlayer();
  // Start the auto-save interval loop
  autoSave();
});

/* ---------------- YOUTUBE PLAYER SETUP ---------------- */
function initYouTubePlayer() {
  // Ensure the global YT API is loaded before attempting initialization
  if (typeof YT !== 'undefined' && YT.Player) {
    window.onYouTubeIframeAPIReady();
  }
}

window.onYouTubeIframeAPIReady = function() {
  player = new YT.Player('youtube-player', {
    height: '360',
    width: '640',
    videoId: videoTracks.video1.id, // Start with video 1 default
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange
    }
  });
};

// When the player is fully loaded and ready, fetch progress for the initial track
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
      // Seek to saved position (allowSeekAhead = true)
      player.seekTo(savedTime, true);
      statusText.innerText = "Resumed from last position ✔";
      return;
    }
  }
  
  // Default fallback if no prior save state exists
  player.seekTo(0, true);
}

/* ---------------- PLAY / SWITCH VIDEO ---------------- */
window.playVideo = async (videoKey) => {
  if (!player || !player.loadVideoById) return;

  currentVideoKey = videoKey;
  const targetVideo = videoTracks[videoKey];

  // Update DOM Header UI
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
  
  // Check if video completes execution
  if (event.data == YT.PlayerState.ENDED) {
    // Dynamically calculate the next video key index
    // e.g., converts "video1" -> 1 -> 2 -> "video2"
    const currentNumber = parseInt(currentVideoKey.replace("video", ""), 10);
    const nextVideoKey = `video${currentNumber + 1}`;

    // Verify if the next sequential video exists in our playlist
    if (videoTracks[nextVideoKey]) {
      statusText.innerText = `Track completed. Transitioning to ${videoTracks[nextVideoKey].title}...`;
      window.playVideo(nextVideoKey);
    } else {
      statusText.innerText = "Entire playback sequence finished.";
    }
  }
}

/* ---------------- AUTO SAVE PROGRESS ---------------- */
function autoSave() {
  setInterval(async () => {
    // Return early if unauthenticated or video isn't actively playing
    if (!uid || !player || typeof player.getPlayerState !== 'function') return;
    if (player.getPlayerState() !== YT.PlayerState.PLAYING) return;

    const ref = doc(db, "progress", uid);
    const currentTime = player.getCurrentTime();

    const payload = {
      [currentVideoKey]: {
        currentTime: currentTime,
        updatedAt: serverTimestamp()
      }
    };

    try {
      await updateDoc(ref, payload);
    } catch (e) {
      // Create record fallback if document doesn't exist yet
      await setDoc(ref, payload);
    }
  }, 5000); // Polls every 5 seconds
}

/* ---------------- LOGOUT ---------------- */
window.logout = async () => {
  await signOut(auth);
  alert("Logged out successfully");
  window.location.href = "login.html";
};