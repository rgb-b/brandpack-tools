/**
 * Setup Wizard
 * Handles the first-run configuration flow.
 */

const PRESET_COLORS = [
  '#ff6b35', '#e74c3c', '#9b59b6', '#3498db',
  '#1abc9c', '#2ecc71', '#f39c12', '#e67e22'
]

const DEFAULT_TOOLS = {
  inventory:        { label: 'Inventory',      description: 'Track supplies and stock levels', enabled: true },
  'productivity-v4':{ label: 'Tasks',           description: 'Task tracking and time sessions', enabled: true },
  maintenance:      { label: 'Maintenance',     description: 'Equipment issues and service log', enabled: true },
  pantone:          { label: 'Colour Library',  description: 'Colour matching and status tracker', enabled: false, optional: true },
  converter:        { label: 'Converter',       description: 'LAB ↔ CMYK colour conversion',    enabled: false, optional: true },
  admin:            { label: 'Admin',           description: 'User and PIN management',          enabled: true }
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentStep = 0
let selectedColor = '#ff6b35'
let tools = JSON.parse(JSON.stringify(DEFAULT_TOOLS))
let equipment = []

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderColorSwatches()
  renderToolToggles()
  renderEquipmentList()
  attachColorListeners()

  document.getElementById('newEquipName').addEventListener('keydown', e => {
    if (e.key === 'Enter') addEquipment()
  })
})

// ── Navigation ────────────────────────────────────────────────────────────────
window.goTo = function(step) {
  if (!validateStep(currentStep)) return

  document.getElementById(`step-${currentStep}`).classList.remove('visible')
  currentStep = step
  document.getElementById(`step-${currentStep}`).classList.add('visible')

  // Update progress bar
  document.querySelectorAll('.progress-step').forEach((el, i) => {
    el.classList.remove('active', 'done')
    if (i < currentStep) el.classList.add('done')
    else if (i === currentStep) el.classList.add('active')
  })
}

function validateStep(step) {
  if (step === 1) {
    const name = document.getElementById('appName').value.trim()
    if (!name) {
      document.getElementById('appName').focus()
      document.getElementById('appName').style.borderColor = 'var(--color-error)'
      return false
    }
    document.getElementById('appName').style.borderColor = ''
  }
  return true
}

// ── Colour picker ─────────────────────────────────────────────────────────────
function renderColorSwatches() {
  const container = document.getElementById('colorSwatches')
  container.innerHTML = PRESET_COLORS.map(c => `
    <div class="swatch ${c === selectedColor ? 'selected' : ''}"
         style="background:${c}"
         onclick="selectColor('${c}')"
         title="${c}"></div>
  `).join('')
}

function attachColorListeners() {
  const picker = document.getElementById('customColor')
  picker.addEventListener('input', e => {
    selectColor(e.target.value, false)
    document.getElementById('colorHex').textContent = e.target.value
  })
}

window.selectColor = function(color, updatePicker = true) {
  selectedColor = color
  document.documentElement.style.setProperty('--color-primary', color)
  renderColorSwatches()
  if (updatePicker) {
    document.getElementById('customColor').value = color
    document.getElementById('colorHex').textContent = color
  }
}

// ── Tool toggles ─────────────────────────────────────────────────────────────
function renderToolToggles() {
  const container = document.getElementById('toolList')
  container.innerHTML = Object.entries(tools).map(([key, tool]) => `
    <div class="tool-toggle">
      <div class="tool-toggle-info">
        <div class="tool-toggle-name">
          ${tool.label}
          ${tool.optional ? '<span class="tool-badge">optional</span>' : ''}
        </div>
        <div class="tool-toggle-desc">${tool.description}</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" ${tool.enabled ? 'checked' : ''}
               onchange="toggleTool('${key}', this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
  `).join('')
}

window.toggleTool = function(key, enabled) {
  // Admin is always on
  if (key === 'admin') return
  tools[key].enabled = enabled
}

// ── Equipment ─────────────────────────────────────────────────────────────────
function renderEquipmentList() {
  const container = document.getElementById('equipmentList')
  if (!equipment.length) {
    container.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--text-sm);text-align:center;padding:var(--spacing-md)">No equipment added yet — add your first item below.</p>'
    return
  }
  container.innerHTML = equipment.map((e, i) => `
    <div class="equipment-item">
      <span class="equipment-item-name">${e.name}</span>
      <span class="equipment-item-cat">${e.category}</span>
      <button class="btn btn-sm" style="padding:4px 10px;margin-left:auto"
              onclick="removeEquipment(${i})">✕</button>
    </div>
  `).join('')
}

window.addEquipment = function() {
  const nameEl = document.getElementById('newEquipName')
  const catEl = document.getElementById('newEquipCat')
  const name = nameEl.value.trim()
  if (!name) { nameEl.focus(); return }

  equipment.push({ name, category: catEl.value.trim() || 'General' })
  nameEl.value = ''
  catEl.value = ''
  nameEl.focus()
  renderEquipmentList()
}

window.removeEquipment = function(index) {
  equipment.splice(index, 1)
  renderEquipmentList()
}

// ── Finish ────────────────────────────────────────────────────────────────────
window.finishSetup = async function() {
  const username = document.getElementById('adminUsername').value.trim()
  const pin = document.getElementById('adminPin').value.trim()
  const errEl = document.getElementById('setupError')
  const btn = document.getElementById('finishBtn')

  errEl.style.display = 'none'

  if (!username) return showError('Username is required.')
  if (!pin || pin.length < 4) return showError('PIN must be at least 4 digits.')
  if (!/^\d+$/.test(pin)) return showError('PIN must be digits only.')

  btn.disabled = true
  btn.textContent = 'Setting up…'

  try {
    // 1. Save config
    const configPayload = {
      app: {
        name: document.getElementById('appName').value.trim() || 'WorkBase',
        tagline: document.getElementById('appTagline').value.trim(),
        primaryColor: selectedColor,
        logoText: (document.getElementById('appName').value.trim()[0] || 'W').toUpperCase()
      },
      tools
    }

    const cfgRes = await fetch('/api/v1/config/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configPayload)
    })
    if (!cfgRes.ok) throw new Error('Config save failed')

    // 2. Create admin user
    const userRes = await fetch('/api/v1/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, pin, role: 'admin' })
    })
    if (!userRes.ok) {
      const data = await userRes.json()
      throw new Error(data.message || 'User creation failed')
    }

    // 3. Create equipment items
    for (const item of equipment) {
      await fetch('/api/v1/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      })
    }

    // 4. Show success
    showSuccess(configPayload.app.name)

  } catch (err) {
    showError(err.message || 'Setup failed. Please try again.')
    btn.disabled = false
    btn.textContent = 'Finish Setup ✓'
  }
}

function showError(msg) {
  const el = document.getElementById('setupError')
  el.textContent = msg
  el.style.display = 'block'
}

function showSuccess(appName) {
  document.getElementById('doneTitle').textContent = `${appName} is ready!`

  const enabledTools = Object.values(tools).filter(t => t.enabled).map(t => t.label)
  const summary = [
    `App name: ${document.getElementById('appName').value.trim() || 'WorkBase'}`,
    `Tools enabled: ${enabledTools.join(', ')}`,
    equipment.length ? `Equipment added: ${equipment.length} item(s)` : 'No equipment added yet',
    `Admin user: ${document.getElementById('adminUsername').value.trim()}`
  ]

  document.getElementById('summaryList').innerHTML =
    summary.map(s => `<li>${s}</li>`).join('')

  goTo(5)
}
