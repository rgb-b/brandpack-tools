/**
 * App Server
 *
 * Express server providing RESTful API and serving the frontend.
 */

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { networkInterfaces } from 'os'
import dotenv from 'dotenv'

// Import database and config
import { getDatabase, closeDatabase } from './config/database.js'
import { startShiftScheduler, stopShiftScheduler } from './utils/shiftScheduler.js'
import { getConfig } from './config/appConfig.js'
import { setupGuard } from './middleware/setupGuard.js'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Initialize Express app
const app = express()
const PORT = process.env.PORT || 8080
const HOST = process.env.HOST || '0.0.0.0'
const NODE_ENV = process.env.NODE_ENV || 'development'

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for development
  crossOriginEmbedderPolicy: false
}))

// CORS - allow requests from any origin on local network
const corsOptions = {
  origin: true, // Allow all origins for local network access
  credentials: true
}
app.use(cors(corsOptions))

// Body parsing
app.use(express.json({ limit: '5mb' })) // Large limit for base64 images
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Request logging
if (NODE_ENV === 'development') {
  app.use(morgan('dev'))
} else {
  app.use(morgan('combined'))
}

// Session middleware
import { createSessionMiddleware } from './config/session.js'
app.use(createSessionMiddleware())

// Setup guard — redirect to /setup if first-run not complete
app.use(setupGuard)

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

// Initialize database on startup (async)
let dbReady = false
getDatabase()
  .then(async (db) => {
    console.log('✓ Database ready')
    dbReady = true
    // Auto-migrate: add linked_issue_id to service_visits if not present
    await new Promise((resolve) => {
      db.run(
        'ALTER TABLE service_visits ADD COLUMN linked_issue_id INTEGER REFERENCES maintenance_issues(id) ON DELETE SET NULL',
        () => resolve() // Ignore error — column already exists on up-to-date DBs
      )
    })
    // Auto-migrate: add low_stock_threshold to inventory_items if not present
    await new Promise((resolve) => {
      db.run(
        'ALTER TABLE inventory_items ADD COLUMN low_stock_threshold INTEGER DEFAULT 2',
        () => resolve() // Ignore error — column already exists on up-to-date DBs
      )
    })
    // Auto-migrate: add session_invalidated_at to users if not present
    await new Promise((resolve) => {
      db.run(
        'ALTER TABLE users ADD COLUMN session_invalidated_at BIGINT DEFAULT NULL',
        () => resolve() // Ignore error — column already exists on up-to-date DBs
      )
    })
    // Seed density profiles from Excel if table is empty
    await seedIfEmpty(db)
    startShiftScheduler()
  })
  .catch((error) => {
    console.error('✗ Database initialization failed:', error)
    process.exit(1)
  })

// ============================================================================
// API ROUTES
// ============================================================================

// ── File downloads (internal network only) ────────────────────────────
const downloadsPath = join(__dirname, '../downloads')
app.get('/downloads/:filename', (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '') // sanitise
  res.download(join(downloadsPath, filename))
})

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV
  })
})

// API version info
app.get('/api/v1', (req, res) => {
  const cfg = getConfig()
  res.json({
    name: `${cfg.app?.name || 'WorkBase'} API`,
    version: '3.0.0',
    endpoints: {
      config: '/api/v1/config',
      inventory: '/api/v1/inventory',
      productivity: '/api/v1/productivity',
      productivityV4: '/api/v1/productivity/v4',
      pantone: '/api/v1/pantone',
      maintenance: '/api/v1/maintenance',
      dashboard: '/api/v1/dashboard',
      equipment: '/api/v1/equipment',
      migration: '/api/v1/migration'
    }
  })
})

// Import and mount route handlers
import configRoutes from './routes/config.js'
import inventoryRoutes from './routes/inventory.js'
import productivityRoutes from './routes/productivity.js'
import productivityV4Routes from './routes/productivityV4.js'
import pantoneRoutes from './routes/pantone.js'
import maintenanceRoutes from './routes/maintenance.js'
import dashboardRoutes from './routes/dashboard.js'
import migrationRoutes from './routes/migration.js'
import usersRoutes from './routes/users.js'
import searchRoutes from './routes/search.js'
import equipmentRoutes from './routes/equipment.js'
import densityProfilesRoutes from './routes/densityProfiles.js'
import { seedIfEmpty } from './utils/importDensityProfiles.js'

app.use('/api/v1/config', configRoutes)
app.use('/api/v1/inventory', inventoryRoutes)
app.use('/api/v1/productivity', productivityRoutes)
app.use('/api/v1/productivity/v4', productivityV4Routes)
app.use('/api/v1/pantone', pantoneRoutes)
app.use('/api/v1/maintenance', maintenanceRoutes)
app.use('/api/v1/dashboard', dashboardRoutes)
app.use('/api/v1/migration', migrationRoutes)
app.use('/api/v1/users', usersRoutes)
app.use('/api/v1/search', searchRoutes)
app.use('/api/v1/equipment', equipmentRoutes)
app.use('/api/v1/density-profiles', densityProfilesRoutes)

// ============================================================================
// SERVE FRONTEND STATIC FILES
// ============================================================================

// Root: redirect to setup if needed, otherwise launcher
app.get('/', (req, res) => {
  res.redirect('/src/tools/launcher/index.html')
})

// Serve static files from client directory
const clientPath = NODE_ENV === 'production'
  ? join(__dirname, '../../client/dist')
  : join(__dirname, '../../client')

app.use(express.static(clientPath))

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    availableEndpoints: [
      '/api/health',
      '/api/v1',
      '/api/v1/inventory',
      '/api/v1/productivity',
      '/api/v1/pantone',
      '/api/v1/maintenance',
      '/api/v1/dashboard',
      '/api/v1/migration'
    ]
  })
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err)

  const status = err.status || 500
  const message = err.message || 'Internal Server Error'

  res.status(status).json({
    error: err.name || 'Error',
    message,
    ...(NODE_ENV === 'development' && { stack: err.stack })
  })
})

// ============================================================================
// SERVER STARTUP
// ============================================================================

// Get local network IP for display
function getLocalIP() {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}

const server = app.listen(PORT, HOST, () => {
  const localIP = getLocalIP()

  const appName = getConfig().app?.name || 'WorkBase'
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`🚀 ${appName} Server Started`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`   Environment: ${NODE_ENV}`)
  console.log(`   Host: ${HOST}`)
  console.log(`   Port: ${PORT}`)
  console.log('')
  console.log(`   Local:   http://localhost:${PORT}`)
  console.log(`   Network: http://${localIP}:${PORT}`)
  console.log('')
  console.log(`   API:     http://${localIP}:${PORT}/api/v1`)
  console.log(`   Health:  http://${localIP}:${PORT}/api/health`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
})

// Graceful shutdown
function gracefulShutdown() {
  console.log('\n🛑 Shutting down gracefully...')
  server.close(() => {
    console.log('✓ Server closed')
    stopShiftScheduler()
    closeDatabase()
    process.exit(0)
  })

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

export default app
