/**
 * Density Profiles API Routes
 * CMYK press profile reference database — search, CRUD, import
 */

import express from 'express'
import { getDatabase } from '../config/database.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { success, error, notFound, validationError, created } from '../utils/responses.js'
import { requireAuth } from '../middleware/auth.js'
import * as Profiles from '../models/densityProfiles.model.js'
import { reimportFromExcel } from '../utils/importDensityProfiles.js'

const router = express.Router()

// All routes require auth
router.use(requireAuth)

/**
 * GET /api/v1/density-profiles
 * List all profiles. Optional ?printer=
 */
router.get('/', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const filters = {}
  if (req.query.printer) filters.printer = req.query.printer

  const profiles = await Profiles.getAll(db, filters)
  res.json(success(profiles, { count: profiles.length }))
}))

/**
 * GET /api/v1/density-profiles/printers
 * Distinct printer list for filter dropdowns
 */
router.get('/printers', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const printers = await Profiles.getPrinters(db)
  res.json(success(printers))
}))

/**
 * GET /api/v1/density-profiles/search
 * Nearest-match search by Euclidean distance.
 * Query: ?c=&m=&y=&k=&printer=&print_type=&limit=
 */
router.get('/search', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const { c, m, y, k, printer, print_type, limit } = req.query

  const results = await Profiles.search(db, {
    c: c != null ? parseFloat(c) : null,
    m: m != null ? parseFloat(m) : null,
    y: y != null ? parseFloat(y) : null,
    k: k != null ? parseFloat(k) : null,
    printer: printer || null,
    print_type: print_type || null,
    limit: limit ? parseInt(limit) : 20
  })

  res.json(success(results, { count: results.length }))
}))

/**
 * GET /api/v1/density-profiles/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const profile = await Profiles.getById(db, req.params.id)
  if (!profile) return res.status(404).json(notFound('Density profile', req.params.id))
  res.json(success(profile))
}))

/**
 * POST /api/v1/density-profiles
 * Create a new profile. Any authenticated user.
 * Body: { printer, profile_name, print_type?, cyan?, magenta?, yellow?, black?, comments?, status? }
 */
router.post('/', asyncHandler(async (req, res) => {
  const { printer, profile_name } = req.body

  if (!printer?.trim()) return res.status(400).json(validationError('printer', 'Printer is required'))
  if (!profile_name?.trim()) return res.status(400).json(validationError('profile_name', 'Profile name is required'))

  const db = await getDatabase()
  const profile = await Profiles.create(db, req.body)
  res.status(201).json(created(profile))
}))

/**
 * PUT /api/v1/density-profiles/:id
 * Update a profile. Any authenticated user.
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const updated = await Profiles.update(db, req.params.id, req.body)
  if (!updated) return res.status(404).json(notFound('Density profile', req.params.id))
  res.json(success(updated))
}))

/**
 * DELETE /api/v1/density-profiles/:id
 * Admin only.
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  if (req.session?.user?.role !== 'admin') {
    return res.status(403).json(error('ForbiddenError', 'Admin access required'))
  }

  const db = await getDatabase()
  const deleted = await Profiles.remove(db, req.params.id)
  if (!deleted) return res.status(404).json(notFound('Density profile', req.params.id))
  res.json(success({ message: 'Profile deleted' }))
}))

/**
 * POST /api/v1/density-profiles/import
 * Re-import from seed Excel, replacing all data. Admin only.
 */
router.post('/import', asyncHandler(async (req, res) => {
  if (req.session?.user?.role !== 'admin') {
    return res.status(403).json(error('ForbiddenError', 'Admin access required'))
  }

  const db = await getDatabase()
  const count = await reimportFromExcel(db)
  res.json(success({ imported: count }, `Imported ${count} profiles`))
}))

export default router
