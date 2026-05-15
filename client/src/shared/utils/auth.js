/**
 * Authentication utilities
 * Handles user login, logout, and session management
 */

const API_BASE = '/api/v1'

/**
 * Get current user from localStorage cache
 * @returns {Object|null} User object or null if not cached
 */
export function getCurrentUserFromCache() {
  try {
    const userStr = localStorage.getItem('user')
    return userStr ? JSON.parse(userStr) : null
  } catch (error) {
    console.error('Error reading user from cache:', error)
    return null
  }
}

/**
 * Save user to localStorage cache
 * @param {Object} user - User object to cache
 */
export function cacheCurrentUser(user) {
  try {
    localStorage.setItem('user', JSON.stringify(user))
  } catch (error) {
    console.error('Error caching user:', error)
  }
}

/**
 * Clear user from localStorage cache
 */
export function clearCurrentUserCache() {
  try {
    localStorage.removeItem('user')
  } catch (error) {
    console.error('Error clearing user cache:', error)
  }
}

/**
 * Get current authenticated user from server
 * @returns {Promise<Object|null>} User object or null if not authenticated
 */
export async function getCurrentUser() {
  try {
    const response = await fetch(`${API_BASE}/users/me`, {
      credentials: 'include'
    })

    if (!response.ok) {
      if (response.status === 401) {
        clearCurrentUserCache()
        return null
      }
      throw new Error(`Failed to get current user: ${response.status}`)
    }

    const data = await response.json()
    const user = data.data

    // Cache the user data
    cacheCurrentUser(user)

    return user
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

/**
 * Login with username and PIN
 * @param {string} username - Username
 * @param {string} pin - PIN code
 * @returns {Promise<Object>} User object
 * @throws {Error} If login fails
 */
export async function login(username, pin) {
  try {
    const response = await fetch(`${API_BASE}/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ username, pin })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Login failed')
    }

    const user = data.data

    // Cache the user data
    cacheCurrentUser(user)

    return user
  } catch (error) {
    console.error('Login error:', error)
    throw error
  }
}

/**
 * Logout current user
 * @returns {Promise<void>}
 */
export async function logout() {
  try {
    const response = await fetch(`${API_BASE}/users/logout`, {
      method: 'POST',
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error('Logout failed')
    }

    // Clear cached user data
    clearCurrentUserCache()
  } catch (error) {
    console.error('Logout error:', error)
    throw error
  }
}

/**
 * Check if user has admin role
 * @param {Object} user - User object
 * @returns {boolean}
 */
export function isAdmin(user) {
  return user && user.role === 'admin'
}

/**
 * Redirect to login page
 */
export function redirectToLogin() {
  window.location.href = '/src/tools/login/index.html'
}

/**
 * Check authentication and redirect if not authenticated
 * @param {boolean} adminRequired - Whether admin role is required
 * @returns {Promise<Object|null>} User object or null
 */
export async function requireAuth(adminRequired = false) {
  const user = await getCurrentUser()

  if (!user) {
    redirectToLogin()
    return null
  }

  if (adminRequired && !isAdmin(user)) {
    alert('Admin access required')
    window.location.href = '/src/tools/launcher/index.html'
    return null
  }

  return user
}
