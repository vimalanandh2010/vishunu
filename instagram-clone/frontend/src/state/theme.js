const THEME_KEY = 'velove_theme';

/**
 * Returns the stored theme preference ('light' | 'dark').
 * Defaults to 'dark' — VELOVE's Velvet Dark signature look.
 */
export function getStoredTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * Applies a theme to the document. Setting it on <html> (not <body>)
 * makes every [data-theme="dark"] descendant selector work — including
 * the `[data-theme="dark"] body` background rules.
 */
export function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // storage unavailable — theme still applies for this page load
  }
  return t;
}

/**
 * Toggles the theme and returns the new value.
 */
export function toggleTheme() {
  const next = getStoredTheme() === 'dark' ? 'light' : 'dark';
  return applyTheme(next);
}
