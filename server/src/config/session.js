/**
 * Session Configuration
 * Configures express-session with SQLite session store for persistent authentication
 */

import session from 'express-session'
import connectSqlite3 from 'connect-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Initialize SQLite session store
const SQLiteStore = connectSqlite3(session)

// Session secret - MUST be set in production
const SESSION_SECRET = process.env.SESSION_SECRET
const NODE_ENV = process.env.NODE_ENV || 'development'
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE || '86400000', 10) // 24 hours default

// Production safety check
if (!SESSION_SECRET) {
  if (NODE_ENV === 'production') {
    throw new Error(
      '❌ FATAL: SESSION_SECRET environment variable is required in production.\n' +
      '   Generate a secure secret with: openssl rand -base64 32\n' +
      '   Add it to your .env file: SESSION_SECRET=your-secret-here'
    )
  }
  console.warn('⚠️  WARNING: Using default SESSION_SECRET for development.')
  console.warn('⚠️  DO NOT deploy to production without setting SESSION_SECRET!')
}

/**
 * Create and configure session middleware
 * @returns {Function} Express session middleware
 */
export function createSessionMiddleware() {
  return session({
    secret: SESSION_SECRET || 'dev-secret-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({
      db: 'sessions.db',
      dir: join(__dirname, '../../data')
    }),
    cookie: {
      maxAge: SESSION_MAX_AGE,
      httpOnly: true, // Prevent client-side JS access to cookies
      secure: false, // Set to true only if using HTTPS
      sameSite: 'lax' // CSRF protection
    }
  })
}

export default createSessionMiddleware
