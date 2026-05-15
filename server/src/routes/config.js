/**
 * Config API routes
 *
 * GET  /api/v1/config        — public: returns app config (no secrets)
 * POST /api/v1/config/setup  — public during setup, locked after setup_complete=true
 */

import { Router } from 'express'
import { getConfig, saveConfig, isSetupComplete } from '../config/appConfig.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { success, error } from '../utils/responses.js'

const router = Router()

// GET /api/v1/config
// Returns the full app config (safe to expose — no secrets stored here)
router.get('/', asyncHandler(async (req, res) => {
  const config = getConfig()
  res.json(success(config))
}))

// POST /api/v1/config/setup
// Accepts setup payload. Locked once setup_complete is true (admin only after that).
router.post('/setup', asyncHandler(async (req, res) => {
  if (isSetupComplete()) {
    if (!req.session?.user || req.session.user.role !== 'admin') {
      return res.status(403).json(error('ForbiddenError', 'Setup already complete. Admin access required.'))
    }
  }

  const { app, tools, equipment } = req.body

  const updates = {}
  if (app) updates.app = app
  if (tools) updates.tools = tools
  if (equipment !== undefined) updates.equipment = equipment
  updates.setup_complete = true

  const saved = saveConfig(updates)
  res.json(success(saved, { message: 'Configuration saved' }))
}))

export default router
