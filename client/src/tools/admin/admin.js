/**
 * Admin Panel
 * User management interface for administrators
 */

import '../../shared/components/AppHeader.js'
import '../../shared/components/AppFooter.js'
import { requireAuth, isAdmin } from '../../shared/utils/auth.js'
import { users as usersAPI, equipment as equipmentAPI, config as configAPI, getAppConfig } from '../../api/client.js'
import { formatDate } from '../../shared/utils/datetime.js'
import '../../shared/utils/cyberpunk-effects.js'

// State
let currentUser = null
let allUsers = []
let allEquipment = []
let appConfig = null

// Initialize
async function init() {
    currentUser = await requireAuth(true)
    if (!currentUser) return

    if (!isAdmin(currentUser)) {
        alert('Access denied. Administrator privileges required.')
        window.location.href = '../launcher/index.html'
        return
    }

    await Promise.all([loadUsers(), loadEquipment(), loadAppSettings()])
    setupEventListeners()
}

// Load all users from API
async function loadUsers() {
    try {
        const response = await usersAPI.getAll()
        allUsers = response.data || response // Handle both { data: [] } and direct array
        renderUsersTable()
        updateStats()
    } catch (error) {
        console.error('Failed to load users:', error)

        // Clear loading state and show error
        const tbody = document.getElementById('usersTableBody')
        tbody.innerHTML = '<tr><td colspan="4" class="error-cell" style="color: var(--color-error); text-align: center; padding: 2rem;">Failed to load users. Please refresh the page.</td></tr>'

        showError(`Failed to load users: ${error.message || 'Unknown error'}`)
    }
}

// Render users table
function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody')

    if (allUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">No users found</td></tr>'
        return
    }

    tbody.innerHTML = allUsers.map(user => {
        const isCurrentUser = user.id === currentUser.id
        const canDelete = !isCurrentUser && user.username !== 'System'

        return `
            <tr>
                <td>
                    <div class="user-cell">
                        <svg class="user-avatar" viewBox="0 0 24 24" width="32" height="32">
                            <circle cx="12" cy="12" r="10" fill="var(--color-primary-light)" opacity="0.2"/>
                            <path fill="var(--color-primary-light)" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                        <span>${escapeHtml(user.username)}</span>
                        ${isCurrentUser ? '<span class="badge badge-info">You</span>' : ''}
                    </div>
                </td>
                <td>
                    ${user.role === 'admin'
                        ? '<span class="badge badge-warning">Administrator</span>'
                        : '<span class="badge">User</span>'}
                </td>
                <td>${user.created_at ? formatDate(user.created_at) : 'N/A'}</td>
                <td>
                    ${canDelete
                        ? `<button class="btn-icon btn-danger" onclick="window.adminApp.deleteUser(${user.id}, '${escapeHtml(user.username)}')" title="Delete user">
                            <svg viewBox="0 0 24 24" width="16" height="16">
                                <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                           </button>`
                        : '<span class="text-muted">—</span>'}
                </td>
            </tr>
        `
    }).join('')
}

// Update statistics
function updateStats() {
    const totalCount = allUsers.length
    const adminCount = allUsers.filter(u => u.role === 'admin').length
    const userCount = totalCount - adminCount

    document.getElementById('totalUsers').textContent = totalCount
    document.getElementById('regularUsers').textContent = userCount
    document.getElementById('adminUsers').textContent = adminCount
}

// ── Equipment ─────────────────────────────────────────────────────────────────

async function loadEquipment() {
    try {
        const res = await equipmentAPI.getAll()
        allEquipment = res.data || []
        renderEquipmentTable()
    } catch {
        document.getElementById('equipmentTableBody').innerHTML =
            '<tr><td colspan="3" style="color:var(--color-error);text-align:center;padding:1rem">Failed to load equipment</td></tr>'
    }
}

function renderEquipmentTable() {
    const tbody = document.getElementById('equipmentTableBody')
    if (!allEquipment.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:1rem;color:var(--color-text-muted)">No equipment added yet</td></tr>'
        return
    }
    tbody.innerHTML = allEquipment.map(e => `
        <tr>
            <td>${escapeHtml(e.name)}</td>
            <td>${escapeHtml(e.category || '')}</td>
            <td>
                <button class="btn-icon btn-danger" onclick="window.adminApp.deleteEquipment(${e.id}, '${escapeHtml(e.name)}')" title="Delete">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </td>
        </tr>
    `).join('')
}

async function addEquipmentPrompt() {
    const name = prompt('Equipment name:')
    if (!name?.trim()) return
    const category = prompt('Category (optional):') || 'General'
    try {
        await equipmentAPI.create({ name: name.trim(), category })
        await loadEquipment()
    } catch (e) {
        showError(e.message || 'Failed to add equipment')
    }
}

async function deleteEquipment(id, name) {
    if (!confirm(`Delete equipment "${name}"?\n\nInventory items linked to this machine will keep their data but won't appear in the machine list.`)) return
    try {
        await equipmentAPI.delete(id)
        await loadEquipment()
    } catch (e) {
        showError(e.message || 'Failed to delete equipment')
    }
}

// ── App Settings ──────────────────────────────────────────────────────────────

const TOOL_LABELS = {
    inventory: 'Inventory',
    'productivity-v4': 'Tasks',
    maintenance: 'Maintenance',
    pantone: 'Colour Library',
    converter: 'Converter',
    admin: 'Admin'
}

async function loadAppSettings() {
    try {
        appConfig = await getAppConfig()
        const app = appConfig?.app || {}
        document.getElementById('settingsAppName').value = app.name || ''
        document.getElementById('settingsTagline').value = app.tagline || ''
        document.getElementById('settingsColor').value = app.primaryColor || '#ff6b35'
        document.getElementById('settingsColorHex').textContent = app.primaryColor || '#ff6b35'
        renderToolToggles()
    } catch {}
}

function renderToolToggles() {
    const tools = appConfig?.tools || {}
    const container = document.getElementById('settingsToolToggles')
    container.innerHTML = Object.entries(TOOL_LABELS)
        .filter(([k]) => k !== 'admin') // admin always on
        .map(([key, label]) => {
            const enabled = tools[key]?.enabled !== false
            return `
                <label style="display:flex;align-items:center;gap:var(--spacing-sm);cursor:pointer;font-size:var(--text-sm)">
                    <input type="checkbox" ${enabled ? 'checked' : ''} data-tool="${key}"
                        style="width:16px;height:16px;accent-color:var(--color-primary)">
                    ${label}
                </label>
            `
        }).join('')
}

async function saveSettings() {
    const name = document.getElementById('settingsAppName').value.trim()
    const tagline = document.getElementById('settingsTagline').value.trim()
    const primaryColor = document.getElementById('settingsColor').value

    if (!name) { showError('App name is required'); return }

    // Collect tool toggles
    const toolUpdates = {}
    document.querySelectorAll('#settingsToolToggles input[data-tool]').forEach(input => {
        const key = input.dataset.tool
        toolUpdates[key] = { ...(appConfig?.tools?.[key] || {}), enabled: input.checked }
    })

    const btn = document.getElementById('saveSettingsBtn')
    btn.disabled = true
    btn.textContent = 'Saving…'

    try {
        await configAPI.save({ app: { name, tagline, primaryColor }, tools: toolUpdates })
        sessionStorage.removeItem('app:config')
        document.documentElement.style.setProperty('--color-primary', primaryColor)
        const msg = document.getElementById('settingsMsg')
        msg.textContent = '✓ Settings saved'
        msg.className = 'alert alert-success'
        msg.style.display = 'block'
        setTimeout(() => { msg.style.display = 'none' }, 3000)
    } catch (e) {
        showError(e.message || 'Failed to save settings')
    } finally {
        btn.disabled = false
        btn.textContent = 'Save Changes'
    }
}

// ── Event Listeners ───────────────────────────────────────────────────────────

// Setup event listeners
function setupEventListeners() {
    document.getElementById('createUserBtn').addEventListener('click', openCreateModal)
    document.getElementById('closeModalBtn').addEventListener('click', closeCreateModal)
    document.getElementById('cancelBtn').addEventListener('click', closeCreateModal)
    document.getElementById('createUserForm').addEventListener('submit', handleCreateUser)
    document.getElementById('addEquipmentBtn').addEventListener('click', addEquipmentPrompt)
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings)
    document.getElementById('settingsColor').addEventListener('input', e => {
        document.getElementById('settingsColorHex').textContent = e.target.value
    })
    document.getElementById('createUserModal').addEventListener('click', (e) => {
        if (e.target.id === 'createUserModal') closeCreateModal()
    })
}

// Open create user modal
function openCreateModal() {
    document.getElementById('createUserModal').style.display = 'flex'
    document.getElementById('username').focus()
}

// Close create user modal
function closeCreateModal() {
    document.getElementById('createUserModal').style.display = 'none'
    document.getElementById('createUserForm').reset()
    document.getElementById('formError').style.display = 'none'
}

// Handle create user form submission
async function handleCreateUser(e) {
    e.preventDefault()

    const formData = new FormData(e.target)
    const username = formData.get('username').trim()
    const pin = formData.get('pin')
    const confirmPin = formData.get('confirmPin')
    const role = formData.get('isAdmin') ? 'admin' : 'user'

    // Validate
    if (!username || username.length < 3) {
        showFormError('Username must be at least 3 characters')
        return
    }

    if (!pin || !/^\d{4}$/.test(pin)) {
        showFormError('PIN must be exactly 4 digits')
        return
    }

    if (pin !== confirmPin) {
        showFormError('PINs do not match')
        return
    }

    // Validate PIN strength (match server-side rules)
    const pinError = validatePINStrength(pin)
    if (pinError) {
        showFormError(pinError)
        return
    }

    // Check if username already exists
    if (allUsers.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        showFormError('Username already exists')
        return
    }

    // Create user
    try {
        await usersAPI.createUser({ username, pin, role })
        closeCreateModal()
        await loadUsers()
        showSuccess(`User "${username}" created successfully`)
    } catch (error) {
        console.error('Failed to create user:', error)
        showFormError(error.message || 'Failed to create user')
    }
}

// Delete user
async function deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?\n\nThis action cannot be undone.`)) {
        return
    }

    try {
        await usersAPI.deleteUser(userId)
        await loadUsers()
        showSuccess(`User "${username}" deleted successfully`)
    } catch (error) {
        console.error('Failed to delete user:', error)
        showError(error.message || 'Failed to delete user')
    }
}

// Show form error
function showFormError(message) {
    const errorEl = document.getElementById('formError')
    errorEl.textContent = message
    errorEl.style.display = 'block'
}

// Show success message
function showSuccess(message) {
    // You could implement a toast notification here
    alert(message)
}

// Show error message
function showError(message) {
    alert(message)
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

// Validate PIN strength (matches server-side validation)
function validatePINStrength(pin) {
    // Prohibit all same digits (0000, 1111, 2222, etc.)
    if (/^(\d)\1{3}$/.test(pin)) {
        return 'PIN cannot be all the same digit (e.g., 1111, 0000)'
    }

    // Prohibit sequential patterns (ascending and descending)
    const sequential = [
        '0123', '1234', '2345', '3456', '4567', '5678', '6789', // ascending
        '9876', '8765', '7654', '6543', '5432', '4321', '3210'  // descending
    ]
    if (sequential.includes(pin)) {
        return 'PIN cannot be sequential (e.g., 1234, 4321)'
    }

    return null // Valid PIN
}

// Export functions to window for inline event handlers
window.adminApp = {
    deleteUser,
    deleteEquipment
}

// Start the app
init()
