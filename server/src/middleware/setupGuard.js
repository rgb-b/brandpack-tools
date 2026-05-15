/**
 * Setup Guard Middleware
 *
 * Redirects all non-API, non-setup traffic to /setup if setup_complete is false.
 * Once setup is complete this middleware is a no-op (single config check per request).
 */

import { isSetupComplete } from '../config/appConfig.js'

const isProd = process.env.NODE_ENV === 'production'

// The setup tool path differs between dev (Vite) and prod (built dist)
const SETUP_PATH = isProd
  ? '/src/tools/setup/index.html'
  : '/src/tools/setup/index.html'

// Paths always allowed through, even before setup
const ALLOWED_PREFIXES = [
  '/api/v1/config',   // setup wizard reads/writes config
  '/api/v1/users/register', // setup wizard creates first admin
  '/src/tools/setup', // setup wizard HTML/JS
  '/setup',           // alias
  '/assets',          // static assets
  '/src/shared',      // shared styles/components
]

export function setupGuard(req, res, next) {
  if (isSetupComplete()) return next()

  const path = req.path

  // Allow whitelisted paths through
  if (ALLOWED_PREFIXES.some(p => path.startsWith(p))) return next()

  // API calls return a 503 instead of HTML redirect
  if (path.startsWith('/api/')) {
    return res.status(503).json({
      success: false,
      message: 'App setup not complete. Visit /setup to configure.'
    })
  }

  // Redirect everything else to setup wizard
  return res.redirect(SETUP_PATH)
}
