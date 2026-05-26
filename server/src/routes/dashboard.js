/**
 * Dashboard API Routes
 * Handles todos, activity feed, and calendar endpoints
 */

import express from 'express'
import { getDatabase } from '../config/database.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireAuth } from '../middleware/auth.js'
import { success, error, notFound, validationError } from '../utils/responses.js'
import { validateTodo, validateDate } from '../utils/validators.js'
import * as Dashboard from '../models/dashboard.model.js'
import * as MaintenanceLogs from '../models/maintenanceLogs.model.js'

const router = express.Router()

// Apply authentication to all routes
router.use(requireAuth)

// ===== TODOS =====

/**
 * GET /api/v1/dashboard/todos
 * Get all todos with optional filters
 * Query: ?filter=all|active|completed|overdue|today|upcoming&priority=low|medium|high|urgent&assigned_to=userId
 */
router.get('/todos', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const filters = {
    filter: req.query.filter || 'all',
    priority: req.query.priority,
    assigned_to: req.query.assigned_to ? parseInt(req.query.assigned_to) : undefined
  }

  const todos = await Dashboard.getAllTodos(db, filters)

  res.json(success(todos, { count: todos.length, filters }))
}))

/**
 * POST /api/v1/dashboard/todos
 * Create a new todo
 * Body: { text: string, due_date?: string, priority?: string, assigned_to?: number, tags?: array }
 */
router.post('/todos', asyncHandler(async (req, res) => {
  // Validate input
  const validation = validateTodo(req.body)
  if (!validation.valid) {
    return res.status(400).json(validationError(validation.errors))
  }

  // Validate priority if provided
  if (req.body.priority && !['low', 'medium', 'high', 'urgent'].includes(req.body.priority)) {
    return res.status(400).json(error('ValidationError', 'priority must be low, medium, high, or urgent'))
  }

  const db = await getDatabase()
  const todo = await Dashboard.createTodo(db, req.body)

  res.status(201).json(success(todo))
}))

/**
 * PUT /api/v1/dashboard/todos/:id
 * Update a todo
 * Body: { text?: string, completed?: boolean, due_date?: string, priority?: string, assigned_to?: number, tags?: array }
 */
router.put('/todos/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id)

  if (isNaN(id)) {
    return res.status(400).json(error('ValidationError', 'Invalid todo ID'))
  }

  // Validate updates if provided
  if (req.body.text !== undefined) {
    if (typeof req.body.text !== 'string' || req.body.text.trim().length === 0) {
      return res.status(400).json(error('ValidationError', 'text must be a non-empty string'))
    }
  }

  if (req.body.completed !== undefined) {
    if (typeof req.body.completed !== 'boolean') {
      return res.status(400).json(error('ValidationError', 'completed must be a boolean'))
    }
  }

  if (req.body.priority !== undefined) {
    if (!['low', 'medium', 'high', 'urgent'].includes(req.body.priority)) {
      return res.status(400).json(error('ValidationError', 'priority must be low, medium, high, or urgent'))
    }
  }

  const db = await getDatabase()
  const updated = await Dashboard.updateTodo(db, id, req.body)

  if (!updated) {
    return res.status(404).json(notFound('Todo', id))
  }

  res.json(success(updated))
}))

/**
 * DELETE /api/v1/dashboard/todos/:id
 * Delete a todo
 */
router.delete('/todos/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id)

  if (isNaN(id)) {
    return res.status(400).json(error('ValidationError', 'Invalid todo ID'))
  }

  const db = await getDatabase()
  const deleted = await Dashboard.deleteTodo(db, id)

  if (!deleted) {
    return res.status(404).json(notFound('Todo', id))
  }

  res.json(success({ message: 'Todo deleted successfully' }))
}))

// ===== AGGREGATED STATS =====

/**
 * GET /api/v1/dashboard/stats
 * Get aggregated stats from all tools in a single request
 * Replaces 4 separate API calls (inventory, productivity, maintenance, pantone)
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const stats = await Dashboard.getAggregatedStats(db, req.user.id)

  res.json(success(stats))
}))

// ===== ACTIVITY FEED =====

/**
 * GET /api/v1/dashboard/activity
 * Get recent activity feed
 * Query: ?limit=100 (default 100)
 */
router.get('/activity', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 100

  // Validate limit
  if (isNaN(limit) || limit < 1 || limit > 1000) {
    return res.status(400).json(error('ValidationError', 'limit must be between 1 and 1000'))
  }

  const db = await getDatabase()
  const activities = await Dashboard.getRecentActivity(db, limit)

  res.json(success(activities, { count: activities.length, limit }))
}))

/**
 * POST /api/v1/dashboard/activity
 * Create a new activity entry
 * Body: { type: string, description: string }
 */
router.post('/activity', asyncHandler(async (req, res) => {
  const { type, description } = req.body

  if (!type || typeof type !== 'string') {
    return res.status(400).json(error('ValidationError', 'type is required'))
  }

  if (!description || typeof description !== 'string') {
    return res.status(400).json(error('ValidationError', 'description is required'))
  }

  const db = await getDatabase()
  const activity = await Dashboard.createActivityEntry(db, type.trim(), description.trim())

  res.status(201).json(success(activity))
}))

// ===== CALENDAR =====

/**
 * GET /api/v1/dashboard/calendar
 * Get calendar data aggregating service visits, issues, productivity, and todos
 * Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&userId=1
 */
router.get('/calendar', asyncHandler(async (req, res) => {
  // Default to today if no start date provided
  const startDate = req.query.startDate || new Date().toISOString().split('T')[0]

  // Validate start date
  const startValidation = validateDate(startDate, 'startDate')
  if (!startValidation.valid) {
    return res.status(400).json(error('ValidationError', startValidation.error))
  }

  // Validate end date if provided
  if (req.query.endDate) {
    const endValidation = validateDate(req.query.endDate, 'endDate')
    if (!endValidation.valid) {
      return res.status(400).json(error('ValidationError', endValidation.error))
    }
  }

  // Get user ID from query or use authenticated user
  const userId = req.query.userId ? parseInt(req.query.userId) : req.user.id

  if (isNaN(userId)) {
    return res.status(400).json(error('ValidationError', 'Invalid userId'))
  }

  const db = await getDatabase()
  const calendarData = await Dashboard.getCalendarData(db, {
    startDate,
    endDate: req.query.endDate,
    userId
  })

  res.json(success(calendarData))
}))

// ===== MAINTENANCE REMINDER =====

/**
 * GET /api/v1/dashboard/maintenance-reminder
 * Returns maintenance status for all equipment, sorted by urgency.
 * Each item includes: id, name, status, daysOverdue, daysUntilDue, lastCompleted, nextDue.
 * Returns empty array if no equipment configured — client hides banner in that case.
 */
router.get('/maintenance-reminder', asyncHandler(async (req, res) => {
  const db = await getDatabase()

  // Fetch all equipment with their maintenance intervals
  const equipment = await new Promise((resolve, reject) => {
    db.all(
      'SELECT id, name, category, COALESCE(maintenance_interval_days, 7) AS interval_days FROM equipment ORDER BY name',
      (err, rows) => err ? reject(err) : resolve(rows)
    )
  })

  if (!equipment.length) {
    return res.json(success({ items: [], hasEquipment: false }))
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const items = await Promise.all(equipment.map(async (equip) => {
    // Get last maintenance log for this equipment
    const lastLog = await MaintenanceLogs.getLastMaintenanceForMachine(db, [equip.name])

    const intervalDays = equip.interval_days || 7
    let lastDate = null
    let nextDue = new Date(today)

    if (lastLog) {
      lastDate = new Date(lastLog.date)
      lastDate.setHours(0, 0, 0, 0)
      nextDue = new Date(lastDate)
      nextDue.setDate(lastDate.getDate() + intervalDays)
    }

    const msPerDay = 86400000
    const diffDays = Math.round((nextDue - today) / msPerDay)

    let status
    let daysOverdue = 0
    let daysUntilDue = 0

    if (diffDays < 0) {
      status = 'overdue'
      daysOverdue = Math.abs(diffDays)
    } else if (diffDays === 0) {
      status = 'due_today'
    } else if (diffDays <= 2) {
      status = 'upcoming'
      daysUntilDue = diffDays
    } else {
      status = 'ok'
      daysUntilDue = diffDays
    }

    return {
      id: equip.id,
      name: equip.name,
      category: equip.category,
      intervalDays,
      status,
      daysOverdue,
      daysUntilDue,
      lastCompleted: lastLog ? lastLog.date : null,
      nextDue: nextDue.toISOString().split('T')[0],
      lastLog: lastLog || null
    }
  }))

  // Sort: overdue first, then due_today, upcoming, ok
  const priority = { overdue: 0, due_today: 1, upcoming: 2, ok: 3 }
  items.sort((a, b) => priority[a.status] - priority[b.status] || b.daysOverdue - a.daysOverdue)

  res.json(success({ items, hasEquipment: true }))
}))

export default router
