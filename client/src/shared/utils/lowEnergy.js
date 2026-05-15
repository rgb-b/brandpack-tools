/**
 * Low Energy Mode Utility
 *
 * Toggleable mode that kills CSS animations and slows JS polling intervals
 * for Mac/low-RAM devices. Mirrors the theme.js pattern exactly.
 */

const KEY = 'app:lowEnergy'

function get() {
  try { return localStorage.getItem(KEY) === 'true' }
  catch { return false }
}

function set(enabled) {
  try { localStorage.setItem(KEY, String(enabled)) } catch {}
  apply(enabled)
  window.dispatchEvent(new CustomEvent('lowenergychange', { detail: { enabled } }))
}

function apply(enabled) {
  document.documentElement.setAttribute('data-low-energy', enabled ? 'true' : 'false')
}

function toggle() { set(!get()); return get() }

function init() {
  apply(get())
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) apply(e.newValue === 'true')
  })
}

// Auto-initialize when module loads (same as theme.js)
if (typeof window !== 'undefined') init()

export const lowEnergy = { get, set, toggle, init }
