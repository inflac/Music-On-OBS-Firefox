let spotifyIntervalId = null;

async function fetchCurrentSpotifySong() {
  const { spotifyToken } = await browser.storage.local.get("spotifyToken");

  if (!spotifyToken) {
    console.warn("[MOOF][SPOTIFY] No Spotify token found.");
    return;
  }

  const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: {
      Authorization: `Bearer ${spotifyToken}`,
    },
  });

  if (response.status === 204) {
    console.log("[MOOF][SPOTIFY] No song currently playing.");
    return;
  }

  if (response.status === 401) {
    console.warn("[MOOF][SPOTIFY] Token expired or unauthorized. You may need to refresh it.");
    return;
  }

  if (!response.ok) {
    console.error("[MOOF][SPOTIFY] Spotify API error:", response.status, response.statusText);
    return;
  }

  try {
    const data = await response.json();

    if (!data.item) {
      console.log("[MOOF][SPOTIFY] No track data available.");
      return;
    }

    if (!data.is_playing) {
      console.log("[MOOF][SPOTIFY] Track is paused");
      setNowPlaying("spotify", "");
      return;
    }

    const track = data.item.name;
    const artists = data.item.artists.map(artist => artist.name).join(", ");
    const songInfo = `${track} - ${artists}`;

    console.log(`[MOOF][SPOTIFY] Currently playing: ${songInfo}`);
    setNowPlaying("spotify", songInfo);
  } catch (err) {
    console.error("[MOOF][SPOTIFY] Failed to parse JSON:", err);
  }
}

function startSpotifyPolling() {
  if (!spotifyIntervalId) {
    fetchCurrentSpotifySong();
    spotifyIntervalId = setInterval(fetchCurrentSpotifySong, 5000);
    console.log("[MOOF][SPOTIFY] Spotify polling started.");
  }
}

function stopSpotifyPolling() {
  if (spotifyIntervalId) {
    clearInterval(spotifyIntervalId);
    spotifyIntervalId = null;
    console.log("[MOOF][SPOTIFY] Spotify polling stopped.");
  }
}

// Initial check
browser.storage.local.get("selectedSource").then(({ selectedSource }) => {
  if (selectedSource === "spotify") {
    startSpotifyPolling();
  }
});
