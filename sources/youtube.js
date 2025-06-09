const video = document.querySelector("video");

function sendCurrentSong() {
  const title = document.title.replace(" - YouTube", "").trim();

  if (video && !video.paused && !video.ended && video.readyState > 2 && title) {
    browser.runtime.sendMessage({ type: "nowPlaying", title, source: "youtube" });
  }
}

sendCurrentSong();

// Observe YT tab title for changes
const titleEl = document.querySelector("title");
if (titleEl) {
  const observer  = new MutationObserver(() => {
    console.log("[MOOF][YOUTUBE] Page title changed");
    sendCurrentSong();
  });

  observer.observe(titleEl, { childList: true });
}

video.addEventListener("play", sendCurrentSong);
video.addEventListener("pause", () => {
  browser.runtime.sendMessage({ type: "nowPlaying", title: "", source: "youtube" });
});