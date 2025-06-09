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

async function updateSongInOBS(songTitle) {
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
      inputSettings: { text: songTitle }
    });
    console.log(`Updated OBS source '${obsSource}' to: ${songTitle}`);
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

function setNowPlaying(source, title) {
  if (currentSongs[source] === title) {
    console.log("[MOOF] Title already set - skipping update in OBS");
    return;
  }
  currentSongs[source] = title;

  getSelectedSource().then((selectedSource) => {
    if (selectedSource === source) {
      console.log("[MOOF] Now playing from", source, ":", title);
      updateSongInOBS(title);
    }
  });
}

// --- Message Handlers ---
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "nowPlaying") {
    setNowPlaying(msg.source, msg.title);
  }

  if (msg.type === "getCurrentSong") {
    getSelectedSource().then((selectedSource) => {
      const song = currentSongs[selectedSource] || "";
      console.log("[MOOF] getCurrentSong for", selectedSource, ":", song);
      sendResponse({ title: song });
    });
    return true; // Keep the message channel open
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
