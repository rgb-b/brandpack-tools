/**
 * Density Profiles
 * CMYK press profile database with client-side nearest-match ranking.
 */

import { requireAuth, isAdmin } from '../../shared/utils/auth.js'
import toast from '../../shared/components/Toast.js'
import '../../shared/components/AppHeader.js'

// ── State ────────────────────────────────────────────────────────────────────

let allProfiles = []   // full dataset from API
let currentUser = null
let expandedId = null  // currently expanded card id

// ── API ──────────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const res = await fetch(`/api/v1/density-profiles${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`)
  return data.data
}

// ── Distance / ranking ───────────────────────────────────────────────────────

function euclidean(profile, targets) {
  const channels = [
    ['cyan',    targets.c],
    ['magenta', targets.m],
    ['yellow',  targets.y],
    ['black',   targets.k]
  ].filter(([, v]) => v !== null)

  if (channels.length === 0) return null

  const sum = channels.reduce((acc, [col, t]) => {
    const pv = profile[col]
    return pv != null ? acc + (pv - t) ** 2 : acc + t ** 2
  }, 0)
  return Math.round(Math.sqrt(sum) * 1000) / 1000
}

function distClass(d) {
  if (d === null) return 'none'
  if (d < 0.1)   return 'close'
  if (d < 0.3)   return 'medium'
  return 'far'
}

// ── Filtering / sorting ──────────────────────────────────────────────────────

function getTargets() {
  const parse = id => {
    const v = parseFloat(document.getElementById(id).value)
    return isNaN(v) ? null : v
  }
  return { c: parse('inputC'), m: parse('inputM'), y: parse('inputY'), k: parse('inputK') }
}

function applyFilters(profiles) {
  const text    = document.getElementById('filterText').value.trim().toLowerCase()
  const printer = document.getElementById('filterPrinter').value
  const ptype   = document.getElementById('filterType').value

  return profiles.filter(p => {
    if (text    && !p.profile_name.toLowerCase().includes(text) && !p.printer.toLowerCase().includes(text)) return false
    if (printer && p.printer !== printer) return false
    if (ptype   && p.print_type !== ptype) return false
    return true
  })
}

function rankAndPartition(profiles, targets) {
  const hasTargets = Object.values(targets).some(v => v !== null)

  const complete   = []
  const incomplete = []

  for (const p of profiles) {
    const hasAll = p.cyan != null && p.magenta != null && p.yellow != null && p.black != null
    if (hasAll) {
      complete.push({ ...p, distance: hasTargets ? euclidean(p, targets) : null })
    } else {
      incomplete.push({ ...p, distance: null })
    }
  }

  if (hasTargets) complete.sort((a, b) => a.distance - b.distance)

  return { complete, incomplete }
}

// ── Render helpers ───────────────────────────────────────────────────────────

function cmykDisplay(p) {
  const fmt = (v, cls) => `
    <span class="cmyk-val ${cls}">
      <span class="lbl">${cls.toUpperCase()}</span>
      <span class="num${v == null ? ' null-val' : ''}">${v != null ? v.toFixed(2) : '—'}</span>
    </span>`
  return `
    <div class="profile-cmyk">
      ${fmt(p.cyan,    'c')}
      ${fmt(p.magenta, 'm')}
      ${fmt(p.yellow,  'y')}
      ${fmt(p.black,   'k')}
    </div>`
}

function distBadge(distance) {
  const cls = distClass(distance)
  if (cls === 'none') return ''
  const label = distance < 0.1 ? 'Close match' : distance < 0.3 ? 'Near' : 'Far'
  return `<span class="distance-badge ${cls}">${label} Δ${distance.toFixed(3)}</span>`
}

function editForm(p, isNew = false) {
  const id = isNew ? 'new' : p.id
  return `
    <div class="edit-grid">
      <div class="edit-field">
        <label>Printer</label>
        <input id="ef-printer-${id}" type="text" value="${esc(isNew ? '' : p.printer)}" placeholder="Printer name">
      </div>
      <div class="edit-field">
        <label>Profile Name</label>
        <input id="ef-name-${id}" type="text" value="${esc(isNew ? '' : p.profile_name)}" placeholder="Profile name">
      </div>
      <div class="edit-field">
        <label>Print Type</label>
        <select id="ef-type-${id}">
          <option value="">—</option>
          <option value="RP"     ${(!isNew && p.print_type === 'RP')     ? 'selected' : ''}>RP</option>
          <option value="SP"     ${(!isNew && p.print_type === 'SP')     ? 'selected' : ''}>SP</option>
          <option value="CBW SP" ${(!isNew && p.print_type === 'CBW SP') ? 'selected' : ''}>CBW SP</option>
        </select>
      </div>
      <div class="edit-field">
        <label>Status</label>
        <select id="ef-status-${id}">
          <option value="ok"           ${(!isNew && p.status === 'ok')           ? 'selected' : ''}>OK</option>
          <option value="needs_review" ${(!isNew && p.status === 'needs_review') ? 'selected' : ''}>Needs Review</option>
        </select>
      </div>
    </div>
    <div class="cmyk-edit-row">
      <div class="edit-field">
        <label style="color:#5bb8d4">C</label>
        <input id="ef-c-${id}" type="number" min="0" max="4" step="0.01" value="${isNew ? '' : (p.cyan ?? '')}" placeholder="—">
      </div>
      <div class="edit-field">
        <label style="color:#e05a8a">M</label>
        <input id="ef-m-${id}" type="number" min="0" max="4" step="0.01" value="${isNew ? '' : (p.magenta ?? '')}" placeholder="—">
      </div>
      <div class="edit-field">
        <label style="color:#d4b84a">Y</label>
        <input id="ef-y-${id}" type="number" min="0" max="4" step="0.01" value="${isNew ? '' : (p.yellow ?? '')}" placeholder="—">
      </div>
      <div class="edit-field">
        <label>K</label>
        <input id="ef-k-${id}" type="number" min="0" max="4" step="0.01" value="${isNew ? '' : (p.black ?? '')}" placeholder="—">
      </div>
    </div>
    <div class="edit-field" style="margin-top:2px">
      <label>Comments</label>
      <textarea id="ef-comments-${id}" rows="2">${isNew ? '' : esc(p.comments || '')}</textarea>
    </div>
    <div class="edit-actions">
      ${!isNew && isAdmin(currentUser) ? `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${p.id}">Delete</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-action="cancel" data-id="${id}">Cancel</button>
      <button class="btn btn-primary btn-sm" data-action="${isNew ? 'create' : 'save'}" data-id="${id}">
        ${isNew ? 'Add Profile' : 'Save'}
      </button>
    </div>`
}

function profileCard(p, rank) {
  const isOpen = expandedId === p.id
  return `
    <div class="profile-card${p.status === 'needs_review' ? ' needs-review' : ''}" data-id="${p.id}">
      <div class="profile-card-header" data-toggle="${p.id}">
        <span class="profile-rank">#${rank}</span>
        <div class="profile-info">
          <div class="profile-name">${esc(p.profile_name)}</div>
          <div class="profile-meta">
            <span class="meta-tag">${esc(p.printer)}</span>
            ${p.print_type ? `<span class="meta-tag">${esc(p.print_type)}</span>` : ''}
            ${p.status === 'needs_review' ? '<span class="review-badge">Needs Review</span>' : ''}
          </div>
        </div>
        ${cmykDisplay(p)}
        ${distBadge(p.distance)}
      </div>
      <div class="profile-body${isOpen ? ' open' : ''}" data-body="${p.id}">
        ${editForm(p)}
      </div>
    </div>`
}

function incompleteCard(p) {
  const isOpen = expandedId === p.id
  return `
    <div class="profile-card incomplete${p.status === 'needs_review' ? ' needs-review' : ''}" data-id="${p.id}">
      <div class="profile-card-header" data-toggle="${p.id}">
        <span class="profile-rank">—</span>
        <div class="profile-info">
          <div class="profile-name">${esc(p.profile_name)}</div>
          <div class="profile-meta">
            <span class="meta-tag">${esc(p.printer)}</span>
            ${p.print_type ? `<span class="meta-tag">${esc(p.print_type)}</span>` : ''}
            ${p.status === 'needs_review' ? '<span class="review-badge">Needs Review</span>' : ''}
            <span class="meta-tag" style="color:var(--color-warning)">Incomplete</span>
          </div>
        </div>
        ${cmykDisplay(p)}
      </div>
      <div class="profile-body${isOpen ? ' open' : ''}" data-body="${p.id}">
        ${editForm(p)}
      </div>
    </div>`
}

function addCard() {
  const isOpen = expandedId === 'new'
  return `
    <div class="add-card" data-id="new">
      <div class="add-card-header" data-toggle="new">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add profile
      </div>
      <div class="add-card-body${isOpen ? ' open' : ''}">
        ${editForm({}, true)}
      </div>
    </div>`
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ── Main render ──────────────────────────────────────────────────────────────

function render() {
  const results = document.getElementById('results')
  const targets = getTargets()
  const filtered = applyFilters(allProfiles)
  const { complete, incomplete } = rankAndPartition(filtered, targets)

  const hasTargets = Object.values(targets).some(v => v !== null)

  const count = filtered.length
  let html = `<div class="dp-toolbar"><span class="dp-count">${count} profile${count !== 1 ? 's' : ''}${hasTargets ? ' — ranked by distance' : ''}</span></div>`

  if (complete.length === 0 && incomplete.length === 0) {
    html += '<div class="dp-empty">No profiles match your filters.</div>'
  } else {
    complete.forEach((p, i) => { html += profileCard(p, i + 1) })

    if (incomplete.length > 0) {
      html += `<div class="section-divider">Incomplete — missing CMYK (${incomplete.length})</div>`
      incomplete.forEach(p => { html += incompleteCard(p) })
    }
  }

  html += addCard()
  results.innerHTML = html
}

// ── Printer dropdown ─────────────────────────────────────────────────────────

function populatePrinterDropdown(profiles) {
  const sel = document.getElementById('filterPrinter')
  const current = sel.value
  const printers = [...new Set(profiles.map(p => p.printer))].sort()

  sel.innerHTML = '<option value="">All Printers</option>' +
    printers.map(pr => `<option value="${esc(pr)}"${pr === current ? ' selected' : ''}>${esc(pr)}</option>`).join('')
}

// ── Form value helpers ───────────────────────────────────────────────────────

function readForm(id) {
  const v = key => document.getElementById(`ef-${key}-${id}`)?.value ?? ''
  const num = key => { const n = parseFloat(v(key)); return isNaN(n) ? null : n }
  return {
    printer:      v('printer').trim(),
    profile_name: v('name').trim(),
    print_type:   v('type') || null,
    status:       v('status') || 'ok',
    cyan:         num('c'),
    magenta:      num('m'),
    yellow:       num('y'),
    black:        num('k'),
    comments:     v('comments').trim() || null
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

async function saveProfile(id) {
  const data = readForm(id)
  if (!data.printer)      { toast.error('Printer is required'); return }
  if (!data.profile_name) { toast.error('Profile name is required'); return }

  try {
    const updated = await apiFetch(`/${id}`, { method: 'PUT', body: data })
    const idx = allProfiles.findIndex(p => p.id === id)
    if (idx !== -1) allProfiles[idx] = updated
    expandedId = null
    render()
    toast.success('Profile saved')
  } catch (e) {
    toast.error(e.message)
  }
}

async function createProfile() {
  const data = readForm('new')
  if (!data.printer)      { toast.error('Printer is required'); return }
  if (!data.profile_name) { toast.error('Profile name is required'); return }

  try {
    const created = await apiFetch('', { method: 'POST', body: data })
    allProfiles.push(created)
    populatePrinterDropdown(allProfiles)
    expandedId = null
    render()
    toast.success('Profile added')
  } catch (e) {
    toast.error(e.message)
  }
}

async function deleteProfile(id) {
  if (!confirm('Delete this profile?')) return
  try {
    await apiFetch(`/${id}`, { method: 'DELETE' })
    allProfiles = allProfiles.filter(p => p.id !== id)
    expandedId = null
    render()
    toast.success('Profile deleted')
  } catch (e) {
    toast.error(e.message)
  }
}

// ── Event delegation ─────────────────────────────────────────────────────────

function onResultsClick(e) {
  const toggle = e.target.closest('[data-toggle]')
  if (toggle) {
    const id = toggle.dataset.toggle
    const rawId = id === 'new' ? 'new' : parseInt(id, 10)
    expandedId = expandedId === rawId ? null : rawId
    render()
    return
  }

  const btn = e.target.closest('[data-action]')
  if (!btn) return

  const action = btn.dataset.action
  const id = btn.dataset.id === 'new' ? 'new' : parseInt(btn.dataset.id, 10)

  if (action === 'save')   saveProfile(id)
  if (action === 'create') createProfile()
  if (action === 'delete') deleteProfile(id)
  if (action === 'cancel') { expandedId = null; render() }
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  currentUser = await requireAuth()
  if (!currentUser) return

  try {
    allProfiles = await apiFetch('')
    populatePrinterDropdown(allProfiles)
    render()
  } catch (e) {
    document.getElementById('results').innerHTML =
      `<div class="dp-empty">Failed to load profiles: ${esc(e.message)}</div>`
    return
  }

  // Filter / input listeners
  ;['inputC','inputM','inputY','inputK','filterText','filterPrinter','filterType']
    .forEach(id => document.getElementById(id)?.addEventListener('input', render))

  document.getElementById('btnClear')?.addEventListener('click', () => {
    ;['inputC','inputM','inputY','inputK'].forEach(id => { document.getElementById(id).value = '' })
    document.getElementById('filterText').value = ''
    document.getElementById('filterPrinter').value = ''
    document.getElementById('filterType').value = ''
    expandedId = null
    render()
  })

  document.getElementById('results').addEventListener('click', onResultsClick)
}

init()
