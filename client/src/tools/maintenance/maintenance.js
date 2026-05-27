/**
 * Maintenance Tracker Application v3.2.0
 * Handles service visits and maintenance issues
 * API-based persistence (no localStorage)
 */

import { maintenance, dashboard } from '../../api/client.js'
import { requireAuth } from '../../shared/utils/auth.js'
import '../../shared/components/AppHeader.js'
import '../../shared/components/AppFooter.js'
import '../../shared/utils/cyberpunk-effects.js'

// ============================================================================
// CONSTANTS
// ============================================================================

const MACHINES = [
    'Epson 9900',
    'Epson WT7900',
    'Roland VS300',
    'Laminator'
]

const ISSUE_TYPES = {
    'Print Quality': [
        { value: 'nozzle-clog', label: 'Nozzle clog/dropout', colors: true },
        { value: 'banding', label: 'Banding', colors: true },
        { value: 'color-inconsistency', label: 'Color inconsistency', colors: true },
        { value: 'registration', label: 'Registration issues', colors: false }
    ],
    'Mechanical': [
        { value: 'paper-jam', label: 'Paper jam', colors: false },
        { value: 'media-feed', label: 'Media feed issues', colors: false },
        { value: 'cutting', label: 'Cutting issues', colors: false }
    ],
    'Ink': [
        { value: 'cartridge-error', label: 'Cartridge error', colors: true },
        { value: 'ink-level', label: 'Ink level sensor', colors: false }
    ],
    'Cleaning-based': [
        { value: 'head-cleaning', label: 'Print head cleaning required', colors: false },
        { value: 'wiper-blade', label: 'Wiper blade cleaning/replacement', colors: false },
        { value: 'capping-station', label: 'Capping station maintenance', colors: false },
        { value: 'waste-tank', label: 'Waste tank full/cleaning', colors: false },
        { value: 'general-cleaning', label: 'General machine cleaning', colors: false }
    ],
    'Part failures/faults': [
        { value: 'print-head-failure', label: 'Print head failure', colors: true },
        { value: 'motor-failure', label: 'Motor/belt failure', colors: false },
        { value: 'sensor-failure', label: 'Sensor malfunction', colors: false },
        { value: 'electronic-failure', label: 'Electronic component failure', colors: false },
        { value: 'pump-failure', label: 'Pump failure', colors: false }
    ],
    'Consumables/supplies': [
        { value: 'ink-low', label: 'Ink cartridge low/empty', colors: true },
        { value: 'maintenance-tank', label: 'Maintenance tank needs replacement', colors: false },
        { value: 'media-out', label: 'Media/substrate out of stock', colors: false },
        { value: 'blade-replacement', label: 'Blade/cutter needs replacement', colors: false }
    ],
    'Calibration/alignment': [
        { value: 'color-calibration', label: 'Color calibration needed', colors: true },
        { value: 'head-alignment', label: 'Print head alignment', colors: false },
        { value: 'media-calibration', label: 'Media thickness calibration', colors: false },
        { value: 'bi-directional', label: 'Bi-directional adjustment', colors: false }
    ],
    'Other': [
        { value: 'software', label: 'Software/RIP issues', colors: false },
        { value: 'network', label: 'Network connection', colors: false },
        { value: 'general', label: 'General maintenance', colors: false }
    ]
}

const VISIT_TYPES = {
    scheduled: { label: 'Scheduled', color: '#3b82f6' },
    emergency: { label: 'Emergency', color: '#ef4444' },
    warranty: { label: 'Warranty', color: '#10b981' },
    installation: { label: 'Installation', color: '#f59e0b' }
}

const SEVERITY_COLORS = {
    low: '#10b981',
    medium: '#f59e0b',
    high: '#ef4444',
    critical: '#dc2626'
}

// ============================================================================
// STATE
// ============================================================================

const state = {
    currentTab: 'issues',
    issues: [],
    visits: [],
    logs: [],
    editingIssue: null,
    editingVisit: null,
    editingLog: null,
    filters: {
        issues: { machine: '', status: '' },
        visits: { machine: '', visitType: '' },
        logs: {}
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
    await requireAuth()

    // Load data
    await Promise.all([
        loadIssues(),
        loadVisits(),
        loadLogs()
    ])

    // Populate dropdowns
    populateMachineFilters()

    // Render initial view
    renderIssuesTab()
    renderVisitsTab()
    renderMaintenanceTab()

    console.log('Maintenance tracker initialized')
}

// ============================================================================
// TAB NAVIGATION
// ============================================================================

function switchTab(tabName) {
    state.currentTab = tabName

    // Update tab buttons
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.remove('active')
    })
    event.target.classList.add('active')

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active')
    })
    document.getElementById(`tab-${tabName}`).classList.add('active')
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadIssues() {
    try {
        const response = await maintenance.getIssues()
        state.issues = response.data || response
        console.log(`Loaded ${state.issues.length} issues`)
    } catch (error) {
        console.error('Error loading issues:', error)
        alert('Failed to load issues: ' + error.message)
    }
}

async function loadVisits() {
    try {
        const response = await maintenance.getVisits()
        state.visits = response.data || response
        console.log(`Loaded ${state.visits.length} service visits`)
    } catch (error) {
        console.error('Error loading visits:', error)
        alert('Failed to load service visits: ' + error.message)
    }
}

// ============================================================================
// ISSUES TAB
// ============================================================================

function renderIssuesTab() {
    const filtered = filterIssuesData()
    const issuesListEl = document.getElementById('issuesList')

    if (filtered.length === 0) {
        issuesListEl.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: var(--spacing-xl);">No issues found</p>'
    } else {
        issuesListEl.innerHTML = filtered.map(issue => renderIssueCard(issue)).join('')
    }
}

function filterIssuesData() {
    const { machine, status } = state.filters.issues

    return state.issues.filter(issue => {
        if (machine && machine !== 'all' && issue.machine !== machine) return false
        if (status && status !== 'all' && issue.status !== status) return false
        return true
    })
}

function renderIssueCard(issue) {
    const severityColor = SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.medium

    // Find issue type label
    let issueTypeLabel = issue.issue_subtype
    for (const category in ISSUE_TYPES) {
        const found = ISSUE_TYPES[category].find(t => t.value === issue.issue_subtype)
        if (found) {
            issueTypeLabel = found.label
            break
        }
    }

    const createdDate = new Date(issue.created_at).toLocaleDateString()
    const resolvedDate = issue.resolved_at ? new Date(issue.resolved_at).toLocaleDateString() : null

    // Cross-reference linked visits (no extra API call)
    const linkedVisits = state.visits.filter(v => v.linked_issue_id === issue.id)

    return `
        <div class="issue-card" style="border-left-color: ${severityColor};">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--spacing-sm);">
                <div>
                    <h3 style="margin: 0 0 var(--spacing-xs) 0;">${issue.machine}</h3>
                    <div style="color: var(--color-text-muted); font-size: var(--text-sm);">
                        ${issue.issue_type} • ${issueTypeLabel}
                    </div>
                </div>
                <div style="display: flex; gap: var(--spacing-sm); align-items: center;">
                    ${linkedVisits.length > 0 ? `<span style="font-size: var(--text-xs); color: #93c5fd; background: rgba(59,130,246,0.15); padding: 2px 8px; border-radius: var(--radius-sm);">🔧 ${linkedVisits.length} visit${linkedVisits.length > 1 ? 's' : ''}</span>` : ''}
                    <span class="badge badge-${issue.severity}">${issue.severity}</span>
                    <span class="badge badge-${issue.status.replace('_', '-')}">${issue.status.replace('_', ' ')}</span>
                </div>
            </div>

            <p style="margin: var(--spacing-sm) 0; color: var(--color-text-secondary);">
                ${issue.description}
            </p>

            ${issue.colors && issue.colors.length > 0 ? `
                <div style="margin-top: var(--spacing-sm);">
                    <strong>Affected colors:</strong> ${issue.colors.join(', ')}
                </div>
            ` : ''}

            <div style="margin-top: var(--spacing-md); padding-top: var(--spacing-md); border-top: 1px solid rgba(255,255,255,0.1); font-size: var(--text-sm); color: var(--color-text-muted);">
                Created: ${createdDate}
                ${resolvedDate ? ` • Resolved: ${resolvedDate}` : ''}
            </div>

            <div style="margin-top: var(--spacing-md); display: flex; gap: var(--spacing-sm);">
                ${issue.status !== 'resolved' && issue.status !== 'closed' ? `
                <button class="btn btn-success btn-small" onclick="window.maintenanceApp.markIssueComplete(${issue.id})">✓ Mark Complete</button>
                ` : ''}
                <button class="btn btn-secondary btn-small" onclick="window.maintenanceApp.editIssue(${issue.id})">Edit</button>
                <button class="btn btn-danger btn-small" onclick="window.maintenanceApp.deleteIssue(${issue.id})">Delete</button>
            </div>
        </div>
    `
}

function applyIssueFilters() {
    state.filters.issues.machine = document.getElementById('machineFilter').value
    state.filters.issues.status = document.getElementById('statusFilter').value
    renderIssuesTab()
}

// ============================================================================
// SERVICE VISITS TAB
// ============================================================================

function renderVisitsTab() {
    const filtered = filterVisitsData()
    const visitsListEl = document.getElementById('visitsList')

    if (filtered.length === 0) {
        visitsListEl.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; padding: var(--spacing-xl);">No service visits found</p>'
    } else {
        visitsListEl.innerHTML = filtered.map(visit => renderVisitCard(visit, false)).join('')
    }

    renderVisitStats(filtered)
}

function filterVisitsData() {
    const { machine, visitType, startDate, endDate } = state.filters.visits

    return state.visits.filter(visit => {
        if (machine && visit.machine !== machine) return false
        if (visitType && visit.visit_type !== visitType) return false
        if (startDate && visit.date < startDate) return false
        if (endDate && visit.date > endDate) return false
        return true
    })
}

function renderVisitCard(visit, compact = false) {
    const visitTypeInfo = VISIT_TYPES[visit.visit_type] || { label: visit.visit_type, color: '#6b7280' }
    const visitDate = new Date(visit.date).toLocaleDateString()
    const visitTime = visit.time ? visit.time : 'Time not specified'

    if (compact) {
        return `
            <div class="issue-card" style="border-left-color: ${visitTypeInfo.color};">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <h4 style="margin: 0 0 var(--spacing-xs) 0;">${visit.machine}</h4>
                        <div style="color: var(--color-text-muted); font-size: var(--text-sm);">
                            ${visitDate} ${visit.time ? `at ${visit.time}` : ''}
                        </div>
                    </div>
                    <span class="badge" style="background: ${visitTypeInfo.color};">${visitTypeInfo.label}</span>
                </div>
                <p style="margin-top: var(--spacing-sm); color: var(--color-text-secondary);">
                    Technician: ${visit.technician}${visit.company ? ` (${visit.company})` : ''}
                </p>
            </div>
        `
    }

    return `
        <div class="issue-card" style="border-left-color: ${visitTypeInfo.color};">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--spacing-sm);">
                <div>
                    <h3 style="margin: 0 0 var(--spacing-xs) 0;">${visit.machine}</h3>
                    <div style="color: var(--color-text-muted); font-size: var(--text-sm);">
                        ${visitDate} at ${visitTime}
                    </div>
                </div>
                <span class="badge" style="background: ${visitTypeInfo.color};">${visitTypeInfo.label}</span>
            </div>

            <div style="margin-bottom: var(--spacing-sm);">
                <strong>Technician:</strong> ${visit.technician}
                ${visit.company ? `<br><strong>Company:</strong> ${visit.company}` : ''}
            </div>

            ${visit.description ? `
                <p style="margin: var(--spacing-sm) 0; color: var(--color-text-secondary);">
                    ${visit.description}
                </p>
            ` : ''}

            ${visit.notes ? `
                <div style="margin-top: var(--spacing-sm); padding: var(--spacing-sm); background: rgba(255,255,255,0.03); border-radius: var(--radius-md);">
                    <strong>Notes:</strong><br>${visit.notes}
                </div>
            ` : ''}

            ${visit.cost ? `
                <div style="margin-top: var(--spacing-sm);">
                    <strong>Cost:</strong> $${parseFloat(visit.cost).toFixed(2)}
                </div>
            ` : ''}

            ${visit.linked_issue_id ? `
                <div style="margin-top: var(--spacing-sm); padding: var(--spacing-xs) var(--spacing-sm); background: rgba(59, 130, 246, 0.08); border-radius: var(--radius-sm); border-left: 3px solid rgba(59, 130, 246, 0.4); font-size: var(--text-sm); color: var(--color-text-secondary);">
                    🔗 Re: Issue #${visit.linked_issue_id}${visit.linked_issue_machine ? ` — ${visit.linked_issue_machine}: ${(visit.linked_issue_description || '').substring(0, 60)}${(visit.linked_issue_description || '').length > 60 ? '...' : ''}` : ''}
                </div>
            ` : ''}

            <div style="margin-top: var(--spacing-md); display: flex; gap: var(--spacing-sm);">
                <button class="btn btn-secondary btn-small" onclick="window.maintenanceApp.editVisit(${visit.id})">Edit</button>
                <button class="btn btn-danger btn-small" onclick="window.maintenanceApp.deleteVisit(${visit.id})">Delete</button>
            </div>
        </div>
    `
}

function renderVisitStats(visits) {
    const stats = {
        total: visits.length,
        byType: {},
        totalCost: 0
    }

    visits.forEach(visit => {
        stats.byType[visit.visit_type] = (stats.byType[visit.visit_type] || 0) + 1
        if (visit.cost) {
            stats.totalCost += parseFloat(visit.cost)
        }
    })

    const statsEl = document.getElementById('visitStats')
    statsEl.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--spacing-md);">
            <div class="stat-card">
                <div class="stat-value">${stats.total}</div>
                <div class="stat-label">Total Visits</div>
            </div>
            ${Object.entries(stats.byType).map(([type, count]) => `
                <div class="stat-card">
                    <div class="stat-value">${count}</div>
                    <div class="stat-label">${VISIT_TYPES[type]?.label || type}</div>
                </div>
            `).join('')}
            ${stats.totalCost > 0 ? `
                <div class="stat-card">
                    <div class="stat-value">$${stats.totalCost.toFixed(2)}</div>
                    <div class="stat-label">Total Cost</div>
                </div>
            ` : ''}
        </div>
    `
}

function applyVisitFilters() {
    state.filters.visits.machine = document.getElementById('visitMachineFilter').value
    state.filters.visits.visitType = document.getElementById('visitTypeFilter').value
    renderVisitsTab()
}

// ============================================================================
// MODALS - ISSUE
// ============================================================================

function openIssueModal(issueId = null) {
    state.editingIssue = issueId ? state.issues.find(i => i.id === issueId) : null

    const modal = document.getElementById('issueModal')
    const form = document.getElementById('issueForm')

    form.innerHTML = `
        <div class="form-group">
            <label>Machine *</label>
            <select id="issueMachine" class="form-select" required>
                ${MACHINES.map(m => `<option value="${m}" ${state.editingIssue?.machine === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
        </div>

        <div class="form-group">
            <label>Category *</label>
            <select id="issueCategory" class="form-select" required onchange="window.maintenanceApp.updateIssueTypes()">
                <option value="">Select category...</option>
                ${Object.keys(ISSUE_TYPES).map(c => `
                    <option value="${c}" ${state.editingIssue?.issue_type === c ? 'selected' : ''}>${c}</option>
                `).join('')}
            </select>
        </div>

        <div class="form-group">
            <label>Issue Type *</label>
            <select id="issueType" class="form-select" required>
                <option value="">Select type...</option>
            </select>
        </div>

        <div class="form-group" id="colorsGroup" style="display: none;">
            <label>Affected Colors</label>
            <input type="text" id="issueColors" class="form-input" placeholder="e.g., Cyan, Magenta">
            <small>Comma-separated list</small>
        </div>

        <div class="form-group">
            <label>Description *</label>
            <textarea id="issueDescription" class="form-input" rows="4" required>${state.editingIssue?.description || ''}</textarea>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label>Severity *</label>
                <select id="issueSeverity" class="form-select" required>
                    <option value="low" ${state.editingIssue?.severity === 'low' ? 'selected' : ''}>Low</option>
                    <option value="medium" ${state.editingIssue?.severity === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="high" ${state.editingIssue?.severity === 'high' ? 'selected' : ''}>High</option>
                    <option value="critical" ${state.editingIssue?.severity === 'critical' ? 'selected' : ''}>Critical</option>
                </select>
            </div>

            <div class="form-group">
                <label>Status *</label>
                <select id="issueStatus" class="form-select" required>
                    <option value="open" ${state.editingIssue?.status === 'open' ? 'selected' : ''}>Open</option>
                    <option value="in_progress" ${state.editingIssue?.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="resolved" ${state.editingIssue?.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                    <option value="closed" ${state.editingIssue?.status === 'closed' ? 'selected' : ''}>Closed</option>
                </select>
            </div>
        </div>

        <div class="form-group">
            <label>Notes</label>
            <textarea id="issueNotes" class="form-input" rows="3">${state.editingIssue?.notes || ''}</textarea>
        </div>

        <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="window.maintenanceApp.closeIssueModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">${state.editingIssue ? 'Update Issue' : 'Log Issue'}</button>
        </div>
    `

    // Populate issue types if editing
    if (state.editingIssue) {
        updateIssueTypes()
        if (state.editingIssue.colors) {
            document.getElementById('issueColors').value = state.editingIssue.colors.join(', ')
        }
    }

    modal.style.display = 'flex'
}

function closeIssueModal() {
    document.getElementById('issueModal').style.display = 'none'
    state.editingIssue = null
}

function updateIssueTypes() {
    const category = document.getElementById('issueCategory').value
    const typeSelect = document.getElementById('issueType')
    const colorsGroup = document.getElementById('colorsGroup')

    if (!category) {
        typeSelect.innerHTML = '<option value="">Select category first...</option>'
        colorsGroup.style.display = 'none'
        return
    }

    const types = ISSUE_TYPES[category] || []
    typeSelect.innerHTML = types.map(t => `
        <option value="${t.value}" ${state.editingIssue?.issue_subtype === t.value ? 'selected' : ''}>${t.label}</option>
    `).join('')

    // Show/hide colors field based on selection
    const selectedType = types.find(t => t.value === typeSelect.value)
    colorsGroup.style.display = selectedType?.colors ? 'block' : 'none'

    // Add change listener
    typeSelect.onchange = () => {
        const type = types.find(t => t.value === typeSelect.value)
        colorsGroup.style.display = type?.colors ? 'block' : 'none'
    }
}

async function submitIssue(event) {
    event.preventDefault()

    const issueData = {
        machine: document.getElementById('issueMachine').value,
        issue_type: document.getElementById('issueCategory').value,
        issue_subtype: document.getElementById('issueType').value,
        description: document.getElementById('issueDescription').value,
        severity: document.getElementById('issueSeverity').value,
        status: document.getElementById('issueStatus').value,
        notes: document.getElementById('issueNotes').value || null
    }

    // Parse colors if provided
    const colorsInput = document.getElementById('issueColors').value.trim()
    if (colorsInput) {
        issueData.colors = colorsInput.split(',').map(c => c.trim()).filter(c => c)
    }

    try {
        if (state.editingIssue) {
            await maintenance.updateIssue(state.editingIssue.id, issueData)
            dashboard.createActivity({ type: 'maintenance', description: `Updated issue: ${issueData.machine} — ${issueData.issue_type}` }).catch(() => {})
            alert('Issue updated successfully')
        } else {
            await maintenance.createIssue(issueData)
            dashboard.createActivity({ type: 'maintenance', description: `Logged issue: ${issueData.machine} — ${issueData.issue_type} (${issueData.severity})` }).catch(() => {})
            alert('Issue logged successfully')
        }

        await loadIssues()
        renderIssuesTab()
        closeIssueModal()
    } catch (error) {
        console.error('Error saving issue:', error)
        alert('Failed to save issue: ' + error.message)
    }
}

async function deleteIssue(issueId) {
    if (!confirm('Are you sure you want to delete this issue?')) return

    try {
        await maintenance.deleteIssue(issueId)
        await loadIssues()
        renderIssuesTab()
        alert('Issue deleted successfully')
    } catch (error) {
        console.error('Error deleting issue:', error)
        alert('Failed to delete issue: ' + error.message)
    }
}

function editIssue(issueId) {
    openIssueModal(issueId)
}

async function markIssueComplete(issueId) {
    const issue = state.issues.find(i => i.id === issueId)
    if (!issue) return

    // Mark issue as resolved in the API
    try {
        await maintenance.updateIssue(issueId, { ...issue, status: 'resolved', resolved_at: new Date().toISOString().split('T')[0] })
        await loadIssues()
        renderIssuesTab()
    } catch (error) {
        console.error('Error resolving issue:', error)
        alert('Failed to resolve issue: ' + error.message)
        return
    }

    // Switch to Maintenance Log tab and open a new log entry pre-filled with issue context
    switchTab('maintenance')
    await loadLogs()
    renderMaintenanceTab()

    const modal = document.getElementById('logModal')
    const form = document.getElementById('logForm')
    const modalTitle = modal.querySelector('.modal-header h2')
    state.editingLog = null
    modalTitle.textContent = 'Log Maintenance'
    form.reset()
    document.getElementById('logDate').value = new Date().toISOString().split('T')[0]
    document.getElementById('logDescription').value = `Resolved: ${issue.machine} — ${issue.description}`
    modal.style.display = 'flex'
}

// ============================================================================
// MODALS - SERVICE VISIT
// ============================================================================

function openVisitModal(visitId = null) {
    state.editingVisit = visitId ? state.visits.find(v => v.id === visitId) : null

    const modal = document.getElementById('visitModal')
    const form = document.getElementById('visitForm')

    // Set default date to today
    const today = new Date().toISOString().split('T')[0]

    form.innerHTML = `
        <div class="form-row">
            <div class="form-group">
                <label>Date *</label>
                <input type="date" id="visitDate" class="form-input" required value="${state.editingVisit?.date || today}">
            </div>

            <div class="form-group">
                <label>Time</label>
                <input type="time" id="visitTime" class="form-input" value="${state.editingVisit?.time || ''}">
            </div>
        </div>

        <div class="form-group">
            <label>Machine *</label>
            <select id="visitMachine" class="form-select" required>
                ${MACHINES.map(m => `<option value="${m}" ${state.editingVisit?.machine === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label>Technician *</label>
                <input type="text" id="visitTechnician" class="form-input" required value="${state.editingVisit?.technician || ''}" placeholder="Technician name">
            </div>

            <div class="form-group">
                <label>Company</label>
                <input type="text" id="visitCompany" class="form-input" value="${state.editingVisit?.company || ''}" placeholder="Service company">
            </div>
        </div>

        <div class="form-group">
            <label>Visit Type *</label>
            <select id="visitType" class="form-select" required>
                ${Object.entries(VISIT_TYPES).map(([value, info]) => `
                    <option value="${value}" ${state.editingVisit?.visit_type === value ? 'selected' : ''}>${info.label}</option>
                `).join('')}
            </select>
        </div>

        <div class="form-group">
            <label>Description</label>
            <textarea id="visitDescription" class="form-input" rows="3" placeholder="Brief description of work performed">${state.editingVisit?.description || ''}</textarea>
        </div>

        <div class="form-group">
            <label>Notes</label>
            <textarea id="visitNotes" class="form-input" rows="3" placeholder="Additional notes, parts replaced, etc.">${state.editingVisit?.notes || ''}</textarea>
        </div>

        <div class="form-group">
            <label>Cost</label>
            <input type="number" id="visitCost" class="form-input" step="0.01" min="0" value="${state.editingVisit?.cost || ''}" placeholder="0.00">
        </div>

        <div class="form-group">
            <label>Link to Issue <span style="color: var(--color-text-muted); font-weight: 400;">(optional)</span></label>
            <select id="visitLinkedIssue" class="form-select">
                <option value="">— None —</option>
                ${state.issues
                    .filter(i => i.status === 'open' || i.status === 'in_progress')
                    .map(i => `<option value="${i.id}" ${state.editingVisit?.linked_issue_id == i.id ? 'selected' : ''}>
                        #${i.id} — ${i.machine}: ${(i.description || '').substring(0, 50)}${(i.description || '').length > 50 ? '...' : ''}
                    </option>`)
                    .join('')}
            </select>
        </div>

        <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="window.maintenanceApp.closeVisitModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">${state.editingVisit ? 'Update Visit' : 'Log Visit'}</button>
        </div>
    `

    modal.style.display = 'flex'
}

function closeVisitModal() {
    document.getElementById('visitModal').style.display = 'none'
    state.editingVisit = null
}

async function submitVisit(event) {
    event.preventDefault()

    const visitData = {
        date: document.getElementById('visitDate').value,
        time: document.getElementById('visitTime').value || null,
        machine: document.getElementById('visitMachine').value,
        technician: document.getElementById('visitTechnician').value,
        company: document.getElementById('visitCompany').value || null,
        visit_type: document.getElementById('visitType').value,
        description: document.getElementById('visitDescription').value || null,
        notes: document.getElementById('visitNotes').value || null,
        cost: document.getElementById('visitCost').value || null,
        linked_issue_id: document.getElementById('visitLinkedIssue').value
            ? parseInt(document.getElementById('visitLinkedIssue').value)
            : null
    }

    try {
        if (state.editingVisit) {
            await maintenance.updateVisit(state.editingVisit.id, visitData)
            dashboard.createActivity({ type: 'maintenance', description: `Updated service visit: ${visitData.technician} — ${visitData.machine}` }).catch(() => {})
            alert('Service visit updated successfully')
        } else {
            await maintenance.createVisit(visitData)
            dashboard.createActivity({ type: 'maintenance', description: `Service visit: ${visitData.technician} at ${visitData.machine} (${visitData.visit_type})` }).catch(() => {})
            alert('Service visit logged successfully')
        }

        await loadVisits()
        renderVisitsTab()
        closeVisitModal()
    } catch (error) {
        console.error('Error saving visit:', error)
        alert('Failed to save visit: ' + error.message)
    }
}

async function deleteVisit(visitId) {
    if (!confirm('Are you sure you want to delete this service visit?')) return

    try {
        await maintenance.deleteVisit(visitId)
        await loadVisits()
        renderVisitsTab()
        alert('Service visit deleted successfully')
    } catch (error) {
        console.error('Error deleting visit:', error)
        alert('Failed to delete visit: ' + error.message)
    }
}

function editVisit(visitId) {
    openVisitModal(visitId)
}

// ============================================================================
// MAINTENANCE LOGS
// ============================================================================

async function loadLogs() {
    try {
        const filters = {}
        if (state.filters.logs.startDate) filters.startDate = state.filters.logs.startDate
        if (state.filters.logs.endDate) filters.endDate = state.filters.logs.endDate

        const response = await maintenance.getLogs(filters)
        state.logs = response.data || response || []
        console.log(`Loaded ${state.logs.length} maintenance logs`)
    } catch (error) {
        console.error('Error loading maintenance logs:', error)
        state.logs = []
    }
}

function renderMaintenanceTab() {
    const container = document.getElementById('maintenanceLogsList')
    if (!container) return

    if (state.logs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <h3>No maintenance logs yet</h3>
                <p>Start logging your weekly maintenance to keep track of routine work.</p>
            </div>
        `
        return
    }

    container.innerHTML = state.logs.map(log => renderLogCard(log)).join('')
}

function renderLogCard(log) {
    const date = new Date(log.date)
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    const timeStr = log.time ? log.time : ''

    return `
        <div class="card" style="margin-bottom: var(--spacing-md);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--spacing-sm);">
                <div>
                    <div style="font-weight: 600; color: var(--color-text); margin-bottom: 4px;">
                        ${dateStr} ${timeStr}
                    </div>
                    ${log.performed_by ? `<div style="font-size: 0.875rem; color: var(--color-text-muted);">By ${log.performed_by}</div>` : ''}
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-icon" onclick="window.maintenanceApp.editLog(${log.id})" title="Edit">
                        ✏️
                    </button>
                    <button class="btn-icon" onclick="window.maintenanceApp.deleteLog(${log.id})" title="Delete">
                        🗑️
                    </button>
                </div>
            </div>
            <div style="color: var(--color-text); margin-bottom: ${log.notes ? 'var(--spacing-sm)' : '0'};">
                ${log.description}
            </div>
            ${log.notes ? `
                <div style="font-size: 0.875rem; color: var(--color-text-muted); padding: var(--spacing-sm); background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
                    <strong>Notes:</strong> ${log.notes}
                </div>
            ` : ''}
        </div>
    `
}

function filterLogs() {
    loadLogs().then(() => renderMaintenanceTab())
}

function openLogModal(logId = null) {
    const modal = document.getElementById('logModal')
    const form = document.getElementById('logForm')
    const modalTitle = modal.querySelector('.modal-header h2')

    if (logId) {
        // Edit mode
        state.editingLog = state.logs.find(l => l.id === logId)
        if (!state.editingLog) return

        modalTitle.textContent = 'Edit Maintenance Log'
        document.getElementById('logDate').value = state.editingLog.date
        document.getElementById('logTime').value = state.editingLog.time || ''
        document.getElementById('logDescription').value = state.editingLog.description
        document.getElementById('logNotes').value = state.editingLog.notes || ''
        document.getElementById('logPerformedBy').value = state.editingLog.performed_by || ''
    } else {
        // Create mode
        state.editingLog = null
        modalTitle.textContent = 'Log Maintenance'
        form.reset()
        // Set default date to today
        document.getElementById('logDate').value = new Date().toISOString().split('T')[0]
    }

    modal.style.display = 'flex'
}

function closeLogModal() {
    const modal = document.getElementById('logModal')
    modal.style.display = 'none'
    state.editingLog = null
}

async function submitLog(event) {
    event.preventDefault()

    const logData = {
        date: document.getElementById('logDate').value,
        time: document.getElementById('logTime').value || null,
        description: document.getElementById('logDescription').value.trim(),
        notes: document.getElementById('logNotes').value.trim() || null,
        performed_by: document.getElementById('logPerformedBy').value.trim() || null
    }

    try {
        if (state.editingLog) {
            // Update existing log
            await maintenance.updateLog(state.editingLog.id, logData)
            console.log('Maintenance log updated')
        } else {
            // Create new log
            await maintenance.createLog(logData)
            console.log('Maintenance log created')
        }

        closeLogModal()
        await loadLogs()
        renderMaintenanceTab()
    } catch (error) {
        console.error('Error saving maintenance log:', error)
        alert('Failed to save maintenance log: ' + error.message)
    }
}

async function deleteLog(logId) {
    if (!confirm('Are you sure you want to delete this maintenance log?')) {
        return
    }

    try {
        await maintenance.deleteLog(logId)
        console.log('Maintenance log deleted')
        await loadLogs()
        renderMaintenanceTab()
    } catch (error) {
        console.error('Error deleting maintenance log:', error)
        alert('Failed to delete maintenance log: ' + error.message)
    }
}

function editLog(logId) {
    openLogModal(logId)
}

// ============================================================================
// UTILITIES
// ============================================================================

function populateMachineFilters() {
    // Populate issue machine filter
    const issueMachineFilter = document.getElementById('machineFilter')
    issueMachineFilter.innerHTML = '<option value="all">All Machines</option>' +
        MACHINES.map(m => `<option value="${m}">${m}</option>`).join('')

    // Populate visit machine filter
    const visitMachineFilter = document.getElementById('visitMachineFilter')
    visitMachineFilter.innerHTML = '<option value="">All Machines</option>' +
        MACHINES.map(m => `<option value="${m}">${m}</option>`).join('')
}

// ============================================================================
// ANALYTICS TAB
// ============================================================================

let analyticsPeriod = 'month'

function setAnalyticsPeriod(period) {
    analyticsPeriod = period

    // Update active button
    document.querySelectorAll('.analytics-controls .btn').forEach(btn => {
        btn.classList.remove('active')
    })
    event.target.classList.add('active')

    renderAnalytics()
}

function renderAnalytics() {
    const now = new Date()
    let cutoff = null
    if (analyticsPeriod === 'week') {
        cutoff = new Date(now)
        cutoff.setDate(cutoff.getDate() - 7)
    } else if (analyticsPeriod === 'month') {
        cutoff = new Date(now)
        cutoff.setMonth(cutoff.getMonth() - 1)
    }

    const filterByPeriod = (dateStr) => {
        if (!cutoff) return true
        return new Date(dateStr) >= cutoff
    }

    // Filter data by period
    const filteredIssues = state.issues.filter(i => filterByPeriod(i.created_at))
    const filteredVisits = state.visits.filter(v => filterByPeriod(v.date))
    const filteredLogs = state.logs.filter(l => filterByPeriod(l.date))

    // Aggregate issues by status
    const byStatus = { open: 0, in_progress: 0, resolved: 0, closed: 0 }
    const byMachine = {}
    const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 }

    filteredIssues.forEach(issue => {
        const status = issue.status || 'open'
        if (byStatus[status] !== undefined) byStatus[status]++
        else byStatus[status] = 1

        const machine = issue.machine || 'Unknown'
        byMachine[machine] = (byMachine[machine] || 0) + 1

        const severity = issue.severity || 'low'
        if (bySeverity[severity] !== undefined) bySeverity[severity]++
        else bySeverity[severity] = 1
    })

    const periodLabel = analyticsPeriod === 'week' ? 'Past 7 Days' : analyticsPeriod === 'month' ? 'Past 30 Days' : 'All Time'

    const machineRows = Object.entries(byMachine)
        .sort((a, b) => b[1] - a[1])
        .map(([machine, count]) => `
            <tr>
                <td style="padding: var(--spacing-xs) var(--spacing-sm);">${machine}</td>
                <td style="padding: var(--spacing-xs) var(--spacing-sm); text-align: right; font-weight: 600;">${count}</td>
            </tr>
        `).join('')

    document.getElementById('analyticsContent').innerHTML = `
        <p style="color: var(--color-text-muted); margin-bottom: var(--spacing-lg);">${periodLabel}</p>

        <h3 style="margin-bottom: var(--spacing-md);">Issues by Status</h3>
        <div class="stats-grid" style="margin-bottom: var(--spacing-xl);">
            <div class="stat-card">
                <div class="stat-value" style="color: var(--color-error);">${byStatus.open}</div>
                <div class="stat-label">Open</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--color-warning);">${byStatus.in_progress}</div>
                <div class="stat-label">In Progress</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--color-success);">${byStatus.resolved}</div>
                <div class="stat-label">Resolved</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${byStatus.closed}</div>
                <div class="stat-label">Closed</div>
            </div>
        </div>

        <h3 style="margin-bottom: var(--spacing-md);">Issues by Severity</h3>
        <div class="stats-grid" style="margin-bottom: var(--spacing-xl);">
            <div class="stat-card">
                <div class="stat-value">${bySeverity.low}</div>
                <div class="stat-label">Low</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--color-warning);">${bySeverity.medium}</div>
                <div class="stat-label">Medium</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: #ef4444;">${bySeverity.high}</div>
                <div class="stat-label">High</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--color-error);">${bySeverity.critical}</div>
                <div class="stat-label">Critical</div>
            </div>
        </div>

        <h3 style="margin-bottom: var(--spacing-md);">Issues by Machine</h3>
        ${machineRows ? `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: var(--spacing-xl);">
            <thead>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <th style="padding: var(--spacing-xs) var(--spacing-sm); text-align: left;">Machine</th>
                    <th style="padding: var(--spacing-xs) var(--spacing-sm); text-align: right;">Issues</th>
                </tr>
            </thead>
            <tbody>${machineRows}</tbody>
        </table>` : '<p style="color: var(--color-text-muted); margin-bottom: var(--spacing-xl);">No issues in this period</p>'}

        <h3 style="margin-bottom: var(--spacing-md);">Service & Maintenance Activity</h3>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${filteredVisits.length}</div>
                <div class="stat-label">Service Visits</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${filteredLogs.length}</div>
                <div class="stat-label">Maintenance Logs</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${filteredIssues.length}</div>
                <div class="stat-label">Total Issues</div>
            </div>
        </div>
    `
}

// ============================================================================
// EXPORT PUBLIC API
// ============================================================================

window.maintenanceApp = {
    switchTab,
    // Issues
    openIssueModal,
    closeIssueModal,
    updateIssueTypes,
    submitIssue,
    filterIssues: applyIssueFilters,
    editIssue,
    deleteIssue,
    markIssueComplete,
    // Visits
    openVisitModal,
    closeVisitModal,
    submitVisit,
    filterVisits: applyVisitFilters,
    editVisit,
    deleteVisit,
    // Logs
    openLogModal,
    closeLogModal,
    submitLog,
    filterLogs,
    editLog,
    deleteLog,
    // Analytics
    setAnalyticsPeriod
}

// ============================================================================
// INITIALIZE
// ============================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
} else {
    init()
}
