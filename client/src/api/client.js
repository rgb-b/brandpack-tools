/**
 * API Client
 * Unified interface for backend API calls.
 */

import toast from '../shared/components/Toast.js'

const API_BASE = '/api/v1'

/**
 * Make an API request
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Response data
 */
const REQUEST_TIMEOUT_MS = 15000

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || REQUEST_TIMEOUT_MS)

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    credentials: 'include',
    signal: controller.signal,
    ...options
  }

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body)
  }

  try {
    const response = await fetch(url, config)

    // Parse JSON safely — server may return HTML on error
    let data
    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      data = await response.json()
    } else {
      const text = await response.text()
      data = { message: text || `API Error: ${response.status}` }
    }

    if (!response.ok) {
      throw new Error(data.message || `API Error: ${response.status}`)
    }

    return data
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Request timeout: ${endpoint}`)
      toast.error('Request timeout - please try again')
      throw timeoutError
    }
    console.error(`API Error [${endpoint}]:`, error)

    // Show error toast for network/server errors
    const errorMessage = error.message || 'An error occurred'
    if (!errorMessage.includes('401') && !errorMessage.includes('Unauthorized')) {
      toast.error(errorMessage)
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// ============================================================================
// INVENTORY API
// ============================================================================

export const inventory = {
  /**
   * Get all inventory items
   * @param {Object} filters - Optional filters { printer, category }
   */
  async getAll(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/inventory${query}`)
  },

  /**
   * Get single inventory item by ID
   */
  async getById(id) {
    return request(`/inventory/${encodeURIComponent(id)}`)
  },

  /**
   * Get inventory item by barcode
   */
  async getByBarcode(barcode) {
    return request(`/inventory/barcode/${encodeURIComponent(barcode)}`)
  },

  /**
   * Get critical stock items
   */
  async getCritical() {
    return request('/inventory/critical')
  },

  /**
   * Get usage history
   */
  async getUsageHistory(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/inventory/usage${query}`)
  },

  /**
   * Create new inventory item
   */
  async create(item) {
    return request('/inventory', {
      method: 'POST',
      body: item
    })
  },

  /**
   * Bulk create inventory items
   * @param {Array} items - Array of inventory items to create
   */
  async bulkCreate(items) {
    return request('/inventory/bulk', {
      method: 'POST',
      body: { items }
    })
  },

  /**
   * Update inventory item
   */
  async update(id, updates) {
    return request(`/inventory/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: updates
    })
  },

  /**
   * Delete inventory item
   */
  async delete(id) {
    return request(`/inventory/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
  }
}

// ============================================================================
// PRODUCTIVITY API
// ============================================================================

export const productivity = {
  /**
   * Get all tasks
   */
  async getTasks() {
    return request('/productivity/tasks')
  },

  /**
   * Add new task
   */
  async addTask(status, name) {
    return request('/productivity/tasks', {
      method: 'POST',
      body: { status, name }
    })
  },

  /**
   * Delete task
   */
  async deleteTask(status, name) {
    return request(`/productivity/tasks/${status}/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    })
  },

  /**
   * Get history entries
   */
  async getHistory(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/productivity/history${query}`)
  },

  /**
   * Add history entry
   */
  async addHistory(entry) {
    return request('/productivity/history', {
      method: 'POST',
      body: entry
    })
  },

  /**
   * Get daily totals
   */
  async getDailyTotals(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/productivity/daily-totals${query}`)
  },

  /**
   * Get task totals
   */
  async getTaskTotals() {
    return request('/productivity/task-totals')
  },

  /**
   * Get active session
   */
  async getActiveSession() {
    return request('/productivity/session')
  },

  /**
   * Set/update active session
   */
  async setActiveSession(session) {
    return request('/productivity/session', {
      method: 'POST',
      body: session
    })
  },

  /**
   * Stop active session
   */
  async stopActiveSession() {
    return request('/productivity/session', {
      method: 'DELETE'
    })
  },

  // ===== TIMECLOCK =====

  /**
   * Clock in for work day
   */
  async clockIn(timestamp) {
    return request('/productivity/clock-in', {
      method: 'POST',
      body: { timestamp }
    })
  },

  /**
   * Clock out for work day
   */
  async clockOut(timestamp) {
    return request('/productivity/clock-out', {
      method: 'POST',
      body: { timestamp }
    })
  },

  /**
   * Get current clock status
   */
  async getClockStatus() {
    return request('/productivity/clock-status')
  },

  /**
   * Get timecard entries
   */
  async getTimecard(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/productivity/timecard${query}`)
  },

  /**
   * Add manual timecard entry
   */
  async addTimecardEntry(entry) {
    return request('/productivity/timecard', {
      method: 'POST',
      body: entry
    })
  },

  /**
   * Update timecard entry
   */
  async updateTimecardEntry(id, updates) {
    return request(`/productivity/timecard/${id}`, {
      method: 'PUT',
      body: updates
    })
  },

  /**
   * Delete timecard entry
   */
  async deleteTimecardEntry(id) {
    return request(`/productivity/timecard/${id}`, {
      method: 'DELETE'
    })
  },

  /**
   * Get out-of-hours productivity data
   */
  async getOutOfHoursData(date) {
    return request(`/productivity/out-of-hours?date=${date}`)
  },

  /**
   * Clean up out-of-hours data
   */
  async cleanupOutOfHours(date, dryRun = false) {
    return request('/productivity/cleanup-hours', {
      method: 'POST',
      body: { date, dryRun }
    })
  }
}

// ============================================================================
// PRODUCTIVITY V4 API (Task-Focused Tracking)
// ============================================================================

export const productivityV4 = {
  // ===== TASK LIBRARY =====

  /**
   * Get all active tasks for current user
   */
  async getTasks() {
    return request('/productivity/v4/tasks')
  },

  /**
   * Create a new task
   */
  async createTask(task) {
    return request('/productivity/v4/tasks', {
      method: 'POST',
      body: task
    })
  },

  /**
   * Update a task
   */
  async updateTask(taskId, updates) {
    return request(`/productivity/v4/tasks/${taskId}`, {
      method: 'PUT',
      body: updates
    })
  },

  /**
   * Delete a task (soft delete)
   */
  async deleteTask(taskId) {
    return request(`/productivity/v4/tasks/${taskId}`, {
      method: 'DELETE'
    })
  },

  // ===== TRACKING =====

  /**
   * Start tracking a task
   */
  async startTracking(taskId) {
    return request('/productivity/v4/start', {
      method: 'POST',
      body: { task_id: taskId }
    })
  },

  /**
   * Stop tracking current task
   */
  async stopTracking() {
    return request('/productivity/v4/stop', {
      method: 'POST'
    })
  },

  /**
   * Get active tracking session (for polling)
   */
  async getSession() {
    return request('/productivity/v4/session')
  },

  // ===== HISTORY =====

  /**
   * Get tracking history with filters
   */
  async getHistory(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/productivity/v4/history${query}`)
  },

  /**
   * Get recent completed sessions
   */
  async getRecentSessions(limit = 10) {
    return request(`/productivity/v4/recent?limit=${limit}`)
  },

  // ===== ANALYTICS =====

  /**
   * Get time per task analytics
   */
  async getTaskAnalytics(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/productivity/v4/analytics/tasks${query}`)
  },

  /**
   * Get daily totals analytics
   */
  async getDailyAnalytics(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/productivity/v4/analytics/daily${query}`)
  },

  /**
   * Get task frequency analytics
   */
  async getFrequencyAnalytics(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/productivity/v4/analytics/frequency${query}`)
  },

  /**
   * Get duration distribution analytics
   */
  async getDurationAnalytics(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/productivity/v4/analytics/duration${query}`)
  },

  /**
   * Get summary stats for dashboard
   */
  async getStats() {
    return request('/productivity/v4/stats')
  },

  /**
   * Get timeclock hours analytics
   */
  async getTimeclockAnalytics(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/productivity/v4/analytics/timeclock${query}`)
  },

  // ===== WORK SCHEDULE =====

  /**
   * Get user's work schedule (all days)
   */
  async getSchedule() {
    return request('/productivity/v4/schedule')
  },

  /**
   * Set schedule for a specific day
   */
  async setSchedule(schedule) {
    return request('/productivity/v4/schedule', {
      method: 'POST',
      body: schedule
    })
  },

  /**
   * Delete schedule for a specific day
   */
  async deleteSchedule(dayOfWeek) {
    return request(`/productivity/v4/schedule/${dayOfWeek}`, {
      method: 'DELETE'
    })
  },

  /**
   * Get next scheduled work period
   */
  async getNextSchedule() {
    return request('/productivity/v4/schedule/next')
  }
}

// ============================================================================
// PANTONE API
// ============================================================================

export const pantone = {
  /**
   * Get all colors (paginated)
   */
  async getAll(params = {}) {
    const query = new URLSearchParams(params).toString()
    return request(`/pantone${query ? '?' + query : ''}`)
  },

  /**
   * Get color by ID
   */
  async getById(id) {
    return request(`/pantone/${id}`)
  },

  /**
   * Get color statistics
   */
  async getStats() {
    return request('/pantone/stats')
  },

  /**
   * Get unique collections
   */
  async getCollections() {
    return request('/pantone/collections')
  },

  /**
   * Enhanced search with filters
   */
  async searchEnhanced(options = {}) {
    const params = new URLSearchParams()
    if (options.query) params.append('q', options.query)
    if (options.collection) params.append('collection', options.collection)
    if (options.hasRGB) params.append('hasRGB', 'true')
    if (options.hasCMYK) params.append('hasCMYK', 'true')
    if (options.hasLAB) params.append('hasLAB', 'true')
    if (options.status) params.append('status', options.status)
    if (options.page) params.append('page', options.page)
    if (options.limit) params.append('limit', options.limit)

    return request(`/pantone/search?${params}`)
  },

  /**
   * Create color
   */
  async create(colorData) {
    return request('/pantone', {
      method: 'POST',
      body: colorData
    })
  },

  /**
   * Bulk import colors
   */
  async bulkImport(colors) {
    return request('/pantone/bulk', {
      method: 'POST',
      body: { colors }
    })
  },

  /**
   * Update color
   */
  async update(id, updates) {
    return request(`/pantone/${id}`, {
      method: 'PUT',
      body: updates
    })
  },

  /**
   * Delete color
   */
  async delete(id) {
    return request(`/pantone/${id}`, {
      method: 'DELETE'
    })
  }
}

// ============================================================================
// MAINTENANCE API
// ============================================================================

export const maintenance = {
  // ===== SERVICE VISITS =====

  /**
   * Get all service visits
   */
  async getVisits(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/maintenance/visits${query}`)
  },

  /**
   * Get service visit by ID
   */
  async getVisitById(id) {
    return request(`/maintenance/visits/${id}`)
  },

  /**
   * Create service visit
   */
  async createVisit(visitData) {
    return request('/maintenance/visits', {
      method: 'POST',
      body: visitData
    })
  },

  /**
   * Update service visit
   */
  async updateVisit(id, updates) {
    return request(`/maintenance/visits/${id}`, {
      method: 'PUT',
      body: updates
    })
  },

  /**
   * Delete service visit
   */
  async deleteVisit(id) {
    return request(`/maintenance/visits/${id}`, {
      method: 'DELETE'
    })
  },

  /**
   * Get maintenance metrics
   */
  async getMetrics(machine = null) {
    const query = machine ? `?machine=${encodeURIComponent(machine)}` : ''
    return request(`/maintenance/metrics${query}`)
  },

  // ===== MAINTENANCE ISSUES =====

  /**
   * Get all issues
   */
  async getIssues(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/maintenance/issues${query}`)
  },

  /**
   * Get issue by ID
   */
  async getIssueById(id) {
    return request(`/maintenance/issues/${id}`)
  },

  /**
   * Create issue
   */
  async createIssue(issue) {
    return request('/maintenance/issues', {
      method: 'POST',
      body: issue
    })
  },

  /**
   * Update issue
   */
  async updateIssue(id, updates) {
    return request(`/maintenance/issues/${id}`, {
      method: 'PUT',
      body: updates
    })
  },

  /**
   * Delete issue
   */
  async deleteIssue(id) {
    return request(`/maintenance/issues/${id}`, {
      method: 'DELETE'
    })
  },

  // ===== MAINTENANCE LOGS =====

  /**
   * Get all maintenance logs
   */
  async getLogs(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/maintenance/logs${query}`)
  },

  /**
   * Get recent maintenance logs
   */
  async getRecentLogs(limit = 10) {
    return request(`/maintenance/logs/recent?limit=${limit}`)
  },

  /**
   * Get maintenance log by ID
   */
  async getLogById(id) {
    return request(`/maintenance/logs/${id}`)
  },

  /**
   * Create maintenance log
   */
  async createLog(logData) {
    return request('/maintenance/logs', {
      method: 'POST',
      body: logData
    })
  },

  /**
   * Update maintenance log
   */
  async updateLog(id, updates) {
    return request(`/maintenance/logs/${id}`, {
      method: 'PUT',
      body: updates
    })
  },

  /**
   * Delete maintenance log
   */
  async deleteLog(id) {
    return request(`/maintenance/logs/${id}`, {
      method: 'DELETE'
    })
  }
}

// ============================================================================
// DASHBOARD API
// ============================================================================

export const dashboard = {
  /**
   * Get aggregated stats (replaces 4 separate API calls)
   */
  async getStats() {
    return request('/dashboard/stats')
  },

  /**
   * Get todos with optional filters
   * @param {Object} filters - Filter options
   */
  async getTodos(filters = {}) {
    const params = new URLSearchParams(filters)
    const query = params.toString() ? `?${params}` : ''
    return request(`/dashboard/todos${query}`)
  },

  /**
   * Create todo
   * @param {Object|string} todoData - Todo data object or text string
   */
  async createTodo(todoData) {
    const body = typeof todoData === 'string' ? { text: todoData } : todoData
    return request('/dashboard/todos', {
      method: 'POST',
      body
    })
  },

  /**
   * Update todo
   */
  async updateTodo(id, updates) {
    return request(`/dashboard/todos/${id}`, {
      method: 'PUT',
      body: updates
    })
  },

  /**
   * Delete todo
   */
  async deleteTodo(id) {
    return request(`/dashboard/todos/${id}`, {
      method: 'DELETE'
    })
  },

  /**
   * Get activity feed
   */
  async getActivity(limit = 50) {
    return request(`/dashboard/activity?limit=${limit}`)
  },

  /**
   * Create activity entry
   */
  async createActivity({ type, description }) {
    return request('/dashboard/activity', {
      method: 'POST',
      body: { type, description }
    })
  },

  /**
   * Get calendar data (service visits, issues, productivity, todos)
   */
  async getCalendarData(startDate, endDate = null, userId = null) {
    const params = new URLSearchParams({ startDate })
    if (endDate) params.append('endDate', endDate)
    if (userId) params.append('userId', userId)
    return request(`/dashboard/calendar?${params}`)
  },

  /**
   * Get maintenance reminder status for weekly Roland maintenance
   */
  async getMaintenanceReminder() {
    return request('/dashboard/maintenance-reminder')
  }
}

// ============================================================================
// MIGRATION API
// ============================================================================

export const migration = {
  /**
   * Import localStorage data
   */
  async import(data) {
    return request('/migration/import', {
      method: 'POST',
      body: data
    })
  },

  /**
   * Export all data
   */
  async export() {
    return request('/migration/export')
  }
}

// ============================================================================
// USERS API
// ============================================================================

export const users = {
  /**
   * Get all users (admin only)
   */
  async getAll() {
    return request('/users')
  },

  /**
   * Login with username and PIN
   */
  async login(username, pin) {
    return request('/users/login', {
      method: 'POST',
      body: { username, pin }
    })
  },

  /**
   * Logout current user
   */
  async logout() {
    return request('/users/logout', {
      method: 'POST'
    })
  },

  /**
   * Get current authenticated user
   */
  async getCurrentUser() {
    return request('/users/me')
  },

  /**
   * Create new user (admin only)
   */
  async createUser(userData) {
    return request('/users/register', {
      method: 'POST',
      body: userData
    })
  },

  /**
   * Delete user (admin only)
   */
  async deleteUser(id) {
    return request(`/users/${id}`, {
      method: 'DELETE'
    })
  },

  /**
   * Get current user's shift length
   */
  async getShiftLength() {
    return request('/users/me/shift-length')
  },

  /**
   * Update current user's shift length
   */
  async updateShiftLength(hours) {
    return request('/users/me/shift-length', {
      method: 'PUT',
      body: { hours }
    })
  }
}

// ============================================================================
// CONFIG API
// ============================================================================

export const config = {
  /** Get app config (cached in sessionStorage for the page lifetime) */
  async get() {
    const cached = sessionStorage.getItem('app:config')
    if (cached) {
      try { return JSON.parse(cached) } catch {}
    }
    const data = await request('/config')
    sessionStorage.setItem('app:config', JSON.stringify(data.data))
    return data.data
  },

  /** Save config (setup wizard / admin) */
  async save(payload) {
    sessionStorage.removeItem('app:config')
    return request('/config/setup', { method: 'POST', body: payload })
  }
}

/**
 * Convenience helper — returns the app config object, fetching if needed.
 * Safe to call from any page; resolves to defaults if fetch fails.
 */
export async function getAppConfig() {
  try {
    return await config.get()
  } catch {
    return { app: { name: 'WorkBase', tagline: '', primaryColor: '#ff6b35' }, tools: {}, equipment: [] }
  }
}

// ============================================================================
// EQUIPMENT API
// ============================================================================

export const equipment = {
  async getAll() {
    return request('/equipment')
  },
  async create(item) {
    return request('/equipment', { method: 'POST', body: item })
  },
  async update(id, updates) {
    return request(`/equipment/${id}`, { method: 'PUT', body: updates })
  },
  async delete(id) {
    return request(`/equipment/${id}`, { method: 'DELETE' })
  }
}

// ============================================================================
// SEARCH API
// ============================================================================

export const search = {
  /**
   * Search across all data types
   * @param {string} query - Search query
   * @param {Object} options - Search options
   */
  async searchAll(query, options = {}) {
    const params = new URLSearchParams({ q: query })
    if (options.types) params.append('types', options.types.join(','))
    if (options.limit) params.append('limit', options.limit)
    return request(`/search?${params}`)
  },

  /**
   * Search inventory only
   */
  async searchInventory(query, limit = 20) {
    return request(`/search/inventory?q=${encodeURIComponent(query)}&limit=${limit}`)
  },

  /**
   * Search pantone only
   */
  async searchPantone(query, limit = 20) {
    return request(`/search/pantone?q=${encodeURIComponent(query)}&limit=${limit}`)
  },

  /**
   * Search maintenance only
   */
  async searchMaintenance(query, limit = 20) {
    return request(`/search/maintenance?q=${encodeURIComponent(query)}&limit=${limit}`)
  },

  /**
   * Search todos only
   */
  async searchTodos(query, limit = 20) {
    return request(`/search/todos?q=${encodeURIComponent(query)}&limit=${limit}`)
  },

  /**
   * Get search suggestions
   */
  async getSuggestions(type = 'all', limit = 5) {
    return request(`/search/suggestions?type=${type}&limit=${limit}`)
  }
}

export async function checkHealth() {
  try {
    const response = await fetch('/api/health')
    return response.ok
  } catch {
    return false
  }
}

export default {
  inventory,
  productivity,
  pantone,
  maintenance,
  dashboard,
  migration,
  users,
  search,
  config,
  equipment,
  checkHealth
}
