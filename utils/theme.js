const themes = ["dark", "light", "solar", "twitch", "spotify"];

function getThemes() {
  // Return list of theme names
  return themes;
}

async function getCurrentTheme() {
  // Return saved theme or default
  const result = await browser.storage.local.get("theme");
  const savedTheme = result.theme || themes[0];
  return savedTheme
}

document.addEventListener("DOMContentLoaded", async () => {
  const themeLink = document.getElementById("theme-link");

  const currentTheme = await getCurrentTheme();
  themeLink.href = `../themes/${currentTheme}.css`;
});
