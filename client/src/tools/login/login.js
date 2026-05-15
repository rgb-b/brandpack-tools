/**
 * Login page logic
 * Handles PIN pad input and authentication
 */

import { login } from '../../shared/utils/auth.js'
import { setCurrentUserCache } from '../../shared/utils/storage.js'
import { getAppConfig } from '../../api/client.js'
import '../../shared/utils/cyberpunk-effects.js'
import '../../shared/utils/lowEnergy.js'

// Populate app name from config
getAppConfig().then(cfg => {
  const name = cfg?.app?.name || 'WorkBase'
  const el = document.getElementById('loginAppName')
  if (el) el.textContent = name
  const setupTitle = document.getElementById('loginSetupTitle')
  if (setupTitle) setupTitle.textContent = `Welcome to ${name}!`
  document.title = `Login — ${name}`
  if (cfg?.app?.primaryColor) {
    document.documentElement.style.setProperty('--color-primary', cfg.app.primaryColor)
  }
}).catch(() => {
  const el = document.getElementById('loginAppName')
  if (el) el.textContent = 'WorkBase'
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
  // Check if first-time setup is needed
  const setupRequired = await checkSetupRequired()

  if (setupRequired) {
    showFirstTimeSetup()
    return
  }

  // Normal login flow
  setupLoginForm()
}

/**
 * Check if first-time setup is needed
 * @returns {Promise<boolean>}
 */
async function checkSetupRequired() {
  try {
    const response = await fetch('/api/v1/users/setup/required', {
      credentials: 'include'
    })
    const data = await response.json()
    return data.data.setupRequired
  } catch (error) {
    console.error('Failed to check setup status:', error)
    return false
  }
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
 * Show first-time setup UI
 */
function showFirstTimeSetup() {
  document.getElementById('loginCard').style.display = 'none'
  document.getElementById('setupCard').style.display = 'block'

  // Setup form submission
  document.getElementById('setupForm').addEventListener('submit', handleSetupSubmit)

  // Import checkbox handler
  document.getElementById('importLegacyData').addEventListener('change', (e) => {
    if (e.target.checked) {
      document.getElementById('importFile').click()
    }
  })

  document.getElementById('importFile').addEventListener('change', (e) => {
    const checkbox = document.getElementById('importLegacyData')
    checkbox.checked = e.target.files.length > 0
  })

  // Focus the username input
  document.getElementById('setupUsername').focus()
}

/**
 * Handle setup form submission
 * @param {Event} e
 */
async function handleSetupSubmit(e) {
  e.preventDefault()

  const username = document.getElementById('setupUsername').value.trim()
  const pin = document.getElementById('setupPin').value
  const pinConfirm = document.getElementById('setupPinConfirm').value
  const importCheckbox = document.getElementById('importLegacyData')
  const importFile = document.getElementById('importFile').files[0]

  // Validate
  if (pin !== pinConfirm) {
    showSetupError('PINs do not match')
    return
  }

  const submitBtn = document.getElementById('setupSubmitBtn')
  submitBtn.disabled = true
  submitBtn.textContent = 'Setting up...'

  try {
    let endpoint = '/api/v1/users/setup'
    let body = { username, pin }

    // If importing data, use different endpoint and include data
    if (importCheckbox.checked && importFile) {
      const fileContent = await readFileAsText(importFile)
      const importData = JSON.parse(fileContent)
      endpoint = '/api/v1/users/setup/import'
      body.importData = importData
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Setup failed')
    }

    // Store user and redirect
    const user = data.data.user || data.data
    setCurrentUserCache(user)
    window.location.href = '/src/tools/launcher/index.html'

  } catch (error) {
    console.error('Setup error:', error)
    showSetupError(error.message || 'Setup failed. Please try again.')
    submitBtn.disabled = false
    submitBtn.textContent = 'Complete Setup'
  }
}

/**
 * Show setup error message
 * @param {string} message
 */
function showSetupError(message) {
  const errorEl = document.getElementById('setupError')
  errorEl.textContent = message
  errorEl.style.display = 'block'
  setTimeout(() => {
    errorEl.style.display = 'none'
  }, 5000)
}

/**
 * Read file as text
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
