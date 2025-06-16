const obs = new window.OBSWebSocket();

let isConnected = false;
let currentSongs = {};
let spotifyPollingInterval = null;


// --- OBS Connection & Song Update ---
async function connectToOBS(serverPort, serverPassword) {
  try {
    if (!isConnected) {
      await obs.connect(`ws://localhost:${serverPort}`, serverPassword);
      console.log("[MOOF] Connected to OBS WebSocket");
      isConnected = true;

      obs.on("ConnectionClosed", () => {
        console.warn("[MOOF] OBS WebSocket connection closed");
        isConnected = false;
      });
    }
  } catch (error) {
    console.error("[MOOF] Failed to connect to OBS WebSocket:", error.code, error.message);
  }
}

async function updateTextInOBS(songInfoString) {
  const { serverport, serverpassword, obsSource } = await browser.storage.local.get([
    "serverport",
    "serverpassword",
    "obsSource"
  ]);

  if (!serverport || !obsSource) {
    console.warn("[MOOF] ⚠️ OBS settings incomplete, skipping update");
    return;
  }

  await connectToOBS(serverport, serverpassword);

  try {
    await obs.call("SetInputSettings", {
      inputName: obsSource,
      inputSettings: {
        text: songInfoString
      },
      overlay: true // preserves other settings
    });
    console.log(`[MOOF] Updated OBS source '${obsSource}' to: ${songInfoString}`);
  } catch (error) {
    console.error("[MOOF] OBS call error:", error.code, error.message);
  }
}

// --- Helper Functions ---
function getSelectedSource() {
  return browser.storage.local.get("selectedSource")
    .then(result => result.selectedSource || "youtube")
    .catch(err => {
      console.error("[MOOF] Error reading selectedSource from storage:", err);
      return "youtube"; // Fallback
    });
}

async function setNowPlaying(source, trackInfo) {
  const songInfoString = await craftSongInfo(trackInfo);
  const storageKey = `currentSong_${source}`;
  
  const stored = await browser.storage.local.get(storageKey);
  const existing = stored[storageKey];
  const selectedSource = await getSelectedSource();

  // Check if already set
  if (
    existing &&
    existing.formatted === songInfoString &&
    existing.info?.title === trackInfo.title &&
    selectedSource !== source
  ) {
    console.log("[MOOF] Song info already set in storage - skipping update");
    return;
  }

  // Update new song info
  await browser.storage.local.set({
    [storageKey]: {
      info: trackInfo,
      formatted: songInfoString
    }
  });

  await updateTextInOBS(songInfoString);

}

async function craftSongInfo(trackInfo = {}) {
  const { obsTemplate } = await browser.storage.local.get("obsTemplate");
  if (!obsTemplate) return "";

  // Recognize stop indicator and return empty Song Info
  if (trackInfo.title === "_stop_" && trackInfo.author === "_stop_") { 
    return ""; 
  }

  return obsTemplate
    .replace(/<!__title__!>/g, trackInfo.title || "")
    .replace(/<!__author__!>/g, trackInfo.author || "")
    .replace(/<!__source__!>/g, trackInfo.source || "");
}

// --- Message Handlers ---
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "nowPlaying") {
    console.log("[MOOF] Received new song:", msg.title, "from source:", msg.source)
    setNowPlaying(msg.source, msg);
  }

  if (msg.type === "getCurrentSong") {
    getSelectedSource().then(async (selectedSource) => {
      const storageKey = `currentSong_${selectedSource}`;
      const stored = await browser.storage.local.get(storageKey);
      const song = stored[storageKey];
      const title = (song?.info?.title === "_stop_") ? "" : (song?.info?.title || "");
      console.log("[MOOF] getCurrentSong for", selectedSource, ":", title);
      sendResponse({ title });
    });
    return true;
  }
});

// --- Storage Change Listener ---
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.selectedSource) {
    const newSource = changes.selectedSource.newValue;
    console.log("[MOOF] Source changed to:", newSource);

    if (newSource === "spotify") {
      startSpotifyPolling();
    } else {
      stopSpotifyPolling();
    }
  }
});


console.log("[MOOF] background.js started");