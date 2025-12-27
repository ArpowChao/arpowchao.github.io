/**
 * Theme Switcher Logic
 * Cycles between: Default -> Nature -> Lavender -> Default
 */

document.addEventListener("DOMContentLoaded", function() {
  const THEMES = ["default", "nature", "lavender"];
  const STORAGE_KEY = "user-color-scheme";
  
  // 1. Initialize State
  let currentTheme = localStorage.getItem(STORAGE_KEY) || "default";
  applyTheme(currentTheme);
  
  // 2. Setup Button
  const btn = document.getElementById("theme-cycle-btn");
  if (btn) {
    updateButtonIcon(btn, currentTheme);
    
    btn.addEventListener("click", () => {
      // Find next theme index
      const currentIndex = THEMES.indexOf(currentTheme);
      const nextIndex = (currentIndex + 1) % THEMES.length;
      currentTheme = THEMES[nextIndex];
      
      // Apply and Save
      applyTheme(currentTheme);
      localStorage.setItem(STORAGE_KEY, currentTheme);
      updateButtonIcon(btn, currentTheme);
    });
  }
  
  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === "default") {
      html.removeAttribute("data-color-scheme");
    } else {
      html.setAttribute("data-color-scheme", theme);
    }
  }
  
  function updateButtonIcon(btn, theme) {
    // Optional: Tooltip or icon change based on theme
    // For now, static icon is fine, but we could rotate it or change color
    btn.setAttribute("title", `Current Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`);
  }
});
