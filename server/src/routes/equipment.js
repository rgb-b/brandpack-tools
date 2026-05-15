/**
 * Equipment routes
 *
 * GET    /api/v1/equipment          — list all equipment
 * POST   /api/v1/equipment          — create equipment item
 * PUT    /api/v1/equipment/:id      — update equipment item
 * DELETE /api/v1/equipment/:id      — delete equipment item
 */

import { Router } from 'express'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { success, error } from '../utils/responses.js'
import { getDatabase } from '../config/database.js'

const router = Router()

// GET /api/v1/equipment
router.get('/', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  const rows = await new Promise((resolve, reject) => {
    db.all('SELECT * FROM equipment ORDER BY category, name', (err, rows) => {
      if (err) reject(err); else resolve(rows)
    })
  })
  res.json(success(rows, { count: rows.length }))
}))

// POST /api/v1/equipment
router.post('/', asyncHandler(async (req, res) => {
  const { name, category, notes } = req.body
  if (!name?.trim()) return res.status(400).json(error('ValidationError', 'name is required'))

  const db = await getDatabase()
  const result = await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO equipment (name, category, notes) VALUES (?, ?, ?)',
      [name.trim(), category?.trim() || 'General', notes?.trim() || null],
      function(err) { if (err) reject(err); else resolve(this) }
    )
  })

  const row = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM equipment WHERE id = ?', [result.lastID], (err, row) => {
      if (err) reject(err); else resolve(row)
    })
  })
  res.status(201).json(success(row, { message: 'Equipment created' }))
}))

// PUT /api/v1/equipment/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const { name, category, notes } = req.body
  const db = await getDatabase()

  await new Promise((resolve, reject) => {
    db.run(
      'UPDATE equipment SET name = COALESCE(?, name), category = COALESCE(?, category), notes = COALESCE(?, notes) WHERE id = ?',
      [name?.trim() || null, category?.trim() || null, notes?.trim() || null, req.params.id],
      function(err) { if (err) reject(err); else resolve(this) }
    )
  })

  const row = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM equipment WHERE id = ?', [req.params.id], (err, row) => {
      if (err) reject(err); else resolve(row)
    })
  })
  if (!row) return res.status(404).json(error('NotFoundError', 'Equipment not found'))
  res.json(success(row, { message: 'Equipment updated' }))
}))

// DELETE /api/v1/equipment/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const db = await getDatabase()
  await new Promise((resolve, reject) => {
    db.run('DELETE FROM equipment WHERE id = ?', [req.params.id], function(err) {
      if (err) reject(err); else resolve(this)
    })
  })
  res.json(success(null, { message: 'Equipment deleted' }))
}))

export default router
