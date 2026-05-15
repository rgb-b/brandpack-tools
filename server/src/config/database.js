/**
 * Database Configuration and Initialization
 *
 * Sets up SQLite database connection and runs migrations on first start.
 * Uses sqlite3 async library with promises.
 */

import sqlite3 from 'sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join, isAbsolute } from 'path'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs'
import { promisify } from 'util'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Enable verbose mode in development
const sqlite3Verbose = process.env.NODE_ENV === 'development' ? sqlite3.verbose() : sqlite3

// Database file path — use DATABASE_PATH env var or default to app.db
const DB_DIR = join(__dirname, '../../data')
const _dbEnvPath = process.env.DATABASE_PATH
const DB_PATH = _dbEnvPath
  ? (isAbsolute(_dbEnvPath) ? _dbEnvPath : join(__dirname, '../..', _dbEnvPath.replace(/^\.\//, '')))
  : join(DB_DIR, 'app.db')
const MIGRATIONS_DIR = join(__dirname, '../../migrations')

// Ensure data directory exists
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true })
  console.log('✓ Created data directory')
}

// Database instance
let db = null

/**
 * Get database instance (singleton pattern)
 * @returns {Promise<sqlite3.Database>} SQLite database instance
 */
export async function getDatabase() {
  if (db) {
    return db
  }

  const isNewDatabase = !existsSync(DB_PATH)

  return new Promise((resolve, reject) => {
    db = new sqlite3Verbose.Database(DB_PATH, async (err) => {
      if (err) {
        console.error('✗ Database connection failed:', err)
        console.error('   Path:', DB_PATH)
        reject(err)
        return
      }

      try {
        // Enable foreign keys
        await new Promise((res, rej) => {
          db.run('PRAGMA foreign_keys = ON', (err) => err ? rej(err) : res())
        })

        // Set journal mode to WAL for better concurrency
        await new Promise((res, rej) => {
          db.run('PRAGMA journal_mode = WAL', (err) => err ? rej(err) : res())
        })

        if (isNewDatabase) {
          await runMigrations()
        }
        await runIncrementalMigrations()

        resolve(db)
      } catch (error) {
        console.error('✗ Database setup failed:', error)
        reject(error)
      }
    })
  })
}

/**
 * Run database migrations
 */
async function runMigrations() {
  const migrationFile = join(MIGRATIONS_DIR, 'init.sql')

  if (!existsSync(migrationFile)) {
    throw new Error(`Migration file not found: ${migrationFile}`)
  }

  const sql = readFileSync(migrationFile, 'utf8')

  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        console.error('Migration failed:', err.message)
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

/**
 * Run numbered migration files (e.g. 007_equipment.sql) that haven't been applied yet.
 * Tracks applied migrations in a `schema_migrations` table.
 */
async function runIncrementalMigrations() {
  // Ensure tracking table exists
  await new Promise((resolve, reject) => {
    db.run(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
      (err) => err ? reject(err) : resolve()
    )
  })

  // Get already-applied migrations
  const applied = await new Promise((resolve, reject) => {
    db.all('SELECT name FROM schema_migrations', (err, rows) => {
      if (err) reject(err); else resolve(new Set(rows.map(r => r.name)))
    })
  })

  // Find numbered migration files, sorted
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d+_.+\.sql$/.test(f))
    .sort()

  for (const file of files) {
    if (applied.has(file)) continue

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    await new Promise((resolve, reject) => {
      db.exec(sql, (err) => err ? reject(err) : resolve())
    })
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO schema_migrations (name) VALUES (?)', [file], (err) => err ? reject(err) : resolve())
    })
    console.log(`✓ Migration applied: ${file}`)
  }
}

/**
 * Close database connection gracefully
 */
export function closeDatabase() {
  return new Promise((resolve) => {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err)
        }
        db = null
        resolve()
      })
    } else {
      resolve()
    }
  })
}

/**
 * Get database statistics
 * @returns {Promise<Object>} Database statistics
 */
export async function getDatabaseStats() {
  const dbInstance = await getDatabase()

  const get = promisify(dbInstance.get.bind(dbInstance))
  const all = promisify(dbInstance.all.bind(dbInstance))

  const tables = {
    inventory_items: (await get('SELECT COUNT(*) as count FROM inventory_items')).count,
    inventory_usage_history: (await get('SELECT COUNT(*) as count FROM inventory_usage_history')).count,
    productivity_tasks: (await get('SELECT COUNT(*) as count FROM productivity_tasks')).count,
    productivity_history: (await get('SELECT COUNT(*) as count FROM productivity_history')).count,
    pantone_colors: (await get('SELECT COUNT(*) as count FROM pantone_colors')).count,
    maintenance_issues: (await get('SELECT COUNT(*) as count FROM maintenance_issues')).count,
    dashboard_todos: (await get('SELECT COUNT(*) as count FROM dashboard_todos')).count,
    dashboard_activity: (await get('SELECT COUNT(*) as count FROM dashboard_activity')).count
  }

  const metadata = await all('SELECT * FROM app_metadata')

  // Get file size
  let size = 'N/A'
  if (existsSync(DB_PATH)) {
    const stats = await import('fs/promises').then(fs => fs.stat(DB_PATH))
    size = `${(stats.size / 1024).toFixed(2)} KB`
  }

  return {
    tables,
    metadata,
    dbPath: DB_PATH,
    size
  }
}

/**
 * Promisify database methods for easier use
 * @param {sqlite3.Database} dbInstance
 * @returns {Object} Promisified database methods
 */
export function promisifyDb(dbInstance) {
  return {
    // Custom promisify for run() to capture lastID and changes
    run: (sql, params = []) => new Promise((resolve, reject) => {
      dbInstance.run(sql, params, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve({ lastID: this.lastID, changes: this.changes })
        }
      })
    }),
    get: promisify(dbInstance.get.bind(dbInstance)),
    all: promisify(dbInstance.all.bind(dbInstance)),
    exec: promisify(dbInstance.exec.bind(dbInstance))
  }
}

// Handle process termination gracefully
process.on('SIGINT', async () => {
  await closeDatabase()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await closeDatabase()
  process.exit(0)
})

// Command-line interface for migrations
if (process.argv[2] === '--migrate') {
  (async () => {
    try {
      console.log('Running migrations...')
      await getDatabase()
      const stats = await getDatabaseStats()
      console.log('\nDatabase Statistics:')
      console.log(JSON.stringify(stats, null, 2))
      await closeDatabase()
      process.exit(0)
    } catch (error) {
      console.error('Migration failed:', error)
      await closeDatabase()
      process.exit(1)
    }
  })()
}

export default { getDatabase, closeDatabase, getDatabaseStats, promisifyDb }
