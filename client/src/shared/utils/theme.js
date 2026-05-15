/**
 * Theme Management Utility
 *
 * Provides centralized theme management with localStorage persistence
 * and cross-tab synchronization.
 */

const THEME_KEY = 'app:theme'

const THEMES = {
  DEFAULT: 'default',
  WIN95: 'win95',
  AQUA: 'aqua',
  NEON_DUSK: 'neon-dusk',
  CYBERPUNK_MAGENTA: 'cyberpunk-magenta',
  CYBERPUNK_ORANGE: 'cyberpunk-orange'
}

const THEME_DISPLAY_NAMES = {
  [THEMES.DEFAULT]: 'Dark (Default)',
  [THEMES.WIN95]: 'Windows 95',
  [THEMES.AQUA]: 'Mac Aqua',
  [THEMES.NEON_DUSK]: 'Neon Dusk',
  [THEMES.CYBERPUNK_MAGENTA]: 'Cyberpunk 2077',
  [THEMES.CYBERPUNK_ORANGE]: 'Cyberpunk 2077'
}

/**
 * Get the current theme from localStorage
 * @returns {string} Current theme name
 */
function get() {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    // Validate theme exists
    if (stored && Object.values(THEMES).includes(stored)) {
      return stored
    }
    return THEMES.DEFAULT
  } catch (e) {
    console.warn('[Theme] localStorage unavailable, using default theme')
    return THEMES.DEFAULT
  }
}

/**
 * Set the theme and persist to localStorage
 * @param {string} themeName - Theme to activate
 * @returns {boolean} Success status
 */
function set(themeName) {
  // Validate theme name
  if (!Object.values(THEMES).includes(themeName)) {
    console.error(`[Theme] Invalid theme name: ${themeName}`)
    return false
  }

  try {
    // Update localStorage
    localStorage.setItem(THEME_KEY, themeName)

    // Apply theme to DOM
    document.documentElement.setAttribute('data-theme', themeName)

    // Dispatch custom event for listeners
    window.dispatchEvent(new CustomEvent('themechange', {
      detail: { theme: themeName }
    }))

    console.log(`[Theme] Switched to: ${themeName}`)
    return true
  } catch (e) {
    console.error('[Theme] Failed to set theme:', e)
    return false
  }
}

/**
 * Get all available themes with display names
 * @returns {Array} Array of {value, label, active} objects
 */
function getAvailable() {
  const current = get()
  return Object.entries(THEME_DISPLAY_NAMES).map(([value, label]) => ({
    value,
    label,
    active: value === current
  }))
}

/**
 * Check if a specific theme is currently active
 * @param {string} themeName - Theme to check
 * @returns {boolean} True if theme is active
 */
function is(themeName) {
  return get() === themeName
}

/**
 * Get the display name for the current theme
 * @returns {string} Display name
 */
function getDisplayName(themeName = null) {
  const theme = themeName || get()
  return THEME_DISPLAY_NAMES[theme] || THEME_DISPLAY_NAMES[THEMES.DEFAULT]
}

/**
 * Check if current theme is a Cyberpunk variant
 * @param {string} themeName - Optional theme name to check
 * @returns {boolean} True if Cyberpunk theme
 */
function isCyberpunkTheme(themeName = null) {
  const theme = themeName || get()
  return theme.startsWith('cyberpunk-')
}

/**
 * Get current Cyberpunk variant (magenta or orange)
 * @returns {string|null} Variant name or null
 */
function getCyberpunkVariant() {
  const theme = get()
  if (theme === THEMES.CYBERPUNK_MAGENTA) return 'magenta'
  if (theme === THEMES.CYBERPUNK_ORANGE) return 'orange'
  return null
}

/**
 * Toggle between Cyberpunk color variants
 */
function toggleCyberpunkVariant() {
  const current = get()
  if (current === THEMES.CYBERPUNK_MAGENTA) {
    set(THEMES.CYBERPUNK_ORANGE)
  } else if (current === THEMES.CYBERPUNK_ORANGE) {
    set(THEMES.CYBERPUNK_MAGENTA)
  }
}

/**
 * Initialize theme system
 * Sets up cross-tab synchronization via storage events
 */
function init() {
  // Apply current theme
  const current = get()
  document.documentElement.setAttribute('data-theme', current)

  // Listen for storage events (cross-tab sync)
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY && e.newValue) {
      const newTheme = e.newValue
      if (Object.values(THEMES).includes(newTheme)) {
        document.documentElement.setAttribute('data-theme', newTheme)
        window.dispatchEvent(new CustomEvent('themechange', {
          detail: { theme: newTheme }
        }))
        console.log(`[Theme] Synced from another tab: ${newTheme}`)
      }
    }
  })
}

// Auto-initialize when module loads
if (typeof window !== 'undefined') {
  init()
}

export const theme = {
  get,
  set,
  getAvailable,
  is,
  getDisplayName,
  isCyberpunkTheme,
  getCyberpunkVariant,
  toggleCyberpunkVariant,
  THEMES
}
