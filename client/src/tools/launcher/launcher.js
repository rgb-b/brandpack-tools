import '../../shared/components/AppHeader.js'
import { storage } from '../../shared/utils/storage.js'
import { STORAGE_KEYS, VERSION } from '../../shared/constants.js'
import { exportAllData } from '../../shared/utils/export.js'
import { requireAuth, isAdmin } from '../../shared/utils/auth.js'
import { dashboard, inventory, maintenance, pantone, productivity, users, productivityV4, getAppConfig } from '../../api/client.js'
import toast from '../../shared/components/Toast.js'
import '../../shared/utils/cyberpunk-effects.js'
import { formatDuration } from '../../shared/utils/datetime.js'
import { lowEnergy } from '../../shared/utils/lowEnergy.js'

// Helper: pick normal or low-energy interval value
function le(normal, low) { return lowEnergy.get() ? low : normal }

// Make toast globally accessible
window.toast = toast

// Dashboard state
let dashboardState = {
    currentMonth: new Date(),
    todos: [],
    maintenanceEvents: [],
    calendarData: null,
    maintenanceReminder: null,  // Cache reminder data
    maintenanceReminderLastFetch: null,  // Cache timestamp
    userShiftLength: 8,  // Default shift length (fetched from API)
    lastStats: null,    // Cached stats for screensaver
    clockStatus: null   // Cached timeclock status for screensaver
}

// Track all interval IDs for visibility-based pause/resume
const intervals = {
    clock: null, countdown: null,
    stats: null, resources: null, activity: null,
    calendar: null, maintenanceReminder: null
}

// Initialize dashboard
async function init() {
    // Check authentication first
    const user = await requireAuth()
    if (!user) return // requireAuth redirects to login if not authenticated

    // Render tool cards from config (replaces static HTML)
    await renderToolCards(user)

    loadDashboardData()
    initializeClock()
    initializeCalendar()
    loadQuickStats()
    loadTodoList()
    loadResourceStats()
    loadActivityFeed()
    loadMaintenanceReminder()
    initializeCountdownWidget()
    initProductivityWidget()

    // Refresh stats every 30 seconds (or 5 min in low energy mode)
    intervals.stats    = setInterval(loadQuickStats, le(30000, 300000))
    intervals.resources = setInterval(loadResourceStats, le(30000, 300000))
    intervals.activity  = setInterval(loadActivityFeed, le(30000, 300000))

    // Refresh calendar every 5 minutes (or 15 min in low energy mode)
    intervals.calendar = setInterval(renderWeekView, le(300000, 900000))

    // Refresh maintenance reminder every 5 minutes (or 15 min in low energy mode)
    intervals.maintenanceReminder = setInterval(loadMaintenanceReminder, le(300000, 900000))
}

// Tool metadata: icon, description fallback, stat element id, path
const TOOL_META = {
    inventory:         { icon: '📦', desc: 'Track supplies and stock levels',           statId: 'tool-stat-inventory',    path: '../inventory/index.html' },
    'productivity-v4': { icon: '⏱️', desc: 'Track tasks and time sessions',             statId: 'tool-stat-productivity', path: '../productivity-v4/index.html' },
    pantone:           { icon: '🎨', desc: 'Colour matching and status tracker',        statId: 'tool-stat-pantone',      path: '../pantone/index.html' },
    converter:         { icon: '🔀', desc: 'LAB ↔ CMYK colour conversion',              statId: null,                     path: '../converter/index.html' },
    maintenance:       { icon: '🔧', desc: 'Equipment issues and service log',           statId: 'tool-stat-maintenance',  path: '../maintenance/index.html' },
    admin:             { icon: '👤', desc: 'Manage users and system settings',           statId: null,                     path: '../admin/index.html' },
}

// Render tool cards from config — replaces static HTML cards
async function renderToolCards(user) {
    const toolsGrid = document.getElementById('toolsGrid')
    if (!toolsGrid) return

    let toolConfig = {}
    try {
        const cfg = await getAppConfig()
        toolConfig = cfg?.tools || {}
        // Apply accent colour
        if (cfg?.app?.primaryColor) {
            document.documentElement.style.setProperty('--color-primary', cfg.app.primaryColor)
        }
    } catch {}

    toolsGrid.innerHTML = ''

    // Render each enabled tool (in definition order)
    for (const [key, meta] of Object.entries(TOOL_META)) {
        if (key === 'admin') continue // handled separately below

        const toolCfg = toolConfig[key]
        // Hide if explicitly disabled
        if (toolCfg && toolCfg.enabled === false) continue

        const label = toolCfg?.label || meta.icon + ' ' + key
        const desc  = toolCfg?.description || meta.desc
        const statId = meta.statId ? `id="${meta.statId}"` : ''

        const card = document.createElement('div')
        card.className = 'tool-card'
        card.onclick = () => window.location.href = meta.path
        card.innerHTML = `
            <div class="tool-icon">${meta.icon}</div>
            <div class="tool-title">${label}</div>
            <div class="tool-desc">${desc}</div>
            <div class="tool-stat" ${statId}></div>
        `
        toolsGrid.appendChild(card)
    }

    // Admin card — only for admin users
    if (isAdmin(user) && (!toolConfig.admin || toolConfig.admin.enabled !== false)) {
        const adminLabel = toolConfig.admin?.label || 'Admin'
        const adminDesc  = toolConfig.admin?.description || TOOL_META.admin.desc
        const adminCard = document.createElement('div')
        adminCard.className = 'tool-card'
        adminCard.onclick = () => window.location.href = '../admin/index.html'
        adminCard.innerHTML = `
            <div class="tool-icon">👤</div>
            <div class="tool-title">${adminLabel}</div>
            <div class="tool-desc">${adminDesc}</div>
            <div class="tool-stat"></div>
        `
        toolsGrid.appendChild(adminCard)
    }
}

// Live clock update (module-level so pause/resume can reference it)
function updateClock() {
    const now = new Date()

    // Update time in HUD banner
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    document.getElementById('currentTime').textContent = `${hours}:${minutes}:${seconds}`

    // Update date
    const dateOptions = { month: 'long', day: 'numeric', year: 'numeric' }
    const dateStr = now.toLocaleDateString('en-US', dateOptions)
    const dateEl = document.getElementById('currentDate')
    if (dateEl) dateEl.textContent = dateStr

    // Update greeting
    const hour = now.getHours()
    let greeting = 'Good Evening'
    if (hour < 12) greeting = 'Good Morning'
    else if (hour < 18) greeting = 'Good Afternoon'
    document.getElementById('currentGreeting').textContent = greeting
}

// Initialize live clock
function initializeClock() {
    updateClock()
    intervals.clock = setInterval(updateClock, le(1000, 60000))
}

// Calendar functionality - Week View
function initializeCalendar() {
    renderWeekView()
}

async function renderWeekView() {
    const today = new Date()
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    // Calculate date range
    const startDate = today.toISOString().split('T')[0]
    const endDate = new Date(today)
    endDate.setDate(today.getDate() + 6)
    const endDateStr = endDate.toISOString().split('T')[0]

    // Fetch calendar data from API
    let calendarData
    try {
        const response = await dashboard.getCalendarData(startDate, endDateStr)
        calendarData = response.data || response
    } catch (error) {
        console.error('Error loading calendar data:', error)
        calendarData = { days: [], summary: {} }
    }

    let html = ''
    const todayStr = today.toDateString()

    // Generate 7 days starting from today
    for (let i = 0; i < 7; i++) {
        const date = new Date(today)
        date.setDate(today.getDate() + i)

        const dateStr = date.toDateString()
        const dateYMD = date.toISOString().split('T')[0]
        const isToday = dateStr === todayStr
        const dayName = dayNames[date.getDay()]
        const dayNum = date.getDate()
        const monthName = monthNames[date.getMonth()]

        // Find day data from API response
        const dayData = calendarData.days?.find(d => d.date === dateYMD) || { date: dateYMD, events: {} }
        const events = dayData.events || {}

        // Build indicators for: visits, issues, productivity, todos
        let indicators = []

        if (events.serviceVisits?.length > 0) {
            indicators.push({
                type: 'visit',
                text: `${events.serviceVisits.length} visit${events.serviceVisits.length > 1 ? 's' : ''}`,
                icon: '🔧'
            })
        }

        if (events.issues) {
            const criticalIssues = events.issues.filter(i => i.severity === 'critical')
            const openIssues = events.issues.filter(i => i.status === 'open' || i.status === 'in_progress')

            if (criticalIssues.length > 0) {
                indicators.push({
                    type: 'issue-critical',
                    text: `${criticalIssues.length} critical`,
                    icon: '⚠️'
                })
            } else if (openIssues.length > 0) {
                indicators.push({
                    type: 'issue-open',
                    text: `${openIssues.length} issue${openIssues.length > 1 ? 's' : ''}`,
                    icon: '🔴'
                })
            }
        }

        if (events.productivity?.totalTime > 0) {
            const hours = (events.productivity.totalTime / (1000 * 60 * 60)).toFixed(1)
            indicators.push({
                type: 'productivity',
                text: `${hours}h`,
                icon: '⏱️'
            })
        }

        if (events.todos?.length > 0 && isToday) {
            const incompleteTodos = events.todos.filter(t => !t.completed).length
            if (incompleteTodos > 0) {
                indicators.push({
                    type: 'todo',
                    text: `${incompleteTodos} task${incompleteTodos > 1 ? 's' : ''}`,
                    icon: '✓'
                })
            }
        }

        // Render day with first indicator or month name
        const eventHtml = indicators.length > 0
            ? `<span class="week-day-indicator ${indicators[0].type}">${indicators[0].icon} ${indicators[0].text}</span>`
            : (isToday ? 'Today' : monthName)

        html += `
            <div class="week-day ${isToday ? 'today' : ''}" data-date="${dateYMD}" onclick="window.launcherApp.showDayDetail('${dateYMD}')">
                <div class="week-day-name">${dayName}</div>
                <div class="week-day-date">${dayNum}</div>
                <div class="week-day-events">${eventHtml}</div>
                ${indicators.length > 1 ? `<div class="more-indicator">+${indicators.length - 1} more</div>` : ''}
            </div>
        `
    }

    document.getElementById('weekView').innerHTML = html

    // Update header with date range
    const rangeText = `${monthNames[today.getMonth()]} ${today.getDate()} - ${monthNames[endDate.getMonth()]} ${endDate.getDate()}`
    document.getElementById('calendarMonth').textContent = rangeText

    // Store calendar data for day detail modal
    dashboardState.calendarData = calendarData
}

// Show day detail modal
function showDayDetail(dateStr) {
    if (!dashboardState.calendarData) return

    const dayData = dashboardState.calendarData.days?.find(d => d.date === dateStr)
    if (!dayData) {
        alert('No data available for this date')
        return
    }

    const date = new Date(dateStr)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December']
    const formattedDate = `${dayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`

    const events = dayData.events || {}

    let modalContent = `
        <div style="padding: var(--spacing-lg);">
            <h2 style="margin-bottom: var(--spacing-md);">${formattedDate}</h2>
    `

    // Service Visits
    if (events.serviceVisits?.length > 0) {
        modalContent += `
            <div style="margin-bottom: var(--spacing-lg);">
                <h3 style="color: var(--color-primary-light); margin-bottom: var(--spacing-sm);">🔧 Service Visits</h3>
                ${events.serviceVisits.map(visit => `
                    <div style="padding: var(--spacing-sm); background: var(--color-bg-hover); border-radius: var(--radius-md); margin-bottom: var(--spacing-sm);">
                        <strong>${visit.machine}</strong> - ${visit.technician}
                        <div style="color: var(--color-text-muted); font-size: var(--text-sm);">
                            ${visit.visit_type} ${visit.time ? `at ${visit.time}` : ''}
                        </div>
                        ${visit.description ? `<div style="margin-top: var(--spacing-xs);">${visit.description}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `
    }

    // Issues
    if (events.issues?.length > 0) {
        modalContent += `
            <div style="margin-bottom: var(--spacing-lg);">
                <h3 style="color: var(--color-primary-light); margin-bottom: var(--spacing-sm);">🔴 Issues</h3>
                ${events.issues.map(issue => {
                    const severityColor = {
                        critical: 'var(--color-error)',
                        high: 'var(--color-warning)',
                        medium: 'var(--color-warning)',
                        low: 'var(--color-success)'
                    }[issue.severity] || 'var(--color-text-secondary)'

                    return `
                        <div style="padding: var(--spacing-sm); background: var(--color-bg-hover); border-radius: var(--radius-md); margin-bottom: var(--spacing-sm); border-left: 3px solid ${severityColor};">
                            <strong>${issue.machine}</strong> - ${issue.issue_type}
                            <div style="color: var(--color-text-muted); font-size: var(--text-sm);">
                                ${issue.status} • ${issue.severity} severity
                            </div>
                            ${issue.description ? `<div style="margin-top: var(--spacing-xs);">${issue.description}</div>` : ''}
                        </div>
                    `
                }).join('')}
            </div>
        `
    }

    // Productivity
    if (events.productivity?.totalTime > 0) {
        const prod = events.productivity
        const formatTime = (ms) => {
            const hours = Math.floor(ms / 3600000)
            const mins = Math.floor((ms % 3600000) / 60000)
            return `${hours}h ${mins}m`
        }

        modalContent += `
            <div style="margin-bottom: var(--spacing-lg);">
                <h3 style="color: var(--color-primary-light); margin-bottom: var(--spacing-sm);">⏱️ Productivity</h3>
                <div style="padding: var(--spacing-sm); background: var(--color-bg-hover); border-radius: var(--radius-md);">
                    <div><strong>Total Time:</strong> ${formatTime(prod.totalTime)}</div>
                    ${prod.available ? `<div style="color: var(--color-success);">Available: ${formatTime(prod.available)}</div>` : ''}
                    ${prod.working ? `<div style="color: var(--color-primary-light);">Working: ${formatTime(prod.working)}</div>` : ''}
                    ${prod.unavailable ? `<div style="color: var(--color-error);">Unavailable: ${formatTime(prod.unavailable)}</div>` : ''}
                </div>
            </div>
        `
    }

    // Todos
    if (events.todos?.length > 0) {
        const incompleteTodos = events.todos.filter(t => !t.completed)
        if (incompleteTodos.length > 0) {
            modalContent += `
                <div style="margin-bottom: var(--spacing-lg);">
                    <h3 style="color: var(--color-primary-light); margin-bottom: var(--spacing-sm);">✓ Tasks</h3>
                    ${incompleteTodos.map(todo => `
                        <div style="padding: var(--spacing-sm); background: var(--color-bg-hover); border-radius: var(--radius-md); margin-bottom: var(--spacing-sm);">
                            ${todo.text}
                        </div>
                    `).join('')}
                </div>
            `
        }
    }

    // No events
    if (!events.serviceVisits?.length && !events.issues?.length && !events.productivity?.totalTime && !events.todos?.length) {
        modalContent += `
            <div style="color: var(--color-text-muted); text-align: center; padding: var(--spacing-lg);">
                No events scheduled for this day
            </div>
        `
    }

    modalContent += `
            <div style="text-align: right; margin-top: var(--spacing-lg);">
                <button class="btn btn-secondary" onclick="document.getElementById('dayDetailModal').style.display='none'">Close</button>
            </div>
        </div>
    `

    // Show modal
    let modal = document.getElementById('dayDetailModal')
    if (!modal) {
        modal = document.createElement('div')
        modal.id = 'dayDetailModal'
        modal.className = 'modal'
        modal.style.display = 'none'
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div id="dayDetailContent"></div>
            </div>
        `
        document.body.appendChild(modal)

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none'
            }
        })
    }

    document.getElementById('dayDetailContent').innerHTML = modalContent
    modal.style.display = 'flex'
}

// Quick stats
async function loadQuickStats() {
    // Use new aggregated stats API (1 call instead of 4)
    try {
        const response = await dashboard.getStats()
        const stats = response.data || response
        dashboardState.lastStats = stats  // Cache for screensaver

        // Inventory stats
        const inventoryTotal = stats.inventory?.total || 0
        const lowStockItems = stats.inventory?.lowStock || 0
        document.getElementById('inventoryCount').textContent = inventoryTotal
        document.getElementById('inventorySubtext').textContent =
            lowStockItems > 0
                ? `${lowStockItems} item${lowStockItems > 1 ? 's' : ''} low stock`
                : 'All items stocked'

        // Productivity stats (V4 task-based tracker)
        const todayTime = stats.productivity?.todayTime || 0
        const sessionCount = stats.productivity?.sessionCount || 0

        const hours = Math.floor(todayTime / 3600000)
        const mins = Math.floor((todayTime % 3600000) / 60000)
        document.getElementById('todayTime').textContent = `${hours}h ${mins}m`

        if (todayTime > 0) {
            document.getElementById('timeSubtext').textContent =
                `${sessionCount} session${sessionCount !== 1 ? 's' : ''} tracked today`
        } else {
            document.getElementById('timeSubtext').textContent = 'No activity today'
        }

        // Maintenance stats
        const activeIssues = stats.maintenance?.activeIssues || 0
        const totalIssues = stats.maintenance?.totalIssues || 0
        document.getElementById('activeIssues').textContent = activeIssues
        document.getElementById('issuesSubtext').textContent =
            `${totalIssues} total issue${totalIssues !== 1 ? 's' : ''} logged`

        // Update status indicator
        updateStatusIndicator(activeIssues)

        // Tool card live stats
        const invStat = document.getElementById('tool-stat-inventory')
        if (invStat) invStat.textContent = lowStockItems > 0 ? `${lowStockItems} low stock` : 'All stocked'
        const prodStat = document.getElementById('tool-stat-productivity')
        if (prodStat) {
            const h = Math.floor(todayTime / 3600000), m = Math.floor((todayTime % 3600000) / 60000)
            prodStat.textContent = todayTime > 0 ? `${h}h ${m}m today` : 'No activity today'
        }
        const maintStat = document.getElementById('tool-stat-maintenance')
        if (maintStat) maintStat.textContent = activeIssues > 0 ? `${activeIssues} active issue${activeIssues !== 1 ? 's' : ''}` : 'No open issues'

        // Pantone stats
        const pantoneTotal = stats.pantone?.total || 0
        const unmatched = stats.pantone?.unmatched || 0
        document.getElementById('pantoneCount').textContent = pantoneTotal
        document.getElementById('pantoneSubtext').textContent =
            unmatched > 0
                ? `${unmatched} color${unmatched > 1 ? 's' : ''} need matching`
                : 'All colors matched'
        const pantoneStat = document.getElementById('tool-stat-pantone')
        if (pantoneStat) pantoneStat.textContent = unmatched > 0 ? `${unmatched} unmatched` : 'All matched'

    } catch (error) {
        console.error('Error loading aggregated stats:', error)

        // Fallback values on error
        document.getElementById('inventoryCount').textContent = '0'
        document.getElementById('inventorySubtext').textContent = 'Error loading data'
        document.getElementById('todayTime').textContent = '0h 0m'
        document.getElementById('timeSubtext').textContent = 'Error loading data'
        document.getElementById('activeIssues').textContent = '0'
        document.getElementById('issuesSubtext').textContent = 'Error loading data'
        document.getElementById('pantoneCount').textContent = '0'
        document.getElementById('pantoneSubtext').textContent = 'Error loading data'
    }
}

// Update status indicator based on active issues
function updateStatusIndicator(activeIssues) {
    try {
        const statusIndicator = document.querySelector('.hud-status-indicator')
        if (statusIndicator) {
            const statusPulse = document.querySelector('.status-pulse')
            const statusText = statusIndicator.querySelector('span')

            if (activeIssues > 3) {
                statusIndicator.style.color = 'var(--color-error)'
                statusPulse.style.background = 'var(--color-error)'
                statusPulse.style.boxShadow = '0 0 10px var(--color-error)'
                statusText.textContent = 'Critical Issues'
            } else if (activeIssues > 0) {
                statusIndicator.style.color = 'var(--color-warning)'
                statusPulse.style.background = 'var(--color-warning)'
                statusPulse.style.boxShadow = '0 0 10px var(--color-warning)'
                statusText.textContent = `${activeIssues} Active Issue${activeIssues > 1 ? 's' : ''}`
            } else {
                statusIndicator.style.color = 'var(--color-success)'
                statusPulse.style.background = 'var(--color-success)'
                statusPulse.style.boxShadow = '0 0 10px var(--color-success)'
                statusText.textContent = 'Systems Operational'
            }
        }
    } catch (error) {
        console.error('Error updating status indicator:', error)
    }
}

// Todo list functionality
async function loadDashboardData() {
    try {
        const response = await dashboard.getTodos()
        dashboardState.todos = response.data || response || []
    } catch (error) {
        console.error('Error loading dashboard data:', error)
        dashboardState.todos = []
    }
}

async function loadTodoList() {
    try {
        await loadDashboardData()

        const html = dashboardState.todos.length > 0
            ? dashboardState.todos.map((todo) => `
                <div class="todo-item ${todo.completed ? 'completed' : ''}">
                    <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''}
                           onchange="window.dashboardApp.toggleTodo(${todo.id})">
                    <div class="todo-content">
                        <div class="todo-text">${escapeHtml(todo.text)}</div>
                    </div>
                    <div class="todo-delete" onclick="window.dashboardApp.deleteTodo(${todo.id})">✕</div>
                </div>
            `).join('')
            : '<div style="color: var(--color-text-muted); text-align: center; padding: var(--spacing-lg);">No tasks yet. Add one below!</div>'

        document.getElementById('todoList').innerHTML = html
    } catch (error) {
        console.error('Error loading todo list:', error)
        document.getElementById('todoList').innerHTML =
            '<div style="color: var(--color-error); text-align: center; padding: var(--spacing-lg);">Unable to load tasks</div>'
    }
}

async function addTodo() {
    const input = document.getElementById('todoInput')
    const text = input.value.trim()

    if (text) {
        try {
            await dashboard.createTodo(text)
            input.value = ''
            await loadTodoList()
            await updateActivityFeed('todo', `Added task: ${text}`)
        } catch (error) {
            console.error('Error adding todo:', error)
            alert('Failed to add task. Please try again.')
        }
    }
}

async function toggleTodo(id) {
    try {
        const todo = dashboardState.todos.find(t => t.id === id)
        if (!todo) return

        const newCompleted = !todo.completed
        await dashboard.updateTodo(id, { completed: newCompleted })
        await loadTodoList()

        if (newCompleted) {
            await updateActivityFeed('todo', `Completed task: ${todo.text}`)
        }
    } catch (error) {
        console.error('Error toggling todo:', error)
        alert('Failed to update task. Please try again.')
    }
}

async function deleteTodo(id) {
    try {
        const todo = dashboardState.todos.find(t => t.id === id)
        if (!todo) return

        await dashboard.deleteTodo(id)
        await loadTodoList()
        await updateActivityFeed('todo', `Deleted task: ${todo.text}`)
    } catch (error) {
        console.error('Error deleting todo:', error)
        alert('Failed to delete task. Please try again.')
    }
}

async function clearCompleted() {
    const completed = dashboardState.todos.filter(t => t.completed)
    const count = completed.length

    if (count > 0 && confirm(`Clear ${count} completed task${count > 1 ? 's' : ''}?`)) {
        try {
            // Delete all completed todos
            await Promise.all(completed.map(todo => dashboard.deleteTodo(todo.id)))
            await loadTodoList()
            await updateActivityFeed('todo', `Cleared ${count} completed tasks`)
        } catch (error) {
            console.error('Error clearing completed todos:', error)
            alert('Failed to clear completed tasks. Please try again.')
        }
    }
}

// Resource stats
async function loadResourceStats() {
    try {
        // Fetch data from API in parallel
        const [inventoryRes, issuesRes, pantoneRes] = await Promise.all([
            inventory.getAll(),
            maintenance.getIssues(),
            pantone.getStats()
        ])

        const inventoryItems = inventoryRes.data || inventoryRes || []
        const issues = issuesRes.data || issuesRes || []
        const pantoneStats = pantoneRes.data || pantoneRes || {}

        // Calculate inventory status (items in stock vs total)
        const totalItems = inventoryItems.length
        const stockedItems = inventoryItems.filter(item => item.stock > 0).length
        const stockPercentage = totalItems > 0 ? Math.round((stockedItems / totalItems) * 100) : 0

        // Calculate system health (resolved vs total issues)
        const totalIssues = issues.length
        const resolvedIssues = issues.filter(i => i.status === 'resolved' || i.status === 'closed').length
        const healthPercentage = totalIssues > 0 ? Math.round((resolvedIssues / totalIssues) * 100) : 100

        // Calculate pantone database usage (matched colors)
        const pantoneTotal = pantoneStats.total || 0
        const pantoneMatched = pantoneStats.matched || 0
        const pantonePercentage = pantoneTotal > 0 ? Math.round((pantoneMatched / pantoneTotal) * 100) : 0

        // Calculate tools active (all 5 tools are always available)
        const toolsActive = 5
        const toolsTotal = 5
        const toolsPercentage = 100

        const html = `
            <div class="resource-item">
                <div class="resource-label">Inventory Status</div>
                <div class="resource-value">${stockPercentage}%</div>
            </div>
            <div class="resource-bar">
                <div class="resource-fill" style="width: ${stockPercentage}%"></div>
            </div>
            <div style="font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 4px; margin-bottom: var(--spacing-sm);">
                ${stockedItems} of ${totalItems} items in stock
            </div>

            <div class="resource-item">
                <div class="resource-label">System Health</div>
                <div class="resource-value">${healthPercentage}%</div>
            </div>
            <div class="resource-bar">
                <div class="resource-fill" style="width: ${healthPercentage}%"></div>
            </div>
            <div style="font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 4px; margin-bottom: var(--spacing-sm);">
                ${resolvedIssues} of ${totalIssues} issues resolved
            </div>

            <div class="resource-item">
                <div class="resource-label">Pantone Database</div>
                <div class="resource-value">${pantonePercentage}%</div>
            </div>
            <div class="resource-bar">
                <div class="resource-fill" style="width: ${pantonePercentage}%"></div>
            </div>
            <div style="font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 4px; margin-bottom: var(--spacing-sm);">
                ${pantoneMatched} matched of ${pantoneTotal} total
            </div>

            <div class="resource-item">
                <div class="resource-label">Tools Active</div>
                <div class="resource-value">${toolsActive}/${toolsTotal}</div>
            </div>
            <div class="resource-bar">
                <div class="resource-fill" style="width: ${toolsPercentage}%"></div>
            </div>
            <div style="font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 4px;">
                All systems operational
            </div>
        `

        document.getElementById('resourceStats').innerHTML = html
    } catch (error) {
        console.error('Error loading resource stats:', error)
        document.getElementById('resourceStats').innerHTML = `
            <div style="color: var(--color-error); text-align: center; padding: var(--spacing-lg);">
                <div>⚠️ Failed to load system stats</div>
                <div style="font-size: var(--text-xs); margin-top: var(--spacing-xs);">${error.message}</div>
            </div>
        `
    }
}

// Activity feed
async function loadActivityFeed() {
    try {
        const response = await dashboard.getActivity({ limit: 10 })
        const activities = response.data || response || []

        if (activities.length === 0) {
            document.getElementById('activityFeed').innerHTML =
                '<div style="color: var(--color-text-muted); text-align: center; padding: var(--spacing-lg);">No recent activity</div>'
            return
        }

        const html = activities.map(activity => {
            const icon = getActivityIcon(activity.type)
            const time = formatTimeAgo(new Date(activity.timestamp))

            return `
                <div class="activity-item">
                    <div class="activity-icon">${icon}</div>
                    <div class="activity-content">
                        <div class="activity-text">${escapeHtml(activity.description)}</div>
                        <div class="activity-time">${time}</div>
                    </div>
                </div>
            `
        }).join('')

        document.getElementById('activityFeed').innerHTML = html
    } catch (error) {
        console.error('Error loading activity feed:', error)
        document.getElementById('activityFeed').innerHTML =
            '<div style="color: var(--color-text-muted); text-align: center; padding: var(--spacing-lg);">Unable to load activity</div>'
    }
}

async function updateActivityFeed(type, text) {
    try {
        // Create activity via API
        await dashboard.createActivity({ type, description: text })

        // Reload the feed
        await loadActivityFeed()
    } catch (error) {
        console.error('Error updating activity feed:', error)
    }
}

function getActivityIcon(type) {
    const icons = {
        'todo': '✓',
        'inventory': '📦',
        'productivity': '⏱️',
        'maintenance': '🔧',
        'pantone': '🎨',
        'export': '💾',
        'import': '📥'
    }
    return icons[type] || '📌'
}

function formatTimeAgo(date) {
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
    return 'Just now'
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

// Switch view (legacy function)
function switchView(viewName) {
    // This function is kept for backwards compatibility
    // The new dashboard doesn't use tabs, but we keep the analytics functionality
    console.log('Switch view:', viewName)
}

// NOTE: Legacy localStorage-based analytics removed - all data now from API

// Legacy localStorage analytics functions removed - data now loaded via API in loadQuickStats()

// Inventory Analytics (LEGACY - NOT USED)
function loadInventoryAnalytics() {
    try {
        const inventory = storage.get(STORAGE_KEYS.INVENTORY, {})
        const usageHistory = storage.get(STORAGE_KEYS.USAGE_HISTORY, [])

        let totalItems = 0
        let lowStockItems = 0
        let emptyItems = 0

        Object.values(inventory).forEach(printer => {
            Object.values(printer).forEach(category => {
                if (Array.isArray(category)) {
                    totalItems += category.length
                    category.forEach(item => {
                        if (item.stock === 0) emptyItems++
                        else if (item.stock <= 2) lowStockItems++
                    })
                }
            })
        })

        const totalUsage = usageHistory.reduce((sum, record) => sum + Math.abs(record.quantity), 0)

        const html = `
            <div class="stat-item">
                <span class="stat-name">Total Items</span>
                <span class="stat-number">${totalItems}</span>
            </div>
            <div class="stat-item">
                <span class="stat-name">Low Stock</span>
                <span class="stat-number" style="color: ${lowStockItems > 0 ? 'var(--color-warning)' : 'var(--color-success)'}">${lowStockItems}</span>
            </div>
            <div class="stat-item">
                <span class="stat-name">Empty Items</span>
                <span class="stat-number" style="color: ${emptyItems > 0 ? 'var(--color-error)' : 'var(--color-success)'}">${emptyItems}</span>
            </div>
            <div class="stat-item">
                <span class="stat-name">Total Usage</span>
                <span class="stat-number">${totalUsage}</span>
            </div>
        `

        document.getElementById('inventoryAnalytics').innerHTML = html
    } catch (error) {
        console.error('Error loading inventory analytics:', error)
        document.getElementById('inventoryAnalytics').innerHTML = '<div style="color: var(--color-error);">Error loading data</div>'
    }
}

// Productivity Analytics (V4 task-based tracker)
async function loadProductivityAnalytics() {
    try {
        const formatTime = (ms) => {
            const hours = Math.floor(ms / 3600000)
            const mins = Math.floor((ms % 3600000) / 60000)
            return `${hours}h ${mins}m`
        }

        const [statsResp, recentResp] = await Promise.all([
            productivityV4.getStats(),
            productivityV4.getRecentSessions(5)
        ])

        const stats = statsResp.data
        const recent = recentResp.data || []
        const todayTime = stats?.today_time || 0
        const sessionCount = stats?.session_count || 0

        let html = ''

        if (todayTime > 0 || sessionCount > 0) {
            html += `
                <div class="stat-item">
                    <span class="stat-name">Tracked Today</span>
                    <span class="stat-number" style="color: var(--color-primary-light)">${formatTime(todayTime)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-name">Sessions Today</span>
                    <span class="stat-number">${sessionCount}</span>
                </div>
            `
        }

        if (recent.length > 0) {
            const uniqueTasks = [...new Map(recent.map(r => [r.task_name, r])).values()].slice(0, 3)
            html += uniqueTasks.map(t => `
                <div class="stat-item">
                    <span class="stat-name">${t.task_name}</span>
                    <span class="stat-number" style="font-size: var(--text-sm);">${formatTime(t.duration || 0)}</span>
                </div>
            `).join('')
        }

        if (!html) {
            html = '<div style="color: var(--color-text-muted); padding: 1rem;">No productivity data yet</div>'
        }

        document.getElementById('productivityAnalytics').innerHTML = html
    } catch (error) {
        console.error('Error loading productivity analytics:', error)
        document.getElementById('productivityAnalytics').innerHTML = '<div style="color: var(--color-error);">Error loading data</div>'
    }
}

// Pantone Analytics
function loadPantoneAnalytics() {
    try {
        const pantoneColors = storage.get(STORAGE_KEYS.PANTONE_COLORS, [])

        let matched = 0
        let notMatched = 0

        if (Array.isArray(pantoneColors)) {
            pantoneColors.forEach(color => {
                if (color.date && color.date !== '*' && color.date !== 'CBW') {
                    matched++
                } else {
                    notMatched++
                }
            })
        }

        const html = `
            <div class="stat-item">
                <span class="stat-name">Total Colors</span>
                <span class="stat-number">${pantoneColors.length}</span>
            </div>
            <div class="stat-item">
                <span class="stat-name">Matched</span>
                <span class="stat-number" style="color: var(--color-success)">${matched}</span>
            </div>
            <div class="stat-item">
                <span class="stat-name">Not Matched</span>
                <span class="stat-number" style="color: var(--color-warning)">${notMatched}</span>
            </div>
            <div class="stat-item">
                <span class="stat-name">Database Status</span>
                <span class="stat-number" style="font-size: 1rem; color: ${pantoneColors.length > 0 ? 'var(--color-success)' : 'var(--color-text-muted)'}">${pantoneColors.length > 0 ? 'Active' : 'Empty'}</span>
            </div>
        `

        document.getElementById('pantoneAnalytics').innerHTML = html
    } catch (error) {
        console.error('Error loading Pantone analytics:', error)
        document.getElementById('pantoneAnalytics').innerHTML = '<div style="color: var(--color-error);">Error loading data</div>'
    }
}

// Maintenance Analytics
function loadMaintenanceAnalytics() {
    try {
        const maintenanceData = storage.get(STORAGE_KEYS.MAINTENANCE, {})

        const issues = maintenanceData.issues || []
        const recurringTasks = maintenanceData.recurringTasks || []
        const techVisits = maintenanceData.techVisits || []

        const inProgressIssues = issues.filter(i => i.status === 'in-progress').length
        const resolvedIssues = issues.filter(i => i.status === 'resolved').length
        const totalTimeSpent = issues.reduce((sum, i) => sum + (parseInt(i.timeSpent) || 0), 0)

        const html = `
            <div class="stat-item">
                <span class="stat-name">In Progress Issues</span>
                <span class="stat-number" style="color: ${inProgressIssues > 0 ? 'var(--color-warning)' : 'var(--color-success)'}">${inProgressIssues}</span>
            </div>
            <div class="stat-item">
                <span class="stat-name">Resolved Issues</span>
                <span class="stat-number">${resolvedIssues}</span>
            </div>
            <div class="stat-item">
                <span class="stat-name">Total Time Spent</span>
                <span class="stat-number">${totalTimeSpent} min</span>
            </div>
            <div class="stat-item">
                <span class="stat-name">Recurring Tasks</span>
                <span class="stat-number">${recurringTasks.length}</span>
            </div>
            <div class="stat-item">
                <span class="stat-name">Tech Visits</span>
                <span class="stat-number">${techVisits.length}</span>
            </div>
        `

        document.getElementById('maintenanceAnalytics').innerHTML = html
    } catch (error) {
        console.error('Error loading maintenance analytics:', error)
        document.getElementById('maintenanceAnalytics').innerHTML = '<div style="color: var(--color-error);">Error loading data</div>'
    }
}

// Top Used Items
function loadTopUsedItems() {
    try {
        const usageHistory = storage.get(STORAGE_KEYS.USAGE_HISTORY, [])

        const itemUsage = {}
        usageHistory.forEach(record => {
            const key = record.itemId
            if (!itemUsage[key]) {
                itemUsage[key] = { name: record.itemName, count: 0 }
            }
            itemUsage[key].count += Math.abs(record.quantity)
        })

        const topItems = Object.values(itemUsage)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)

        const html = topItems.length > 0
            ? topItems.map(item => `
                <div class="stat-item">
                    <span class="stat-name">${item.name}</span>
                    <span class="stat-number">${item.count}</span>
                </div>
            `).join('')
            : '<div style="color: var(--color-text-muted); padding: 1rem;">No usage data yet</div>'

        document.getElementById('topUsedItems').innerHTML = html
    } catch (error) {
        console.error('Error loading top used items:', error)
        document.getElementById('topUsedItems').innerHTML = '<div style="color: var(--color-error);">Error loading data</div>'
    }
}

// Top Tasks
function loadTopTasks() {
    try {
        const taskTotals = storage.get(STORAGE_KEYS.TASK_TOTALS, {})

        const tasks = Object.entries(taskTotals)
            .map(([key, duration]) => {
                const parts = key.split('-')
                const taskName = parts.slice(1).join('-')
                return { name: taskName, duration }
            })
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 5)

        const formatTime = (ms) => {
            const hours = Math.floor(ms / 3600000)
            const mins = Math.floor((ms % 3600000) / 60000)
            return `${hours}h ${mins}m`
        }

        const html = tasks.length > 0
            ? tasks.map(task => `
                <div class="stat-item">
                    <span class="stat-name">${task.name}</span>
                    <span class="stat-number">${formatTime(task.duration)}</span>
                </div>
            `).join('')
            : '<div style="color: var(--color-text-muted); padding: 1rem;">No task data yet</div>'

        document.getElementById('topTasks').innerHTML = html
    } catch (error) {
        console.error('Error loading top tasks:', error)
        document.getElementById('topTasks').innerHTML = '<div style="color: var(--color-error);">Error loading data</div>'
    }
}

// Export all data
function exportData() {
    try {
        exportAllData()
        alert('✓ All data exported successfully!')
        updateActivityFeed('export', 'Exported all data')
    } catch (error) {
        console.error('Error exporting data:', error)
        alert('Error exporting data. Check console for details.')
    }
}

// ============================================================================
// MAINTENANCE REMINDER
// ============================================================================

async function loadMaintenanceReminder() {
    try {
        // Use 5-minute cache
        const now = Date.now()
        if (dashboardState.maintenanceReminder &&
            (now - dashboardState.maintenanceReminderLastFetch) < 300000) {
            updateReminderUI(dashboardState.maintenanceReminder)
            return
        }

        const response = await dashboard.getMaintenanceReminder()
        const data = response.data || response

        dashboardState.maintenanceReminder = data
        dashboardState.maintenanceReminderLastFetch = now

        updateReminderUI(data)
    } catch (error) {
        console.error('Error loading maintenance reminder:', error)
        document.getElementById('maintenanceReminderBanner').classList.add('hidden')
    }
}

function updateReminderUI(data) {
    const banner = document.getElementById('maintenanceReminderBanner')

    // Hide if no equipment configured or all items are 'ok'
    if (!data.hasEquipment || !data.items?.length) {
        banner.classList.add('hidden')
        return
    }

    // Show the most urgent item (items are already sorted by priority)
    const item = data.items[0]

    // Hide banner if everything is on schedule (ok status)
    if (item.status === 'ok') {
        banner.classList.add('hidden')
        return
    }

    banner.classList.remove('hidden')

    const statusConfig = {
        'upcoming': {
            icon: '🔧',
            badge: 'Upcoming',
            message: `Due in ${item.daysUntilDue} day${item.daysUntilDue !== 1 ? 's' : ''}`
        },
        'due_today': {
            icon: '⚠️',
            badge: 'Due Today',
            message: 'Maintenance is due today'
        },
        'overdue': {
            icon: '🚨',
            badge: 'OVERDUE',
            message: `${item.daysOverdue} day${item.daysOverdue !== 1 ? 's' : ''} overdue`
        }
    }

    const cfg = statusConfig[item.status] || statusConfig['upcoming']
    document.getElementById('reminderTitle').textContent = `${item.name} Maintenance`
    document.getElementById('reminderIcon').textContent = cfg.icon
    document.getElementById('reminderStatusBadge').textContent = cfg.badge
    document.getElementById('reminderStatusBadge').className = `reminder-status-badge ${item.status}`
    document.getElementById('reminderMessage').textContent = cfg.message
    document.getElementById('reminderActionBtn').textContent = 'Mark Complete'
}

async function handleReminderAction() {
    const data = dashboardState.maintenanceReminder
    if (!data?.items?.length) return
    openMaintenanceLogModal(data.items[0])
}

function openMaintenanceLogModal(equipmentItem) {
    const modal = document.getElementById('maintenanceLogModal')
    document.getElementById('logDate').value = new Date().toISOString().split('T')[0]
    const now = new Date()
    document.getElementById('logTime').value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

    // Store equipment context on the form for submit
    const form = document.getElementById('maintenanceLogForm')
    form.dataset.equipmentName = equipmentItem?.name || ''
    form.dataset.equipmentId = equipmentItem?.id || ''

    const title = document.getElementById('maintenanceLogModalTitle')
    if (title) title.textContent = equipmentItem ? `${equipmentItem.name} — Maintenance Log` : 'Maintenance Log'

    modal.style.display = 'flex'
    form.onsubmit = handleMaintenanceLogSubmit
}

function closeMaintenanceLogModal() {
    document.getElementById('maintenanceLogModal').style.display = 'none'
}

async function handleMaintenanceLogSubmit(e) {
    e.preventDefault()

    const form = document.getElementById('maintenanceLogForm')
    const equipmentName = form.dataset.equipmentName
    const logData = {
        date: document.getElementById('logDate').value,
        time: document.getElementById('logTime').value || null,
        machines: equipmentName ? [equipmentName] : [],
        description: equipmentName ? `${equipmentName} maintenance` : 'Scheduled maintenance',
        notes: document.getElementById('logNotes').value || null,
        performed_by: document.getElementById('logPerformedBy').value || null
    }

    try {
        await maintenance.createLog(logData)
        closeMaintenanceLogModal()
        alert('✓ Maintenance log saved!')

        // Clear cache and reload
        dashboardState.maintenanceReminder = null
        await loadMaintenanceReminder()

        // Update activity feed
        await loadActivityFeed()
    } catch (error) {
        console.error('Error saving log:', error)
        alert(`Error: ${error.message || 'Failed to save maintenance log'}`)
    }
}

// ============================================================================
// SHIFT COUNTDOWN WIDGET
// ============================================================================

/**
 * Initialize the shift countdown widget
 */
async function initializeCountdownWidget() {
    try {
        // Fetch user's configured shift length
        const shiftResponse = await users.getShiftLength()
        dashboardState.userShiftLength = shiftResponse.data?.shift_length_hours || shiftResponse.shift_length_hours || 8

        // Start countdown updates
        updateCountdown() // Immediate first update
        intervals.countdown = setInterval(updateCountdown, 1000) // Update every second

        // Attach configure button handler
        const configureBtn = document.getElementById('configureShift')
        if (configureBtn) {
            configureBtn.addEventListener('click', configureShiftLength)
        }
    } catch (error) {
        console.error('Failed to initialize countdown widget:', error)
        showCountdownError()
    }
}

/**
 * Update countdown display
 */
async function updateCountdown() {
    try {
        // Fetch current clock status
        const statusResponse = await productivity.getClockStatus()
        const status = statusResponse.data || statusResponse
        dashboardState.clockStatus = status  // Cache for screensaver

        const display = document.getElementById('countdownDisplay')
        if (!display) return

        if (!status.clocked_in) {
            // Not clocked in - show clock in button
            const clockInTime = new Date()
            const timeStr = `${String(clockInTime.getHours()).padStart(2, '0')}:${String(clockInTime.getMinutes()).padStart(2, '0')}`

            display.innerHTML = `
                <div class="countdown-not-clocked">
                    <p class="countdown-status">Not clocked in</p>
                    <p class="countdown-hint">Start your shift timer</p>
                    <div class="countdown-actions">
                        <button class="btn btn-primary countdown-btn" id="clockInBtn">
                            🕐 Clock In (${timeStr})
                        </button>
                    </div>
                </div>
            `

            // Attach clock in handler
            const clockInBtn = document.getElementById('clockInBtn')
            if (clockInBtn) {
                clockInBtn.onclick = handleClockIn
            }
        } else {
            // Clocked in - calculate and show countdown
            const clockInTime = status.entry.clock_in // milliseconds
            const timecardId = status.entry.id
            const shiftEndTime = clockInTime + (dashboardState.userShiftLength * 3600000) // Convert hours to ms
            const now = Date.now()
            const remaining = shiftEndTime - now

            // Format clock in time for display
            const clockInDate = new Date(clockInTime)
            const clockInStr = `${String(clockInDate.getHours()).padStart(2, '0')}:${String(clockInDate.getMinutes()).padStart(2, '0')}`

            if (remaining > 0) {
                // Still time remaining in shift
                const hours = Math.floor(remaining / 3600000)
                const minutes = Math.floor((remaining % 3600000) / 60000)
                const seconds = Math.floor((remaining % 60000) / 1000)

                display.innerHTML = `
                    <div class="countdown-active">
                        <div class="countdown-time">
                            ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}
                        </div>
                        <p class="countdown-label">remaining in ${dashboardState.userShiftLength}h shift</p>
                        <p class="countdown-clock-in-time">Clocked in at ${clockInStr}</p>
                        <div class="countdown-actions">
                            <button class="btn btn-secondary btn-sm countdown-btn-sm" id="adjustClockInBtn" data-timecard-id="${timecardId}">
                                ✏️ Adjust
                            </button>
                            <button class="btn btn-primary btn-sm countdown-btn-sm" id="clockOutBtn">
                                🕐 Clock Out
                            </button>
                        </div>
                    </div>
                `
            } else {
                // Shift ended - show overtime
                const overtime = Math.abs(remaining)
                const hours = Math.floor(overtime / 3600000)
                const minutes = Math.floor((overtime % 3600000) / 60000)
                const seconds = Math.floor((overtime % 60000) / 1000)

                display.innerHTML = `
                    <div class="countdown-overtime">
                        <div class="countdown-time overtime">
                            +${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}
                        </div>
                        <p class="countdown-label">overtime (shift ended)</p>
                        <p class="countdown-clock-in-time">Clocked in at ${clockInStr}</p>
                        <div class="countdown-actions">
                            <button class="btn btn-secondary btn-sm countdown-btn-sm" id="adjustClockInBtn" data-timecard-id="${timecardId}">
                                ✏️ Adjust
                            </button>
                            <button class="btn btn-primary btn-sm countdown-btn-sm" id="clockOutBtn">
                                🕐 Clock Out
                            </button>
                        </div>
                    </div>
                `
            }

            // Attach event handlers
            const clockOutBtn = document.getElementById('clockOutBtn')
            if (clockOutBtn) {
                clockOutBtn.onclick = handleClockOut
            }

            const adjustBtn = document.getElementById('adjustClockInBtn')
            if (adjustBtn) {
                adjustBtn.onclick = handleAdjustClockIn
            }
        }
    } catch (error) {
        console.error('Failed to update countdown:', error)
        showCountdownError()
    }
}

/**
 * Show countdown error state
 */
function showCountdownError() {
    const display = document.getElementById('countdownDisplay')
    if (display) {
        display.innerHTML = `
            <div class="countdown-error">
                <p>⚠️ Unable to load countdown</p>
            </div>
        `
    }
}

/**
 * Handle clock in from dashboard
 */
async function handleClockIn() {
    try {
        const now = Date.now()
        await productivity.clockIn(now)

        if (window.toast) {
            window.toast.success('Clocked in successfully!')
        }

        // Immediate update to show new state
        await updateCountdown()

        // Refresh quick stats to update "Today's Time"
        await loadQuickStats()
    } catch (error) {
        console.error('Failed to clock in:', error)
        if (window.toast) {
            window.toast.error(`Failed to clock in: ${error.message}`)
        } else {
            alert(`Error: ${error.message || 'Failed to clock in'}`)
        }
    }
}

/**
 * Handle clock out from dashboard
 */
async function handleClockOut() {
    if (!confirm('Are you sure you want to clock out?')) {
        return
    }

    try {
        const now = Date.now()
        await productivity.clockOut(now)

        if (window.toast) {
            window.toast.success('Clocked out successfully!')
        }

        // Immediate update to show new state
        await updateCountdown()

        // Refresh quick stats to update "Today's Time"
        await loadQuickStats()
    } catch (error) {
        console.error('Failed to clock out:', error)
        if (window.toast) {
            window.toast.error(`Failed to clock out: ${error.message}`)
        } else {
            alert(`Error: ${error.message || 'Failed to clock out'}`)
        }
    }
}

/**
 * Handle adjust clock in time
 */
async function handleAdjustClockIn(event) {
    const timecardId = event.target.dataset.timecardId

    if (!timecardId) {
        if (window.toast) {
            window.toast.error('Unable to find timecard entry')
        }
        return
    }

    // Get current clock in time
    const statusResponse = await productivity.getClockStatus()
    const status = statusResponse.data || statusResponse

    if (!status.clocked_in) {
        if (window.toast) {
            window.toast.error('Not currently clocked in')
        }
        return
    }

    const currentClockIn = new Date(status.entry.clock_in)
    const currentTimeStr = `${String(currentClockIn.getHours()).padStart(2, '0')}:${String(currentClockIn.getMinutes()).padStart(2, '0')}`

    // Prompt for new clock in time
    const newTimeStr = prompt(
        `Adjust your clock in time:\n\nCurrent: ${currentTimeStr}\n\nEnter new time (HH:MM format, 24-hour):`,
        currentTimeStr
    )

    if (newTimeStr === null) return // Cancelled

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/
    if (!timeRegex.test(newTimeStr)) {
        alert('Invalid time format. Please use HH:MM (e.g., 09:30 or 14:45)')
        return
    }

    // Parse new time
    const [hours, minutes] = newTimeStr.split(':').map(Number)

    // Create new Date with today's date and the specified time
    const newClockIn = new Date()
    newClockIn.setHours(hours, minutes, 0, 0)

    // Validate that new time is not in the future
    if (newClockIn > new Date()) {
        alert('Clock in time cannot be in the future')
        return
    }

    // Validate that new time is not more than 24 hours in the past
    const oneDayAgo = new Date().getTime() - (24 * 3600000)
    if (newClockIn.getTime() < oneDayAgo) {
        if (!confirm('This time is more than 24 hours ago. Are you sure?')) {
            return
        }
    }

    try {
        // Update timecard entry
        await productivity.updateTimecardEntry(timecardId, {
            clock_in: newClockIn.getTime()
        })

        if (window.toast) {
            window.toast.success(`Clock in time adjusted to ${newTimeStr}`)
        }

        // Immediate update to show new countdown
        await updateCountdown()

        // Refresh quick stats
        await loadQuickStats()
    } catch (error) {
        console.error('Failed to adjust clock in time:', error)
        if (window.toast) {
            window.toast.error(`Failed to adjust time: ${error.message}`)
        } else {
            alert(`Error: ${error.message || 'Failed to adjust clock in time'}`)
        }
    }
}

/**
 * Configure shift length
 */
async function configureShiftLength() {
    // Show modal to configure shift length
    const newLength = prompt(
        `Set your standard shift length (hours):\n\nCurrent: ${dashboardState.userShiftLength} hours`,
        dashboardState.userShiftLength
    )

    if (newLength === null) return // Cancelled

    const hours = parseInt(newLength, 10)
    if (isNaN(hours) || hours < 1 || hours > 24) {
        alert('Please enter a valid shift length between 1 and 24 hours')
        return
    }

    try {
        await users.updateShiftLength(hours)
        dashboardState.userShiftLength = hours
        updateCountdown() // Immediate update with new length
        if (window.toast) {
            window.toast.success(`Shift length updated to ${hours} hours`)
        } else {
            alert(`Shift length updated to ${hours} hours`)
        }
    } catch (error) {
        console.error('Failed to update shift length:', error)
        if (window.toast) {
            window.toast.error('Failed to update shift length. Please try again.')
        } else {
            alert('Failed to update shift length. Please try again.')
        }
    }
}

// Clean up all intervals on page unload
window.addEventListener('beforeunload', () => {
    Object.values(intervals).forEach(id => id && clearInterval(id))
    if (productivityWidgetState.pollingInterval) clearInterval(productivityWidgetState.pollingInterval)
    if (productivityWidgetState.timerInterval) clearInterval(productivityWidgetState.timerInterval)
})

// ============================================================================
// PRODUCTIVITY TRACKER WIDGET (V4)
// ============================================================================

let productivityWidgetState = {
    timerInterval: null,
    pollingInterval: null,
    activeSession: null,
    initialized: false
}

/**
 * Initialize productivity tracker widget
 */
async function initProductivityWidget() {
    await updateProductivityWidget()

    // Poll for updates every 3 seconds
    productivityWidgetState.pollingInterval = setInterval(updateProductivityWidget, 3000)

    // Setup stop button handler
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'btnStopTracking') {
            await stopProductivityTracking()
        }
    })
}

/**
 * Update productivity widget with current session
 */
async function updateProductivityWidget() {
    const container = document.getElementById('productivityTracker')
    if (!container) return

    try {
        const response = await productivityV4.getSession()
        const session = response.data

        if (!session) {
            if (productivityWidgetState.activeSession || !productivityWidgetState.initialized) {
                // Session just ended or first load — show idle state with today's stats
                productivityWidgetState.activeSession = null
                productivityWidgetState.initialized = true
                stopProductivityTimer()
                await renderIdleProductivityWidget(container)
            }
            return
        }

        // Same session — update timer element in-place (no HTML rebuild = no jump)
        if (productivityWidgetState.activeSession?.task_id === session.task_id) {
            const timerEl = document.getElementById('productivityTimer')
            if (timerEl) timerEl.textContent = formatDuration(Math.floor((Date.now() - session.start_time) / 1000))
            return
        }

        // New or changed session — full rebuild
        productivityWidgetState.activeSession = session

        // Fetch today's stats for context
        let todayTotal = ''
        try {
            const statsResp = await productivityV4.getStats()
            const stats = statsResp.data
            if (stats && stats.today_time) {
                todayTotal = `<div style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:var(--spacing-sm);">Today: ${formatDuration(Math.floor(stats.today_time / 1000))} tracked</div>`
            }
        } catch (e) { /* ignore */ }

        container.innerHTML = `
            <div style="text-align:center;padding:var(--spacing-md);">
                <div style="font-size:var(--text-lg);font-weight:600;color:var(--color-text-primary);margin-bottom:var(--spacing-xs);">
                    ${session.task_name}
                </div>
                <div id="productivityTimer" style="font-size:var(--text-3xl);font-family:'JetBrains Mono',monospace;color:var(--color-primary);margin-bottom:var(--spacing-md);letter-spacing:0.05em;">
                    ${formatDuration(Math.floor((Date.now() - session.start_time) / 1000))}
                </div>
                <button id="btnStopTracking" class="btn btn-sm" style="background:var(--color-error);color:#fff;">
                    Stop Tracking
                </button>
                ${todayTotal}
            </div>
        `

        stopProductivityTimer()
        startProductivityTimer()
    } catch (error) {
        console.error('Failed to update productivity widget:', error)
        container.innerHTML = '<div class="empty-state-sm">Error loading</div>'
    }
}

/**
 * Render the idle state for the productivity widget with today's stats and recent tasks
 */
async function renderIdleProductivityWidget(container) {
    let statsHtml = ''
    let recentHtml = ''

    try {
        const [statsResp, recentResp] = await Promise.all([
            productivityV4.getStats(),
            productivityV4.getRecentSessions(5)
        ])

        const stats = statsResp.data
        if (stats) {
            const todayMs = stats.today_time || 0
            const sessionsToday = stats.session_count || 0
            statsHtml = `
                <div style="display:flex;justify-content:space-around;margin-bottom:var(--spacing-md);padding:var(--spacing-sm) 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div style="text-align:center;">
                        <div style="font-size:var(--text-xl);font-weight:700;font-family:var(--font-mono);color:var(--color-primary);">${formatDuration(Math.floor(todayMs / 1000))}</div>
                        <div style="font-size:var(--text-xs);color:var(--color-text-muted);">Today</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:var(--text-xl);font-weight:700;font-family:var(--font-mono);color:var(--color-text-primary);">${sessionsToday}</div>
                        <div style="font-size:var(--text-xs);color:var(--color-text-muted);">Sessions</div>
                    </div>
                </div>
            `
        }

        const recent = recentResp.data
        if (recent && recent.length > 0) {
            const uniqueTasks = [...new Map(recent.map(r => [r.task_id, r])).values()].slice(0, 3)
            recentHtml = `
                <div style="font-size:var(--text-xs);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:var(--spacing-xs);">Quick Start</div>
                ${uniqueTasks.map(t => `
                    <button class="btn-quick-start" onclick="window.dashboardApp.quickStartTask(${t.task_id})" style="display:block;width:100%;text-align:left;padding:var(--spacing-xs) var(--spacing-sm);margin-bottom:2px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radius-sm);color:var(--color-text-secondary);font-size:var(--text-sm);cursor:pointer;transition:all 0.15s;"
                        onmouseover="this.style.background='rgba(255,255,255,0.08)';this.style.color='var(--color-text-primary)'"
                        onmouseout="this.style.background='rgba(255,255,255,0.03)';this.style.color='var(--color-text-secondary)'"
                    >▶ ${t.task_name}</button>
                `).join('')}
            `
        }
    } catch (e) {
        console.error('Failed to load productivity stats:', e)
    }

    container.innerHTML = `
        <div style="padding:var(--spacing-sm);">
            ${statsHtml || '<div style="text-align:center;color:var(--color-text-muted);font-size:var(--text-sm);margin-bottom:var(--spacing-md);">No tracking data today</div>'}
            ${recentHtml || '<div style="text-align:center;color:var(--color-text-muted);font-size:var(--text-sm);">Not tracking</div>'}
        </div>
    `
}

/**
 * Start timer for productivity widget
 */
function startProductivityTimer() {
    stopProductivityTimer() // Clear any existing timer

    productivityWidgetState.timerInterval = setInterval(() => {
        if (!productivityWidgetState.activeSession) {
            stopProductivityTimer()
            return
        }

        const timerEl = document.getElementById('productivityTimer')
        if (timerEl) {
            const elapsed = Math.floor((Date.now() - productivityWidgetState.activeSession.start_time) / 1000)
            timerEl.textContent = formatDuration(elapsed)
        }
    }, 1000)
}

/**
 * Stop productivity timer
 */
function stopProductivityTimer() {
    if (productivityWidgetState.timerInterval) {
        clearInterval(productivityWidgetState.timerInterval)
        productivityWidgetState.timerInterval = null
    }
}

/**
 * Stop tracking from dashboard widget
 */
async function stopProductivityTracking() {
    try {
        await productivityV4.stopTracking()
        productivityWidgetState.activeSession = null
        stopProductivityTimer()
        await updateProductivityWidget()
        await loadQuickStats() // Refresh productivity stats
        toast.success('Stopped tracking')
    } catch (error) {
        console.error('Failed to stop tracking:', error)
        toast.error('Failed to stop tracking')
    }
}

/**
 * Quick-start a task from the dashboard widget
 */
async function quickStartTask(taskId) {
    try {
        await productivityV4.startTracking(taskId)
        await updateProductivityWidget()
        toast.success('Started tracking')
    } catch (error) {
        console.error('Failed to start tracking:', error)
        toast.error('Failed to start tracking')
    }
}

// ============================================================================
// PAGE VISIBILITY — PAUSE/RESUME ALL POLLING
// ============================================================================

function pauseAllPolling() {
    Object.keys(intervals).forEach(key => {
        if (intervals[key]) {
            clearInterval(intervals[key])
            intervals[key] = null
        }
    })
    if (productivityWidgetState.pollingInterval) {
        clearInterval(productivityWidgetState.pollingInterval)
        productivityWidgetState.pollingInterval = null
    }
    if (productivityWidgetState.timerInterval) {
        clearInterval(productivityWidgetState.timerInterval)
        productivityWidgetState.timerInterval = null
    }
}

function resumeAllPolling() {
    // Immediately refresh each section, then restart its interval
    updateClock()
    intervals.clock = setInterval(updateClock, le(1000, 60000))

    updateCountdown()
    intervals.countdown = setInterval(updateCountdown, le(1000, 60000))

    loadQuickStats()
    intervals.stats = setInterval(loadQuickStats, le(30000, 300000))

    loadResourceStats()
    intervals.resources = setInterval(loadResourceStats, le(30000, 300000))

    loadActivityFeed()
    intervals.activity = setInterval(loadActivityFeed, le(30000, 300000))

    renderWeekView()
    intervals.calendar = setInterval(renderWeekView, le(300000, 900000))

    loadMaintenanceReminder()
    intervals.maintenanceReminder = setInterval(loadMaintenanceReminder, le(300000, 900000))

    updateProductivityWidget()
    productivityWidgetState.pollingInterval = setInterval(updateProductivityWidget, le(3000, 30000))
    // Note: timerInterval is restarted by updateProductivityWidget when an active session exists
}

// Re-init intervals when low energy mode is toggled
window.addEventListener('lowenergychange', () => {
    pauseAllPolling()
    resumeAllPolling()
})

// ============================================================================
// SCREENSAVER HUD
// ============================================================================

const SCREENSAVER_TIMEOUT = 10 * 60 * 1000  // 10 minutes
const SS_WIDGET_KEY = 'app:screensaver:widgets'
const SS_ALL_WIDGETS = ['timeclock', 'todos', 'stats']
const SS_DEFAULT_WIDGETS = ['timeclock', 'todos', 'stats']

function getSsEnabledWidgets() {
    try {
        const saved = JSON.parse(localStorage.getItem(SS_WIDGET_KEY))
        return Array.isArray(saved) ? saved : SS_DEFAULT_WIDGETS
    } catch {
        return SS_DEFAULT_WIDGETS
    }
}

function initScreensaver() {
    const overlay = document.getElementById('screensaver')
    if (!overlay) return

    let inactivityTimer = null
    let ssClockInterval = null
    let ssRefreshInterval = null

    function updateSsClock() {
        const now = new Date()
        const el = document.getElementById('ssClock')
        if (el) {
            el.textContent =
                `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
        }
    }

    function applyWidgetVisibility() {
        const enabled = getSsEnabledWidgets()

        const dateStatusEl = document.getElementById('ssDateStatus')
        if (dateStatusEl) dateStatusEl.style.display = enabled.includes('timeclock') ? '' : 'none'

        const panelTodos = document.getElementById('ssPanelTodos')
        if (panelTodos) panelTodos.style.display = enabled.includes('todos') ? '' : 'none'

        const panelStats = document.getElementById('ssPanelStats')
        if (panelStats) panelStats.style.display = enabled.includes('stats') ? '' : 'none'

        // Hide the grid row + dividers if both panels are disabled
        const ssGrid = document.getElementById('ssGrid')
        const ssDivider1 = document.getElementById('ssDivider1')
        const ssDivider2 = document.getElementById('ssDivider2')
        const anyPanel = enabled.includes('todos') || enabled.includes('stats')
        if (ssGrid) ssGrid.style.display = anyPanel ? '' : 'none'
        if (ssDivider1) ssDivider1.style.display = anyPanel ? '' : 'none'
        if (ssDivider2) ssDivider2.style.display = anyPanel ? '' : 'none'
    }

    function updateScreensaverContent() {
        const now = new Date()
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

        // Clock status from cached state
        let clockStatusText = 'Not clocked in'
        if (dashboardState.clockStatus?.clocked_in) {
            const elapsed = Date.now() - dashboardState.clockStatus.entry.clock_in
            clockStatusText = `Clocked in: ${formatDuration(Math.floor(elapsed / 1000))}`
        }

        const dateStatusEl = document.getElementById('ssDateStatus')
        if (dateStatusEl) dateStatusEl.textContent = `${dateStr}  •  ${clockStatusText}`

        // Open todos (max 5)
        const openTodos = dashboardState.todos.filter(t => !t.completed).slice(0, 5)
        const todosEl = document.getElementById('ssTodos')
        if (todosEl) {
            todosEl.innerHTML = openTodos.length > 0
                ? openTodos.map(t => `<div class="ss-todo">▸ ${escapeHtml(t.text)}</div>`).join('')
                : '<div class="ss-empty">No open tasks</div>'
        }

        // Stats from cached state
        const stats = dashboardState.lastStats || {}
        const activeIssues = stats.maintenance?.activeIssues || 0
        const lowStock = stats.inventory?.lowStock || 0
        const statsEl = document.getElementById('ssStats')
        if (statsEl) {
            let statsHtml = `<div class="ss-stat">🔧 ${activeIssues} open issue${activeIssues !== 1 ? 's' : ''}</div>`
            if (lowStock > 0) {
                statsHtml += `<div class="ss-stat">📦 ${lowStock} item${lowStock !== 1 ? 's' : ''} low stock</div>`
            }
            statsEl.innerHTML = statsHtml
        }

        applyWidgetVisibility()
        updateSsClock()
    }

    function showScreensaver() {
        updateScreensaverContent()
        overlay.style.display = 'flex'
        ssClockInterval = setInterval(updateSsClock, 1000)
        ssRefreshInterval = setInterval(updateScreensaverContent, 60000)
    }

    function hideScreensaver() {
        overlay.style.display = 'none'
        document.getElementById('ssSettingsPanel')?.classList.remove('visible')
        clearInterval(ssClockInterval)
        clearInterval(ssRefreshInterval)
        ssClockInterval = null
        ssRefreshInterval = null
        resetTimer()
    }

    function resetTimer() {
        clearTimeout(inactivityTimer)
        inactivityTimer = setTimeout(showScreensaver, SCREENSAVER_TIMEOUT)
    }

    // Settings button: toggle panel without dismissing screensaver
    const settingsBtn = document.getElementById('ssSettingsBtn')
    const settingsPanel = document.getElementById('ssSettingsPanel')
    if (settingsBtn && settingsPanel) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            const isVisible = settingsPanel.classList.toggle('visible')
            if (isVisible) {
                // Populate checkboxes from saved prefs
                const enabled = getSsEnabledWidgets()
                settingsPanel.querySelectorAll('input[data-widget]').forEach(cb => {
                    cb.checked = enabled.includes(cb.dataset.widget)
                })
            }
        })

        const saveBtn = document.getElementById('ssSaveSettings')
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                const chosen = []
                settingsPanel.querySelectorAll('input[data-widget]').forEach(cb => {
                    if (cb.checked) chosen.push(cb.dataset.widget)
                })
                localStorage.setItem(SS_WIDGET_KEY, JSON.stringify(chosen))
                applyWidgetVisibility()
                settingsPanel.classList.remove('visible')
            })
        }
    }

    // Dismiss screensaver on click / keydown / touch (NOT mousemove)
    ;['click', 'keydown', 'touchstart'].forEach(evt =>
        document.addEventListener(evt, (e) => {
            if (evt === 'click') {
                // Ignore clicks on the header screensaver button — it calls showScreensaver() itself
                if (e.target?.closest?.('#headerScreensaverBtn')) return
                // Ignore clicks inside the settings panel or button
                if (e.target?.closest?.('#ssSettingsPanel') || e.target?.closest?.('#ssSettingsBtn')) return
            }
            if (overlay.style.display !== 'none') hideScreensaver()
            else resetTimer()
        }, { passive: true })
    )

    // mousemove / scroll only reset inactivity timer — never dismiss screensaver
    ;['mousemove', 'scroll'].forEach(evt =>
        document.addEventListener(evt, () => {
            if (overlay.style.display === 'none') resetTimer()
        }, { passive: true })
    )

    // Allow manual trigger from header screensaver button
    window.addEventListener('screensaver:trigger', showScreensaver)

    resetTimer()
}

// ============================================================================
// KEYBOARD SHORTCUTS & HELP MODAL
// ============================================================================

function openShortcutsModal() {
    const modal = document.getElementById('shortcutsModal')
    if (modal) modal.style.display = 'flex'
}

function closeShortcutsModal() {
    const modal = document.getElementById('shortcutsModal')
    if (modal) modal.style.display = 'none'
}

function initKeyboardShortcuts() {
    // Help button click
    const helpBtn = document.getElementById('helpBtn')
    if (helpBtn) {
        helpBtn.addEventListener('click', openShortcutsModal)
    }

    // Close modal on backdrop click
    const modal = document.getElementById('shortcutsModal')
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeShortcutsModal()
        })
    }

    document.addEventListener('keydown', (e) => {
        // Ignore if focused on an input element
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

        if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
            e.preventDefault()
            openShortcutsModal()
        } else if (e.key === 'Escape') {
            closeShortcutsModal()
            closeMaintenanceLogModal()
        } else if (e.key === 't' || e.key === 'T') {
            e.preventDefault()
            const todoInput = document.getElementById('todoInput')
            if (todoInput) todoInput.focus()
        }
    })
}

// Initialize app
function initApp() {
    init()
    initKeyboardShortcuts()
    initScreensaver()

    // Pause all polling when tab is hidden; resume and refresh immediately on return
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseAllPolling()
        else resumeAllPolling()
    })

    // Expose API
    window.launcherApp = {
        switchView,
        exportAllData: exportData,
        showDayDetail,
        openShortcutsModal,
        closeShortcutsModal
    }

    window.dashboardApp = {
        addTodo,
        toggleTodo,
        deleteTodo,
        clearCompleted,
        quickStartTask
    }

    window.maintenanceReminderApp = {
        handleAction: handleReminderAction,
        closeModal: closeMaintenanceLogModal
    }
}

// Run on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp)
} else {
    initApp()
}
