/**
 * localStorage abstraction layer
 * Provides consistent error handling and JSON parsing/stringifying
 */

export const storage = {
  /**
   * Get an item from localStorage
   * @param {string} key - Storage key
   * @param {*} defaultValue - Default value if key doesn't exist or parsing fails
   * @returns {*} Parsed value or defaultValue
   */
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key)
      if (item === null) {
        return defaultValue
      }
      return JSON.parse(item)
    } catch (error) {
      console.error(`Error reading from localStorage [${key}]:`, error)
      return defaultValue
    }
  },

  /**
   * Set an item in localStorage
   * @param {string} key - Storage key
   * @param {*} value - Value to store (will be JSON.stringify'd)
   * @returns {boolean} Success status
   */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (error) {
      console.error(`Error writing to localStorage [${key}]:`, error)

      // Check for QuotaExceededError
      if (error.name === 'QuotaExceededError') {
        console.error('localStorage quota exceeded. Consider clearing old data.')
      }

      return false
    }
  },

  /**
   * Remove an item from localStorage
   * @param {string} key - Storage key
   */
  remove(key) {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.error(`Error removing from localStorage [${key}]:`, error)
    }
  },

  /**
   * Clear all localStorage data
   */
  clear() {
    try {
      localStorage.clear()
    } catch (error) {
      console.error('Error clearing localStorage:', error)
    }
  },

  /**
   * Check if a key exists in localStorage
   * @param {string} key - Storage key
   * @returns {boolean}
   */
  has(key) {
    return localStorage.getItem(key) !== null
  },

  /**
   * Get all keys in localStorage
   * @returns {string[]}
   */
  keys() {
    return Object.keys(localStorage)
  }
}

// ============================================================================
// SESSION CACHE HELPERS
// ============================================================================

const SESSION_USER_KEY = 'app:currentUser'

/**
 * Get current user from session cache
 * @returns {Object|null} User object or null
 */
export function getCurrentUserFromCache() {
  return storage.get(SESSION_USER_KEY, null)
}

/**
 * Set current user in session cache
 * @param {Object} user - User object to cache
 */
export function setCurrentUserCache(user) {
  storage.set(SESSION_USER_KEY, user)
}

/**
 * Clear current user from session cache
 */
export function clearCurrentUserCache() {
  storage.remove(SESSION_USER_KEY)
}
