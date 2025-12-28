/**
 * Theme Switcher Logic
 * Cycles between: Default -> Nature -> Lavender -> Default
 */

document.addEventListener("DOMContentLoaded", function() {
  const THEMES = ["nature", "lavender"];
  const STORAGE_KEY = "user-color-scheme";
  const html = document.documentElement;
  
  // 1. Initialize State
  let currentTheme = localStorage.getItem(STORAGE_KEY);
  if (!THEMES.includes(currentTheme)) currentTheme = "nature";
  
  console.log("🎨 Theme Switcher Init:", currentTheme);
  applyTheme(currentTheme);
  
  // 2. Setup Button
  const btn = document.getElementById("theme-cycle-btn");
  if (btn) {
    console.log("🎨 Theme Button found");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      
      const currentIndex = THEMES.indexOf(currentTheme);
      const nextIndex = (currentIndex + 1) % THEMES.length;
      currentTheme = THEMES[nextIndex];
      
      console.log("🎨 Switching theme to:", currentTheme);
      
      applyTheme(currentTheme);
      localStorage.setItem(STORAGE_KEY, currentTheme);
      updateButtonIcon(btn, currentTheme);
    });
  } else {
    console.warn("🎨 Theme Button NOT found (#theme-cycle-btn)");
  }
  
  function applyTheme(theme) {
    // 1. Sync ID for CSS specificity
    html.id = `theme-${theme}`;
    
    // 2. Sync Attribute for logic
    html.setAttribute("data-color-scheme", theme);
    
    // 3. Ensure base mode is set (required for Chirpy variables)
    if (!html.hasAttribute("data-mode")) {
      html.setAttribute("data-mode", "light");
    }
    
    // 4. Update Meta Theme Color
    const colorMap = {
      'nature': '#d2edd9',
      'lavender': '#dadeed'
    };

    const color = colorMap[theme] || '#f7f7f7';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', color);
    
    console.log("🎨 Theme Applied:", theme, "HTML ID:", html.id);
  }
  
  function updateButtonIcon(btn, theme) {
    btn.setAttribute("title", `Theme: ${theme.toUpperCase()}`);
  }
});
