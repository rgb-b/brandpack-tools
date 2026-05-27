/**
 * Productivity V4 Routes
 * Task-focused time tracking with analytics
 */

import express from 'express'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireAuth } from '../middleware/auth.js'
import { success, created, notFound, validationError } from '../utils/responses.js'
import { getDatabase } from '../config/database.js'
import * as ProductivityV4 from '../models/productivityV4.model.js'
import * as WorkSchedule from '../models/workSchedule.model.js'
import * as Timeclock from '../models/timeclock.model.js'

const router = express.Router()

// All routes require authentication
router.use(requireAuth)

// ============================================================================
// Task Library Management
// ============================================================================

/**
 * GET /api/v1/productivity/v4/tasks
 * Get all active tasks for current user
 */
router.get('/tasks', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const tasks = await ProductivityV4.getTasks(db, req.user.id)

  res.json(success(tasks, { count: tasks.length }))
}))

/**
 * POST /api/v1/productivity/v4/tasks
 * Create a new task
 * Body: { name, category?, color? }
 */
router.post('/tasks', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const { name, category, color } = req.body

  // Validation
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json(validationError('Task name is required'))
  }

  if (name.length > 100) {
    return res.status(400).json(validationError('Task name must be 100 characters or less'))
  }

  try {
    const task = await ProductivityV4.createTask(db, req.user.id, {
      name: name.trim(),
      category: category?.trim() || null,
      color: color?.trim() || null
    })

    res.status(201).json(created(task))
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json(validationError('A task with this name already exists'))
    }
    throw error
  }
}))

/**
 * PUT /api/v1/productivity/v4/tasks/:id
 * Update a task
 * Body: { name?, category?, color? }
 */
router.put('/tasks/:id', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const taskId = parseInt(req.params.id, 10)
  const { name, category, color } = req.body

  if (isNaN(taskId)) {
    return res.status(400).json(validationError('Invalid task ID'))
  }

  const updates = {}
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json(validationError('Task name cannot be empty'))
    }
    updates.name = name.trim()
  }
  if (category !== undefined) updates.category = category?.trim() || null
  if (color !== undefined) updates.color = color?.trim() || null

  const task = await ProductivityV4.updateTask(db, taskId, req.user.id, updates)

  if (!task) {
    return res.status(404).json(notFound('Task not found'))
  }

  res.json(success(task))
}))

/**
 * DELETE /api/v1/productivity/v4/tasks/:id
 * Soft delete a task (set is_active = 0)
 */
router.delete('/tasks/:id', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const taskId = parseInt(req.params.id, 10)

  if (isNaN(taskId)) {
    return res.status(400).json(validationError('Invalid task ID'))
  }

  const deleted = await ProductivityV4.deleteTask(db, taskId, req.user.id)

  if (!deleted) {
    return res.status(404).json(notFound('Task not found'))
  }

  res.json(success({ deleted: true }))
}))

// ============================================================================
// Time Tracking
// ============================================================================

/**
 * POST /api/v1/productivity/v4/start
 * Start tracking a task
 * Body: { task_id }
 */
router.post('/start', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const { task_id } = req.body

  if (!task_id || isNaN(parseInt(task_id, 10))) {
    return res.status(400).json(validationError('task_id is required'))
  }

  const taskId = parseInt(task_id, 10)

  // Get task details
  const task = await ProductivityV4.getTaskById(db, taskId, req.user.id)
  if (!task) {
    return res.status(404).json(notFound('Task not found'))
  }

  // Check if user should auto clock-in
  const clockStatus = await Timeclock.getCurrentClockStatus(db, req.user.id)

  if (!clockStatus.clocked_in) {
    // Check if should auto clock-in based on work schedule
    const shouldClock = await WorkSchedule.shouldAutoClockIn(db, req.user.id, Date.now())

    if (shouldClock) {
      // Auto clock-in
      await Timeclock.clockIn(db, req.user.id)
    }
  }

  // Start tracking
  try {
    const tracking = await ProductivityV4.startTracking(db, req.user.id, taskId, task.name)

    res.status(201).json(created(tracking, { auto_clocked_in: !clockStatus.clocked_in }))
  } catch (error) {
    if (error.message.includes('Already tracking')) {
      return res.status(400).json(validationError(error.message))
    }
    throw error
  }
}))

/**
 * POST /api/v1/productivity/v4/stop
 * Stop tracking current task
 */
router.post('/stop', asyncHandler(async (req, res) => {
  const db = await getDatabase()

  const session = await ProductivityV4.stopTracking(db, req.user.id)

  if (!session) {
    return res.status(400).json(validationError('No active tracking session'))
  }

  // Phantom session: active session row existed but had no matching tracking entry.
  // It's been cleared — return success so the client resets its UI state.
  if (session.phantom) {
    return res.json(success(null))
  }

  // Check if should auto clock-out based on work schedule
  const shouldClockOut = await WorkSchedule.shouldAutoClockOut(db, req.user.id, Date.now())
  let autoClockedOut = false

  if (shouldClockOut) {
    const clockStatus = await Timeclock.getCurrentClockStatus(db, req.user.id)
    if (clockStatus.clocked_in) {
      await Timeclock.clockOut(db, req.user.id)
      autoClockedOut = true
    }
  }

  res.json(success(session, { auto_clocked_out: autoClockedOut }))
}))

/**
 * GET /api/v1/productivity/v4/session
 * Get active tracking session (for polling)
 */
router.get('/session', asyncHandler(async (req, res) => {
  const db = await getDatabase()

  const session = await ProductivityV4.getActiveTracking(db, req.user.id)

  if (!session) {
    return res.json(success(null))
  }

  // Auto-stop sessions with a stale heartbeat (> 2 hours = orphaned/forgotten session)
  const STALE_THRESHOLD = 2 * 60 * 60 * 1000 // 2 hours in ms
  if (session.last_heartbeat && (Date.now() - session.last_heartbeat) > STALE_THRESHOLD) {
    // Stop using last heartbeat as end time to avoid inflating duration
    await ProductivityV4.stopTracking(db, req.user.id, session.last_heartbeat)
    return res.json(success(null))
  }

  // Update heartbeat
  await ProductivityV4.updateHeartbeat(db, req.user.id)

  res.json(success(session))
}))

// ============================================================================
// History
// ============================================================================

/**
 * GET /api/v1/productivity/v4/history
 * Get tracking history
 * Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&taskId=123&limit=100
 */
router.get('/history', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const { startDate, endDate, taskId, limit } = req.query

  const filters = {}

  if (startDate) filters.startDate = startDate
  if (endDate) filters.endDate = endDate
  if (taskId) filters.taskId = parseInt(taskId, 10)
  if (limit) filters.limit = parseInt(limit, 10)

  const history = await ProductivityV4.getHistory(db, req.user.id, filters)

  res.json(success(history, { count: history.length }))
}))

/**
 * GET /api/v1/productivity/v4/recent
 * Get recent completed sessions (last 10)
 */
router.get('/recent', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const limit = parseInt(req.query.limit, 10) || 10

  const sessions = await ProductivityV4.getRecentSessions(db, req.user.id, limit)

  res.json(success(sessions, { count: sessions.length }))
}))

// ============================================================================
// Analytics
// ============================================================================

/**
 * GET /api/v1/productivity/v4/analytics/tasks
 * Get time per task (total, average, count)
 * Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
router.get('/analytics/tasks', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const { startDate, endDate } = req.query

  const analytics = await ProductivityV4.getTaskAnalytics(db, req.user.id, {
    startDate,
    endDate
  })

  res.json(success(analytics, { count: analytics.length }))
}))

/**
 * GET /api/v1/productivity/v4/analytics/daily
 * Get daily totals
 * Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
router.get('/analytics/daily', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const { startDate, endDate } = req.query

  const analytics = await ProductivityV4.getDailyAnalytics(db, req.user.id, {
    startDate,
    endDate
  })

  res.json(success(analytics, { count: analytics.length }))
}))

/**
 * GET /api/v1/productivity/v4/analytics/frequency
 * Get task frequency (session count, unique days)
 * Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
router.get('/analytics/frequency', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const { startDate, endDate } = req.query

  const analytics = await ProductivityV4.getFrequencyAnalytics(db, req.user.id, {
    startDate,
    endDate
  })

  res.json(success(analytics, { count: analytics.length }))
}))

/**
 * GET /api/v1/productivity/v4/analytics/duration
 * Get duration distribution per task
 * Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
router.get('/analytics/duration', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const { startDate, endDate } = req.query

  const analytics = await ProductivityV4.getDurationAnalytics(db, req.user.id, {
    startDate,
    endDate
  })

  res.json(success(analytics, { count: analytics.length }))
}))

/**
 * GET /api/v1/productivity/v4/analytics/timeclock
 * Get timeclock hours worked per day for the current user
 * Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
router.get('/analytics/timeclock', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const { startDate, endDate } = req.query

  const data = await ProductivityV4.getTimeclockAnalytics(db, req.user.id, { startDate, endDate })

  res.json(success(data))
}))

/**
 * GET /api/v1/productivity/v4/stats
 * Get summary stats for dashboard (today's time + session count)
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const db = await getDatabase()

  const stats = await ProductivityV4.getTodayStats(db, req.user.id)

  res.json(success(stats))
}))

// ============================================================================
// Work Schedule
// ============================================================================

/**
 * GET /api/v1/productivity/v4/schedule
 * Get user's work schedule (all days)
 */
router.get('/schedule', asyncHandler(async (req, res) => {
  const db = await getDatabase()

  const schedule = await WorkSchedule.getSchedule(db, req.user.id)

  res.json(success(schedule, { count: schedule.length }))
}))

/**
 * POST /api/v1/productivity/v4/schedule
 * Set schedule for a specific day
 * Body: { day_of_week, start_time, end_time }
 */
router.post('/schedule', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const { day_of_week, start_time, end_time } = req.body

  // Validation
  if (day_of_week === undefined || day_of_week === null) {
    return res.status(400).json(validationError('day_of_week is required (0-6)'))
  }

  if (!start_time || !end_time) {
    return res.status(400).json(validationError('start_time and end_time are required'))
  }

  try {
    const schedule = await WorkSchedule.setSchedule(db, req.user.id, {
      day_of_week: parseInt(day_of_week, 10),
      start_time,
      end_time
    })

    res.status(201).json(created(schedule))
  } catch (error) {
    if (error.message.includes('day_of_week') || error.message.includes('Time must be')) {
      return res.status(400).json(validationError(error.message))
    }
    throw error
  }
}))

/**
 * DELETE /api/v1/productivity/v4/schedule/:day
 * Delete schedule for a specific day
 */
router.delete('/schedule/:day', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const dayOfWeek = parseInt(req.params.day, 10)

  if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return res.status(400).json(validationError('day must be between 0 (Sunday) and 6 (Saturday)'))
  }

  const deleted = await WorkSchedule.deleteSchedule(db, req.user.id, dayOfWeek)

  if (!deleted) {
    return res.status(404).json(notFound('No schedule found for this day'))
  }

  res.json(success({ deleted: true }))
}))

/**
 * GET /api/v1/productivity/v4/schedule/next
 * Get next scheduled work period
 */
router.get('/schedule/next', asyncHandler(async (req, res) => {
  const db = await getDatabase()

  const nextPeriod = await WorkSchedule.getNextScheduledPeriod(db, req.user.id)

  res.json(success(nextPeriod))
}))

export default router
