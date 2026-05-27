/**
 * Ink Density Tool
 * Port of xrite-export web UI into brandpack-tools.
 * Jobs persisted to SQLite; HTML reports generated server-side.
 *
 * Grid tab order is column-major (all C → M → Y → K) to match
 * X-Rite eXact scan sequence. Do not change to row-major.
 */

import { requireAuth, isAdmin } from '../../shared/utils/auth.js'
import toast from '../../shared/components/Toast.js'
import '../../shared/components/AppHeader.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_STEP_LABELS = ['100','95','90','80','70','60','50','40','30','20','10','5','3','1']
const DEFAULT_INKS = [
  { kind: 'cyan',    name: 'C' },
  { kind: 'magenta', name: 'M' },
  { kind: 'yellow',  name: 'Y' },
  { kind: 'black',   name: 'K' }
]
const CMYK_KINDS = new Set(['cyan','magenta','yellow','black'])

const DOT_GAIN_TARGETS = [
  [0.4,1],[0.8,2],[1,3],[3,9],[5,13],[10,22],[20,37],[30,51],
  [40,62],[50,72],[60,81],[70,88],[80,93],[90,97],[95,99],[100,100]
]

// ── State ─────────────────────────────────────────────────────────────────────

let jobs         = []
let currentJob   = null
let activeShape  = 0
let activeWeight = 0
let currentUser  = null
let saveTimer    = null

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const res = await fetch(`/api/v1/ink-density${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  if (options.raw) return res
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`)
  return data.data
}

// ── Dot-gain interpolation ────────────────────────────────────────────────────

function interpolateTarget(step) {
  const s = parseFloat(step)
  if (isNaN(s)) return null
  if (s < DOT_GAIN_TARGETS[0][0] || s > DOT_GAIN_TARGETS.at(-1)[0]) return null
  for (const [s0, t0] of DOT_GAIN_TARGETS) {
    if (Math.abs(s0 - s) < 1e-10) return t0
  }
  for (let i = 0; i < DOT_GAIN_TARGETS.length - 1; i++) {
    const [s0,t0] = DOT_GAIN_TARGETS[i], [s1,t1] = DOT_GAIN_TARGETS[i+1]
    if (s >= s0 && s <= s1) return t0 + (s - s0) / (s1 - s0) * (t1 - t0)
  }
  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function inkChipClass(kind) {
  return { cyan:'cmyk-c', magenta:'cmyk-m', yellow:'cmyk-y', black:'cmyk-k', white:'cmyk-w' }[kind] || 'cmyk-spot'
}

function inkThClass(kind) {
  return { cyan:'ink-c', magenta:'ink-m', yellow:'ink-y', black:'ink-k', white:'ink-w' }[kind] || 'ink-spot'
}

function deviationIndices(inks) {
  return inks.reduce((acc, ink, i) => { if (CMYK_KINDS.has(ink.kind)) acc.push(i); return acc }, [])
}

function jobLabel(job) {
  const parts = [job.job_number, job.customer, job.job_name].filter(Boolean)
  return parts.length ? parts.join(' · ') : `Job #${job.id}`
}

function jobMeta(job) {
  const parts = [job.plate_tech, job.press_system, job.print_type, job.date].filter(Boolean)
  return parts.join(' · ')
}

// ── Pad/ensure arrays have correct length ─────────────────────────────────────

function ensureWeight(weight, numInks, numSteps) {
  if (!weight.density) weight.density = []
  if (!weight.steps)   weight.steps   = []
  while (weight.density.length < numInks)  weight.density.push(0)
  while (weight.steps.length   < numSteps) weight.steps.push([])
  weight.steps.forEach(row => {
    if (!Array.isArray(row)) return
    while (row.length < numInks) row.push(0)
  })
  return weight
}

// ── Job sidebar ───────────────────────────────────────────────────────────────

function renderJobList() {
  const list = document.getElementById('jobList')
  if (!jobs.length) {
    list.innerHTML = '<div style="padding:12px 8px;color:var(--color-text-muted);font-size:var(--text-sm)">No jobs yet</div>'
    return
  }
  list.innerHTML = jobs.map(j => `
    <div class="job-item${currentJob?.id === j.id ? ' active' : ''}" data-job-id="${j.id}">
      <div class="job-item-name">${esc(jobLabel(j))}</div>
      <div class="job-item-meta">${esc(jobMeta(j)) || '—'}</div>
    </div>`).join('')
}

// ── Editor shell ──────────────────────────────────────────────────────────────

function renderEditorShell() {
  const main = document.getElementById('mainArea')
  const job  = currentJob

  main.innerHTML = `
    <!-- Toolbar -->
    <div class="id-toolbar">
      <span class="job-title-display" id="jobTitleDisplay">${esc(jobLabel(job))}</span>
      <button class="btn btn-ghost btn-sm" id="btnReport" title="Open HTML report in new tab">Report</button>
      ${isAdmin(currentUser) ? `<button class="btn btn-ghost btn-sm btn-danger-ghost" id="btnDeleteJob">Delete</button>` : ''}
      <button class="btn btn-primary btn-sm" id="btnSaveNow">Save</button>
    </div>
    <!-- Two-panel editor -->
    <div class="id-editor">
      <!-- Left: metadata + inks -->
      <div class="id-meta-panel" id="metaPanel"></div>
      <!-- Right: shapes + grid -->
      <div class="id-grid-panel" id="gridPanel"></div>
    </div>`

  renderMetaPanel()
  renderGridPanel()
  bindToolbarActions()
}

// ── Meta panel ────────────────────────────────────────────────────────────────

function renderMetaPanel() {
  const panel = document.getElementById('metaPanel')
  const j     = currentJob

  const field = (id, label, val, placeholder = '') =>
    `<div class="meta-field">
      <label>${label}</label>
      <input type="text" id="mf-${id}" value="${esc(val)}" placeholder="${esc(placeholder)}" data-meta="${id}">
    </div>`

  const devIndices  = deviationIndices(j.inks)
  const cmykPresent = new Set(j.inks.map(i => i.kind))

  panel.innerHTML = `
    <span class="meta-section-title">Job Info</span>
    ${field('job_number', 'Job Number', j.job_number, '12345')}
    ${field('job_name',   'Job Name',   j.job_name,   'Print run description')}
    ${field('customer',   'Customer',   j.customer,   'Customer name')}
    ${field('date',       'Date',       j.date,       new Date().toLocaleDateString('en-AU', {day:'2-digit',month:'2-digit',year:'numeric'}))}
    ${field('set_number', 'Set',        j.set_number, '1')}

    <span class="meta-section-title" style="margin-top:var(--spacing-sm)">Press Spec</span>
    <div class="meta-field">
      <label>Print Type</label>
      <select id="mf-print_type" data-meta="print_type">
        <option value="">—</option>
        <option value="RP"     ${j.print_type === 'RP'     ? 'selected' : ''}>RP</option>
        <option value="SP"     ${j.print_type === 'SP'     ? 'selected' : ''}>SP</option>
        <option value="CBW SP" ${j.print_type === 'CBW SP' ? 'selected' : ''}>CBW SP</option>
      </select>
    </div>
    <div class="meta-grid-2">
      ${field('plate_tech',   'Plate Tech',  j.plate_tech,   'CRS')}
      ${field('press_system', 'Press System',j.press_system, 'XPS')}
    </div>
    ${field('esxr_number', 'ESXR / Spec', j.esxr_number, '3245')}
    ${field('preset_name', 'Preset',      j.preset_name, '')}

    <span class="meta-section-title" style="margin-top:var(--spacing-sm)">
      Inks
      <button class="btn btn-ghost btn-sm" id="btnAddInk" style="margin-left:auto;float:right">+</button>
    </span>
    <div class="ink-chips" id="inkChips">${renderInkChips()}</div>

    <span class="meta-section-title" style="margin-top:var(--spacing-sm)">Steps</span>
    <div style="font-size:var(--text-xs);color:var(--color-text-muted);font-family:var(--font-mono)">
      ${j.step_labels.join(', ')}
    </div>
    <div style="display:flex;gap:var(--spacing-sm);flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" id="btnSteps14" ${j.step_labels.length===14?'disabled':''}>14-step</button>
      <button class="btn btn-ghost btn-sm" id="btnSteps16" ${j.step_labels.length===16?'disabled':''}>16-step</button>
    </div>`

  // Bind meta inputs
  panel.querySelectorAll('[data-meta]').forEach(el => {
    el.addEventListener('change', () => {
      currentJob[el.dataset.meta] = el.value
      scheduleSave()
      document.getElementById('jobTitleDisplay').textContent = jobLabel(currentJob)
    })
  })

  document.getElementById('btnAddInk')?.addEventListener('click', openAddInkModal)

  document.getElementById('btnSteps14')?.addEventListener('click', () => {
    currentJob.step_labels = ['100','95','90','80','70','60','50','40','30','20','10','5','3','1']
    renderMetaPanel()
    renderGridPanel()
    scheduleSave()
  })
  document.getElementById('btnSteps16')?.addEventListener('click', () => {
    currentJob.step_labels = ['100','95','90','80','70','60','50','40','30','20','10','5','3','1','0.8','0.4']
    renderMetaPanel()
    renderGridPanel()
    scheduleSave()
  })
}

function renderInkChips() {
  return currentJob.inks.map((ink, i) => `
    <span class="ink-chip ${inkChipClass(ink.kind)}" data-ink-idx="${i}" title="Click to remove">
      ${esc(ink.name)}
      <span class="ink-chip-remove" data-remove-ink="${i}">×</span>
    </span>`).join('')
}

// ── Grid panel ────────────────────────────────────────────────────────────────

function renderGridPanel() {
  const panel = document.getElementById('gridPanel')
  const job   = currentJob

  if (!job.shapes.length) {
    panel.innerHTML = `
      <div class="shape-tabs" id="shapeTabs">
        <span class="shape-tab-add" id="btnAddShape">＋ Add Shape</span>
      </div>
      <div class="id-empty" style="flex:1;display:flex">
        <p>No shapes — add a dot shape to start recording</p>
      </div>`
    document.getElementById('btnAddShape')?.addEventListener('click', openAddShapeModal)
    return
  }

  const shape  = job.shapes[activeShape] || job.shapes[0]
  const weight = shape?.weights?.[activeWeight]

  // Shape tab bar
  const shapeTabs = job.shapes.map((s, i) => {
    const name = s.dot_number ? `${s.dot_type} ${s.dot_number}` : s.dot_type
    return `<span class="shape-tab${i === activeShape ? ' active' : ''}" data-shape-idx="${i}">${esc(name)}</span>`
  }).join('')

  // Weight (LPI) tab bar
  const weightTabs = !shape?.weights?.length ? '' :
    shape.weights.map((w, i) =>
      `<span class="weight-tab${i === activeWeight ? ' active' : ''}" data-weight-idx="${i}">${esc(w.lpi || `LPI ${i+1}`)}</span>`
    ).join('')

  panel.innerHTML = `
    <div class="shape-tabs" id="shapeTabs">
      ${shapeTabs}
      <span class="shape-tab-add" id="btnAddShape" title="Add shape">＋</span>
      ${job.shapes.length > 0 ? `<span class="shape-tab-add" id="btnRemoveShape" title="Remove active shape" style="color:var(--color-error)">−</span>` : ''}
    </div>
    <div class="weight-tabs" id="weightTabs">
      ${weightTabs}
      <span class="weight-tab-add" id="btnAddWeight" title="Add LPI">＋</span>
      ${shape?.weights?.length > 0 ? `<span class="weight-tab-add" id="btnRemoveWeight" title="Remove active LPI" style="color:var(--color-error)">−</span>` : ''}
    </div>
    <div class="grid-area" id="gridArea">
      ${weight ? buildGrid(job, shape, weight) : '<div style="padding:16px;color:var(--color-text-muted);font-size:var(--text-sm)">Add an LPI to start entering data</div>'}
    </div>`

  bindGridPanel()
}

// ── Data grid ─────────────────────────────────────────────────────────────────

function buildGrid(job, shape, weight) {
  const inks      = job.inks
  const numInks   = inks.length
  const devIdx    = deviationIndices(inks)
  const showDev   = devIdx.length > 0
  const numRows   = 1 + job.step_labels.length  // density + steps

  ensureWeight(weight, numInks, job.step_labels.length)

  // Column-major tabindex: col 0 = tabindex 1..numRows, col 1 = numRows+1..2*numRows, etc.
  const tabIdx = (col, row) => col * numRows + row + 1

  let h = '<table class="density-grid"><thead><tr>'
  h += '<th class="row-header">Step</th>'
  inks.forEach(ink => { h += `<th class="${inkThClass(ink.kind)}">${esc(ink.name)}</th>` })
  if (showDev) {
    h += '<th class="col-avg">Avg</th>'
    h += '<th class="col-dev">Dev</th>'
  }
  h += '<th class="col-target">Target</th>'
  h += '</tr></thead><tbody>'

  // Density row (row index 0)
  h += '<tr class="density-row">'
  h += '<td class="row-label">D</td>'
  inks.forEach((_, ci) => {
    const v = weight.density[ci] ?? 0
    const ti = tabIdx(ci, 0)
    h += `<td><input class="cell-input${v ? ' has-value' : ''}" type="number" min="0" max="4" step="0.01"
      value="${v || ''}" placeholder="0.00" tabindex="${ti}"
      data-type="density" data-col="${ci}"></td>`
  })
  if (showDev) { h += '<td class="calc-cell col-avg"></td><td class="calc-cell"></td>' }
  h += '<td class="calc-cell col-target"></td>'
  h += '</tr>'

  // Step rows
  job.step_labels.forEach((label, si) => {
    const isHundred = label === '100'
    h += '<tr>'
    h += `<td class="row-label">${esc(label)}%</td>`

    inks.forEach((_, ci) => {
      const v = isHundred ? 100 : (weight.steps[si]?.[ci] ?? 0)
      const ti = tabIdx(ci, si + 1)
      if (isHundred) {
        h += `<td><input class="cell-input has-value" type="number" value="100" readonly tabindex="-1"
          data-type="step" data-row="${si}" data-col="${ci}"></td>`
      } else {
        h += `<td><input class="cell-input${v ? ' has-value' : ''}" type="number" min="0" max="100" step="0.1"
          value="${v || ''}" placeholder="0.0" tabindex="${ti}"
          data-type="step" data-row="${si}" data-col="${ci}"></td>`
      }
    })

    if (showDev) {
      // Calculate avg and dev for this row
      const rowVals = isHundred
        ? new Array(numInks).fill(100)
        : inks.map((_, ci) => weight.steps[si]?.[ci] ?? 0)

      const sum = devIdx.reduce((a, i) => a + (rowVals[i] ?? 0), 0)
      const avg = sum / devIdx.length
      const target = interpolateTarget(label)
      const dev = target !== null ? avg - target : null

      const devCls = dev === null ? '' : Math.abs(dev) <= 1 ? 'col-dev-good' : Math.abs(dev) <= 3 ? 'col-dev-ok' : 'col-dev-bad'
      const devStr = dev === null ? '' : Math.abs(dev) < 0.05 ? '0' : (dev >= 0 ? '+' : '') + dev.toFixed(1)

      h += `<td class="calc-cell col-avg">${avg > 0 ? avg.toFixed(1) : ''}</td>`
      h += `<td class="calc-cell ${devCls}">${devStr}</td>`
    }

    const target = interpolateTarget(label)
    h += `<td class="calc-cell col-target">${target !== null ? target.toFixed(1) : ''}</td>`
    h += '</tr>'
  })

  h += '</tbody></table>'
  return h
}

// Recalculate avg/dev columns without full re-render
function recalcRow(si, label) {
  const job    = currentJob
  const shape  = job.shapes[activeShape]
  const weight = shape?.weights?.[activeWeight]
  if (!weight) return

  const inks    = job.inks
  const devIdx  = deviationIndices(inks)
  if (!devIdx.length) return

  const isHundred = label === '100'
  const rowVals = isHundred
    ? new Array(inks.length).fill(100)
    : inks.map((_, ci) => weight.steps[si]?.[ci] ?? 0)

  const sum = devIdx.reduce((a, i) => a + (rowVals[i] ?? 0), 0)
  const avg = sum / devIdx.length
  const target = interpolateTarget(label)
  const dev = target !== null ? avg - target : null
  const devCls = dev === null ? '' : Math.abs(dev) <= 1 ? 'col-dev-good' : Math.abs(dev) <= 3 ? 'col-dev-ok' : 'col-dev-bad'
  const devStr = dev === null ? '' : Math.abs(dev) < 0.05 ? '0' : (dev >= 0 ? '+' : '') + dev.toFixed(1)

  // Find the row (si+1 because density is row 0 → tbody row 0, step 0 → row 1...)
  const tbody = document.querySelector('.density-grid tbody')
  if (!tbody) return
  const tr = tbody.rows[si + 1]  // +1 for density row
  if (!tr) return

  const cells = tr.querySelectorAll('.calc-cell')
  if (cells.length >= 2) {
    cells[0].textContent = avg > 0 ? avg.toFixed(1) : ''
    cells[0].className = 'calc-cell col-avg'
    cells[1].textContent = devStr
    cells[1].className = `calc-cell ${devCls}`
  }
}

// ── Grid event binding ────────────────────────────────────────────────────────

function bindGridPanel() {
  document.getElementById('btnAddShape')?.addEventListener('click',  openAddShapeModal)
  document.getElementById('btnRemoveShape')?.addEventListener('click', removeActiveShape)
  document.getElementById('btnAddWeight')?.addEventListener('click',  openAddWeightModal)
  document.getElementById('btnRemoveWeight')?.addEventListener('click', removeActiveWeight)

  document.getElementById('shapeTabs')?.addEventListener('click', e => {
    const tab = e.target.closest('[data-shape-idx]')
    if (!tab) return
    activeShape  = parseInt(tab.dataset.shapeIdx, 10)
    activeWeight = 0
    renderGridPanel()
  })

  document.getElementById('weightTabs')?.addEventListener('click', e => {
    const tab = e.target.closest('[data-weight-idx]')
    if (!tab) return
    activeWeight = parseInt(tab.dataset.weightIdx, 10)
    renderGridPanel()
  })

  // Grid cell input
  document.getElementById('gridArea')?.addEventListener('input', e => {
    const input = e.target
    if (!input.matches('.cell-input')) return
    if (input.readOnly) return

    const job    = currentJob
    const shape  = job.shapes[activeShape]
    const weight = shape?.weights?.[activeWeight]
    if (!weight) return

    const v   = parseFloat(input.value) || 0
    const col = parseInt(input.dataset.col, 10)
    const row = parseInt(input.dataset.row, 10)

    input.classList.toggle('has-value', !!input.value)

    if (input.dataset.type === 'density') {
      weight.density[col] = v
    } else {
      if (!weight.steps[row]) weight.steps[row] = []
      weight.steps[row][col] = v
      // Recalculate avg/dev for this step row
      const label = job.step_labels[row]
      recalcRow(row, label)
    }

    scheduleSave()
  })
}

// ── Toolbar actions ───────────────────────────────────────────────────────────

function bindToolbarActions() {
  document.getElementById('btnReport')?.addEventListener('click', () => {
    window.open(`/api/v1/ink-density/${currentJob.id}/report`, '_blank')
  })

  document.getElementById('btnSaveNow')?.addEventListener('click', () => {
    clearTimeout(saveTimer)
    saveJob()
  })

  document.getElementById('btnDeleteJob')?.addEventListener('click', async () => {
    if (!confirm(`Delete "${jobLabel(currentJob)}"? This cannot be undone.`)) return
    try {
      await apiFetch(`/${currentJob.id}`, { method: 'DELETE' })
      jobs = jobs.filter(j => j.id !== currentJob.id)
      currentJob = null
      activeShape = 0; activeWeight = 0
      renderJobList()
      document.getElementById('mainArea').innerHTML = `
        <div class="id-empty" id="emptyState">
          <p>Select a job or create a new one</p>
          <button class="btn btn-primary" id="btnNewJobEmpty">+ New Job</button>
        </div>`
      document.getElementById('btnNewJobEmpty')?.addEventListener('click', createNewJob)
      toast.success('Job deleted')
    } catch (e) {
      toast.error(e.message)
    }
  })
}

// ── Shape / weight management ─────────────────────────────────────────────────

function openAddShapeModal() {
  document.getElementById('modalDotType').value   = ''
  document.getElementById('modalDotNumber').value = ''
  document.getElementById('modalAddShape').removeAttribute('hidden')
  document.getElementById('modalDotType').focus()
}

function openAddWeightModal() {
  document.getElementById('modalLpi').value = ''
  document.getElementById('modalAddWeight').removeAttribute('hidden')
  document.getElementById('modalLpi').focus()
}

function openAddInkModal() {
  document.getElementById('modalInkKind').value = 'spot'
  document.getElementById('modalInkName').value = ''
  document.getElementById('modalAddInk').removeAttribute('hidden')
  document.getElementById('modalInkName').focus()
}

function newWeight(numInks, numSteps) {
  return {
    lpi:     '',
    density: new Array(numInks).fill(0),
    steps:   Array.from({ length: numSteps }, () => new Array(numInks).fill(0))
  }
}

function removeActiveShape() {
  if (!currentJob.shapes.length) return
  const name = currentJob.shapes[activeShape]
  const label = name.dot_number ? `${name.dot_type} ${name.dot_number}` : name.dot_type
  if (!confirm(`Remove shape "${label}"?`)) return
  currentJob.shapes.splice(activeShape, 1)
  activeShape = Math.max(0, activeShape - 1)
  activeWeight = 0
  renderGridPanel()
  scheduleSave()
}

function removeActiveWeight() {
  const shape = currentJob.shapes[activeShape]
  if (!shape?.weights?.length) return
  const lbl = shape.weights[activeWeight]?.lpi || `LPI ${activeWeight+1}`
  if (!confirm(`Remove "${lbl}"?`)) return
  shape.weights.splice(activeWeight, 1)
  activeWeight = Math.max(0, activeWeight - 1)
  renderGridPanel()
  scheduleSave()
}

// ── Save ──────────────────────────────────────────────────────────────────────

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveJob, 1200)
}

async function saveJob() {
  if (!currentJob?.id) return
  try {
    const updated = await apiFetch(`/${currentJob.id}`, { method: 'PUT', body: currentJob })
    // Update job list entry
    const idx = jobs.findIndex(j => j.id === updated.id)
    if (idx !== -1) {
      jobs[idx] = { ...jobs[idx], ...updated }
      renderJobList()
    }
    document.getElementById('jobTitleDisplay').textContent = jobLabel(currentJob)
  } catch (e) {
    toast.error(`Save failed: ${e.message}`)
  }
}

// ── Create job ────────────────────────────────────────────────────────────────

async function createNewJob() {
  try {
    const job = await apiFetch('', {
      method: 'POST',
      body: {
        job_name:     '',
        step_labels:  DEFAULT_STEP_LABELS,
        inks:         DEFAULT_INKS,
        shapes:       []
      }
    })
    jobs.unshift(job)
    await loadJob(job.id)
    renderJobList()
    toast.success('New job created')
  } catch (e) {
    toast.error(e.message)
  }
}

// ── Load job ──────────────────────────────────────────────────────────────────

async function loadJob(id) {
  try {
    currentJob   = await apiFetch(`/${id}`)
    activeShape  = 0
    activeWeight = 0
    renderJobList()
    renderEditorShell()
    document.getElementById('emptyState')?.remove()
  } catch (e) {
    toast.error(`Failed to load job: ${e.message}`)
  }
}

// ── Modal bindings ────────────────────────────────────────────────────────────

function bindModals() {
  // Add shape
  document.getElementById('btnModalShapeCancel')?.addEventListener('click', () => {
    document.getElementById('modalAddShape').setAttribute('hidden', '')
  })
  document.getElementById('btnModalShapeAdd')?.addEventListener('click', () => {
    const dot_type   = document.getElementById('modalDotType').value.trim()
    const dot_number = document.getElementById('modalDotNumber').value.trim()
    if (!dot_type) { toast.error('Dot type required'); return }

    const numInks  = currentJob.inks.length
    const numSteps = currentJob.step_labels.length
    currentJob.shapes.push({
      dot_type, dot_number,
      weights: [{ ...newWeight(numInks, numSteps), lpi: '' }]
    })
    activeShape  = currentJob.shapes.length - 1
    activeWeight = 0
    document.getElementById('modalAddShape').setAttribute('hidden', '')
    renderGridPanel()
    scheduleSave()
  })

  // Add weight
  document.getElementById('btnModalWeightCancel')?.addEventListener('click', () => {
    document.getElementById('modalAddWeight').setAttribute('hidden', '')
  })
  document.getElementById('btnModalWeightAdd')?.addEventListener('click', () => {
    const lpi = document.getElementById('modalLpi').value.trim()
    if (!lpi) { toast.error('LPI label required'); return }

    const shape    = currentJob.shapes[activeShape]
    const numInks  = currentJob.inks.length
    const numSteps = currentJob.step_labels.length
    shape.weights.push({ ...newWeight(numInks, numSteps), lpi })
    activeWeight = shape.weights.length - 1
    document.getElementById('modalAddWeight').setAttribute('hidden', '')
    renderGridPanel()
    scheduleSave()
  })

  // Add ink
  document.getElementById('btnModalInkCancel')?.addEventListener('click', () => {
    document.getElementById('modalAddInk').setAttribute('hidden', '')
  })
  document.getElementById('btnModalInkAdd')?.addEventListener('click', () => {
    const kind = document.getElementById('modalInkKind').value
    const name = document.getElementById('modalInkName').value.trim()
    if (!name) { toast.error('Ink name required'); return }

    currentJob.inks.push({ kind, name })
    // Pad all existing weights
    currentJob.shapes.forEach(s => s.weights.forEach(w => {
      ensureWeight(w, currentJob.inks.length, currentJob.step_labels.length)
    }))
    document.getElementById('modalAddInk').setAttribute('hidden', '')
    document.getElementById('inkChips').innerHTML = renderInkChips()
    renderGridPanel()
    scheduleSave()
  })

  // Remove ink via chip
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-ink]')
    if (!btn) return
    const idx = parseInt(btn.dataset.removeInk, 10)
    if (currentJob.inks.length <= 1) { toast.error('Must keep at least one ink'); return }
    currentJob.inks.splice(idx, 1)
    // Trim all weight arrays
    currentJob.shapes.forEach(s => s.weights.forEach(w => {
      w.density.splice(idx, 1)
      w.steps.forEach(row => row.splice(idx, 1))
    }))
    document.getElementById('inkChips').innerHTML = renderInkChips()
    renderGridPanel()
    scheduleSave()
  })

  // Close modals on overlay click
  document.querySelectorAll('.id-modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.setAttribute('hidden', '')
    })
  })

  // LPI modal enter key
  document.getElementById('modalLpi')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnModalWeightAdd').click()
  })
  document.getElementById('modalDotNumber')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnModalShapeAdd').click()
  })
  document.getElementById('modalInkName')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnModalInkAdd').click()
  })
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  currentUser = await requireAuth()
  if (!currentUser) return

  try {
    jobs = await apiFetch('')
  } catch (e) {
    toast.error(`Failed to load jobs: ${e.message}`)
    jobs = []
  }

  renderJobList()

  // Bind sidebar clicks
  document.getElementById('jobList').addEventListener('click', e => {
    const item = e.target.closest('[data-job-id]')
    if (!item) return
    loadJob(parseInt(item.dataset.jobId, 10))
  })

  document.getElementById('btnNewJob')?.addEventListener('click', createNewJob)
  document.getElementById('btnNewJobEmpty')?.addEventListener('click', createNewJob)

  bindModals()

  // Load most-recent job automatically if any
  if (jobs.length) loadJob(jobs[0].id)
}

init()
