/**
 * Ink Density API Routes
 * CRUD for press density jobs + HTML report generation.
 */

import express from 'express'
import { getDatabase } from '../config/database.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { success, error, notFound, created } from '../utils/responses.js'
import { requireAuth } from '../middleware/auth.js'
import * as Jobs from '../models/inkDensity.model.js'
import { generateReport, generateComparisonReport } from '../utils/inkDensityReport.js'

const router = express.Router()

router.use(requireAuth)

/**
 * GET /api/v1/ink-density
 * List all jobs (summary — no nested shapes/inks)
 */
router.get('/', asyncHandler(async (req, res) => {
  const db   = await getDatabase()
  const jobs = await Jobs.getAllJobs(db)
  res.json(success(jobs, { count: jobs.length }))
}))

/**
 * GET /api/v1/ink-density/:id
 * Full job with nested inks + shapes + weights
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const db  = await getDatabase()
  const job = await Jobs.getJob(db, req.params.id)
  if (!job) return res.status(404).json(notFound('Ink density job', req.params.id))
  res.json(success(job))
}))

/**
 * POST /api/v1/ink-density
 * Create new job. Body = full JobConfig (inks + shapes + weights optional)
 */
router.post('/', asyncHandler(async (req, res) => {
  const db  = await getDatabase()
  const job = await Jobs.createJob(db, req.body)
  res.status(201).json(created(job))
}))

/**
 * PUT /api/v1/ink-density/:id
 * Replace full job (metadata + all nested data)
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const db      = await getDatabase()
  const updated = await Jobs.updateJob(db, req.params.id, req.body)
  if (!updated) return res.status(404).json(notFound('Ink density job', req.params.id))
  res.json(success(updated))
}))

/**
 * DELETE /api/v1/ink-density/:id
 * Admin only
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  if (req.session?.user?.role !== 'admin') {
    return res.status(403).json(error('ForbiddenError', 'Admin access required'))
  }
  const db      = await getDatabase()
  const deleted = await Jobs.deleteJob(db, req.params.id)
  if (!deleted) return res.status(404).json(notFound('Ink density job', req.params.id))
  res.json(success({ message: 'Job deleted' }))
}))

/**
 * GET /api/v1/ink-density/:id/report
 * Returns print-ready HTML for a single job
 */
router.get('/:id/report', asyncHandler(async (req, res) => {
  const db  = await getDatabase()
  const job = await Jobs.getJob(db, req.params.id)
  if (!job) return res.status(404).json(notFound('Ink density job', req.params.id))
  const html = generateReport(job)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(html)
}))

/**
 * GET /api/v1/ink-density/report/comparison?ids=1,2,3
 * Returns combined comparison HTML for multiple jobs
 */
router.get('/report/comparison', asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length < 2) {
    return res.status(400).json(error('ValidationError', 'At least 2 job IDs required'))
  }
  const db   = await getDatabase()
  const jobs = await Promise.all(ids.map(id => Jobs.getJob(db, id)))
  const missing = ids.find((id, i) => !jobs[i])
  if (missing) return res.status(404).json(notFound('Ink density job', missing))

  const html = generateComparisonReport(jobs)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(html)
}))

export default router
