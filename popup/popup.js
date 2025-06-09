document.addEventListener("DOMContentLoaded", () => {
  const songTitle = document.getElementById("song-title");
  const sourceSelect = document.getElementById("source");
  const settingsButton = document.getElementById("open-settings");

  // Load last used source from storage (youtube default)
  browser.storage.local.get("selectedSource").then(result => {
    const last_source = result.selectedSource || "youtube";
    sourceSelect.value = last_source;
    fetchCurrentSong(last_source);
  });

  // Handle source selection changes
  sourceSelect.addEventListener("change", () => {
    const selected = sourceSelect.value;
    browser.storage.local.set({ selectedSource: selected });
    fetchCurrentSong(selected);
  });

  // Open settings page
  settingsButton.addEventListener("click", () => {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage();
    } else {
      window.open(browser.runtime.getURL("settings/settings.html"));
    }
  });

  // Fetch currently playing song for selected source
  function fetchCurrentSong(source) {
    songTitle.textContent = "Loading...";

    browser.runtime.sendMessage({ type: "getCurrentSong", source })
      .then((response) => {
        if (response?.title) {
          songTitle.textContent = response.title;
        } else {
          songTitle.textContent = "No song playing";
        }
      })
      .catch((err) => {
        console.error("[MOOF] Error fetching current song:", err);
        songTitle.textContent = "Failed to fetch song";
      });
  }
});