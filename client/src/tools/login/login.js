/**
 * Login page logic
 * Handles PIN pad input and authentication
 */

import { login } from '../../shared/utils/auth.js'
import { setCurrentUserCache } from '../../shared/utils/storage.js'
import { getAppConfig } from '../../api/client.js'
import '../../shared/utils/cyberpunk-effects.js'
import '../../shared/utils/lowEnergy.js'

// Populate app name and footer from config (getAppConfig caches the result)
getAppConfig().then(cfg => {
  const name = cfg?.app?.name || 'WorkBase'
  const el = document.getElementById('loginAppName')
  if (el) el.textContent = name
  document.title = `Login — ${name}`
  const footer = document.getElementById('loginFooterText')
  if (footer) footer.textContent = `${name} v3.0.0`
  if (cfg?.app?.primaryColor) {
    document.documentElement.style.setProperty('--color-primary', cfg.app.primaryColor)
  }
}).catch(() => {
  const el = document.getElementById('loginAppName')
  if (el) el.textContent = 'WorkBase'
  const footer = document.getElementById('loginFooterText')
  if (footer) footer.textContent = 'WorkBase v3.0.0'
})

// Login state
let pinValue = ''
const MAX_PIN_LENGTH = 6

// DOM elements
const usernameInput = document.getElementById('username')
const pinDisplay = document.getElementById('pinDisplay')
const loginForm = document.getElementById('loginForm')
const loginButton = document.getElementById('loginButton')
const errorMessage = document.getElementById('errorMessage')
const clearButton = document.getElementById('clearButton')
const backspaceButton = document.getElementById('backspaceButton')

/**
 * Initialize login page
 */
async function init() {
  // setup_complete=false means we need first-time setup
  // We read this from /api/v1/config which is always whitelisted
  try {
    const response = await fetch('/api/v1/config', { credentials: 'include' })
    const data = await response.json()
    if (data.success && data.data.setup_complete === false) {
      showFirstTimeSetup()
      return
    }
  } catch (e) {
    // If config fetch fails, fall through to login form
  }

  // Normal login flow
  setupLoginForm()
}

/**
 * Setup login form for normal authentication
 */
function setupLoginForm() {
  // Attach event listeners to PIN pad buttons
  document.querySelectorAll('.pin-button[data-digit]').forEach(button => {
    button.addEventListener('click', () => {
      const digit = button.dataset.digit
      addDigit(digit)
    })
  })

  // Clear button
  clearButton.addEventListener('click', clearPin)

  // Backspace button
  backspaceButton.addEventListener('click', backspace)

  // Form submission
  loginForm.addEventListener('submit', handleSubmit)

  // Allow keyboard input for PIN when pinDisplay is focused
  pinDisplay.addEventListener('keydown', (event) => {
    if (event.key >= '0' && event.key <= '9') {
      event.preventDefault()
      addDigit(event.key)
    } else if (event.key === 'Backspace') {
      event.preventDefault()
      backspace()
    } else if (event.key === 'Delete' || event.key === 'Escape') {
      event.preventDefault()
      clearPin()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      loginForm.dispatchEvent(new Event('submit'))
    }
  })

  // Allow keyboard input for PIN (numeric keys) from anywhere
  document.addEventListener('keydown', handleKeyPress)

  // Focus username input on load
  usernameInput.focus()
}

/**
 * Add digit to PIN
 * @param {string} digit - Digit to add (0-9)
 */
function addDigit(digit) {
  if (pinValue.length < MAX_PIN_LENGTH) {
    pinValue += digit
    updatePinDisplay()
  }
}

/**
 * Remove last digit from PIN
 */
function backspace() {
  if (pinValue.length > 0) {
    pinValue = pinValue.slice(0, -1)
    updatePinDisplay()
  }
}

/**
 * Clear entire PIN
 */
function clearPin() {
  pinValue = ''
  updatePinDisplay()
}

/**
 * Update PIN display with dots
 */
function updatePinDisplay() {
  const dots = '•'.repeat(pinValue.length)
  const placeholder = pinValue.length === 0 ? 'Enter PIN' : dots
  pinDisplay.querySelector('.pin-dots').textContent = placeholder
}

/**
 * Handle keyboard input
 * @param {KeyboardEvent} event
 */
function handleKeyPress(event) {
  // Don't intercept keyboard input if username field or pinDisplay is focused
  // (pinDisplay has its own keydown listener to avoid double-firing)
  if (document.activeElement === usernameInput) {
    return
  }
  if (document.activeElement === pinDisplay) {
    return
  }

  // Only handle numeric keys, backspace, and enter when NOT in username field
  if (event.key >= '0' && event.key <= '9') {
    event.preventDefault()
    addDigit(event.key)
  } else if (event.key === 'Backspace') {
    event.preventDefault()
    backspace()
  } else if (event.key === 'Delete' || event.key === 'Escape') {
    event.preventDefault()
    clearPin()
  }
}

/**
 * Show error message
 * @param {string} message - Error message to display
 */
function showError(message) {
  errorMessage.textContent = message
  errorMessage.classList.remove('hidden')

  // Shake animation
  errorMessage.classList.add('shake')
  setTimeout(() => {
    errorMessage.classList.remove('shake')
  }, 500)
}

/**
 * Hide error message
 */
function hideError() {
  errorMessage.classList.add('hidden')
}

/**
 * Handle form submission
 * @param {Event} event
 */
async function handleSubmit(event) {
  event.preventDefault()
  hideError()

  const username = usernameInput.value.trim()

  // Validate inputs
  if (!username) {
    showError('Please enter your username')
    usernameInput.focus()
    return
  }

  if (pinValue.length < 4) {
    showError('PIN must be at least 4 digits')
    return
  }

  // Disable form during submission
  loginButton.disabled = true
  loginButton.textContent = 'Signing in...'

  try {
    // Attempt login
    const user = await login(username, pinValue)

    // Cache user data
    setCurrentUserCache(user)

    // Success - redirect to dashboard
    window.location.href = '/src/tools/launcher/index.html'
  } catch (error) {
    // Show error
    showError(error.message || 'Invalid username or PIN')

    // Clear PIN
    clearPin()

    // Re-enable form
    loginButton.disabled = false
    loginButton.textContent = 'Sign In'

    // Focus username for retry
    usernameInput.select()
  }
}

/**
 * Redirect to setup wizard if first-time setup is needed
 * (setupGuard handles this server-side; this is a client-side fallback)
 */
function showFirstTimeSetup() {
  window.location.href = '/src/tools/setup/index.html'
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
