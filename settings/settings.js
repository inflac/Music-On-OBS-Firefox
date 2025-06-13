document.addEventListener("DOMContentLoaded", async () => {
  initPageSwitching();
  await initThemeSelector();
  await initOBSSettings();
  await initOverlayTemplate();
  await initSpotifySettings();
  displayRedirectUri();
  const version = browser.runtime.getManifest().version;
  const moofversion = document.getElementById('moof-version');
  moofversion.textContent = version;
  moofversion.href = `https://github.com/inflac/Music-On-OBS-Firefox/releases/tag/v${version}`;
});

// --- UI Navigation ---
function initPageSwitching() {
  const pages = {
    preferences: document.getElementById("page-preferences"),
    obs: document.getElementById("page-obs"),
    overlay: document.getElementById("page-overlay"),
    spotify: document.getElementById("page-spotify"),
  };

  const buttons = document.querySelectorAll(".sidebar-button");

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const pageKey = button.textContent.trim().toLowerCase();

      for (const key in pages) {
        pages[key].style.display = key === pageKey ? "block" : "none";
      }

      buttons.forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");
    });
  });

  // Set default page
  buttons[0]?.click();
}

// --- Theme Selector ---
async function initThemeSelector() {
  const themeLink = document.getElementById("theme-link");
  const themeSelect = document.getElementById("theme-select");

  const themes = getThemes();
  const current = await getCurrentTheme();

  for (const name of themes) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = capitalize(name);
    if (name === current) option.selected = true;
    themeSelect.appendChild(option);
  }

  themeLink.href = `../themes/${current}.css`;

  themeSelect.addEventListener("change", async (e) => {
    const selected = e.target.value;
    themeLink.href = `../themes/${selected}.css`;
    await browser.storage.local.set({ theme: selected });
  });
}

// --- OBS Settings ---
async function initOBSSettings() {
  const obsSource = document.getElementById("obs-source");
  const serverPort = document.getElementById("serverport");
  const serverPassword = document.getElementById("serverpassword");

  await setInputFromStorage(obsSource, "obsSource");
  await setInputFromStorage(serverPort, "serverport");
  await setInputFromStorage(serverPassword, "serverpassword");

  obsSource.addEventListener("change", () => updateStorage("obsSource", obsSource.value));
  serverPort.addEventListener("change", () => updateStorage("serverport", serverPort.value));
  serverPassword.addEventListener("change", () => updateStorage("serverpassword", serverPassword.value));
}

// Overlay Settings
async function initOverlayTemplate() {
  const input = document.getElementById("obs-template");
  const preview = document.getElementById("obs-preview");

  document.querySelectorAll(".var-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const insert = btn.dataset.insert;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const text = input.value;
      input.value = text.slice(0, start) + insert + text.slice(end);
      input.focus();
      input.setSelectionRange(start + insert.length, start + insert.length);
      
      // Manually trigger input event so debounced save & preview run
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  let debounceTimer;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      await browser.storage.local.set({ obsTemplate: input.value });
      updatePreview();
    }, 500);
  });

  const { obsTemplate } = await browser.storage.local.get("obsTemplate");
  if (obsTemplate) {
    input.value = obsTemplate;
    updatePreview();
  }

  function updatePreview() {
    const val = input.value
      .replace(/<!__title__!>/g, "Title Example")
      .replace(/<!__author__!>/g, "Author Name")
      .replace(/<!__source__!>/g, "YouTube");
    preview.textContent = val;
  }
}

// --- Spotify Auth ---
async function initSpotifySettings() {
  const { spotifyClientId: CLIENT_ID } = await browser.storage.local.get("spotifyClientId");
  const clientIdInput = document.getElementById("spotify-client-id");
  const statusEl = document.getElementById("spotify-status");

  // Show current client ID
  clientIdInput.value = CLIENT_ID ?? "";

  // Save client ID changes
  clientIdInput.addEventListener("change", async () => {
    const newId = clientIdInput.value.trim();
    await browser.storage.local.set({ spotifyToken: "" }); // Reset Token
    await browser.storage.local.set({ spotifyRefreshToken: "" }); // Reset refresh Token

    if (!isValidSpotifyClientId(newId)) {
      statusEl.textContent = "❌ Invalid Client ID format.";
      return
    }

    await browser.storage.local.set({ spotifyClientId: newId });
    statusEl.textContent = "💾 Saved. Reload or reconnect to apply.";
  });

  if (!CLIENT_ID) {
    statusEl.textContent = "❌ Please set a Spotify Client ID first.";
    return;
  }

  const REDIRECT_URI = browser.identity.getRedirectURL();

  // Show current status right away
  await updateSpotifyStatus(statusEl);

  document.getElementById("spotify-connect").addEventListener("click", async () => {
    try {
      const { code_verifier, code_challenge } = await generatePKCECodes();
      const SCOPES = "user-read-currently-playing user-read-playback-state";

      await browser.storage.local.set({ code_verifier });

      const authUrl = new URL("https://accounts.spotify.com/authorize");
      authUrl.searchParams.set("client_id", CLIENT_ID);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("code_challenge", code_challenge);

      const redirectUrl = await browser.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true,
      });

      const code = new URL(redirectUrl).searchParams.get("code");
      if (!code) return (statusEl.textContent = "❌ No code returned.");

      const { code_verifier: verifier } = await browser.storage.local.get("code_verifier");

      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: verifier,
        }),
      });

      const data = await tokenRes.json();

      if (data.access_token) {
          await browser.storage.local.set({ 
            spotifyToken: data.access_token,
            spotifyRefreshToken: data.refresh_token
          });
        statusEl.textContent = "✅ Connected to Spotify!";
      } else {
        console.error("[MOOF] Token exchange failed:", data);
        statusEl.textContent = "❌ Token exchange failed.";
      }
    } catch (err) {
      console.error("[MOOF] Spotify auth error:", err);
      statusEl.textContent = "❌ Auth error.";
    }
  });
}

// --- Spotify Refresh Token Helper ---
async function refreshSpotifyToken() {
  const { spotifyRefreshToken, spotifyClientId } = await browser.storage.local.get(["spotifyRefreshToken", "spotifyClientId"]);
  if (!spotifyRefreshToken || !spotifyClientId) {
    throw new Error("No refresh token or client ID available");
  }

  const REDIRECT_URI = browser.identity.getRedirectURL();

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: spotifyRefreshToken,
      client_id: spotifyClientId,
      redirect_uri: REDIRECT_URI,  // Spotify docs don't require redirect_uri here but adding doesn't hurt
    }),
  });

  const data = await tokenRes.json();

  if (data.access_token) {
    await browser.storage.local.set({ spotifyToken: data.access_token });
    if (data.refresh_token) {
      // Sometimes Spotify issues a new refresh token — update if present
      await browser.storage.local.set({ spotifyRefreshToken: data.refresh_token });
    }
    return data.access_token;
  } else {
    throw new Error("Failed to refresh token: " + JSON.stringify(data));
  }
}

// --- Spotify Status Helper ---
async function updateSpotifyStatus(statusEl) {
  let { spotifyToken } = await browser.storage.local.get("spotifyToken");

  if (!spotifyToken) {
    statusEl.textContent = "⚠️ Not connected to Spotify";
    return;
  }

  try {
    let res = await fetch("https://api.spotify.com/v1/me/player", {
      headers: { Authorization: `Bearer ${spotifyToken}` },
    });

    if (res.status === 401) {
      // Try to refresh token
      try {
        spotifyToken = await refreshSpotifyToken();
      } catch (refreshErr) {
        statusEl.textContent = "⚠️ Token expired - please reconnect.";
        return;
      }

      // Retry with new token
      res = await fetch("https://api.spotify.com/v1/me/player", {
        headers: { Authorization: `Bearer ${spotifyToken}` },
      });

      if (res.status === 401) {
        statusEl.textContent = "⚠️ Token expired - please reconnect.";
        return;
      }
    }

    if (!res.ok) {
      statusEl.textContent = `⚠️ Spotify API error (${res.status})`;
      return;
    }

    statusEl.textContent = "✅ Connected to Spotify";
  } catch (err) {
    console.error("[MOOF] Spotify status check failed:", err);
    statusEl.textContent = "❌ Failed to check status";
  }
}

// --- Utils ---
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function setInputFromStorage(inputEl, key) {
  const result = await browser.storage.local.get(key);
  inputEl.value = result[key] ?? "";
}

async function updateStorage(key, value) {
  await browser.storage.local.set({ [key]: value });
}

function base64urlencode(str) {
  return btoa(String.fromCharCode(...new Uint8Array(str)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generatePKCECodes() {
  const code_verifier = Array.from(crypto.getRandomValues(new Uint8Array(64)))
    .map(b => b.toString(36)).join("").slice(0, 128);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code_verifier));
  const code_challenge = base64urlencode(digest);
  return { code_verifier, code_challenge };
}

function displayRedirectUri() {
  const container = document.getElementById("spotify-redirect-uri");
  if (container) container.textContent = browser.identity.getRedirectURL();
}

function isValidSpotifyClientId(clientId) {
  if (typeof clientId !== "string") return false;
  return /^[a-f0-9]{32}$/i.test(clientId);
}
