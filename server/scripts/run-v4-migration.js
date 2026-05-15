#!/usr/bin/env node

/**
 * Run Productivity V4 Migration
 * Executes the 006_productivity_v4_refactor.sql migration
 */

import sqlite3 from 'sqlite3'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DB_PATH = join(__dirname, '../data/app.db')
const MIGRATION_PATH = join(__dirname, '../migrations/006_productivity_v4_refactor.sql')

console.log('🔄 Running Productivity V4 Migration...')
console.log(`Database: ${DB_PATH}`)
console.log(`Migration: ${MIGRATION_PATH}`)

// Read migration SQL
const sql = readFileSync(MIGRATION_PATH, 'utf8')

// Open database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Failed to open database:', err.message)
    process.exit(1)
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON', (err) => {
    if (err) {
      console.error('❌ Failed to enable foreign keys:', err.message)
      process.exit(1)
    }

    // Execute migration
    db.exec(sql, (err) => {
      if (err) {
        console.error('❌ Migration failed:', err.message)
        db.close()
        process.exit(1)
      }

      console.log('✅ Migration completed successfully!')
      console.log('')
      console.log('📊 New tables created:')
      console.log('  - productivity_tasks_v4')
      console.log('  - productivity_tracking_v4')
      console.log('  - productivity_active_sessions_v4')
      console.log('  - work_schedules')
      console.log('')
      console.log('📦 Old tables archived:')
      console.log('  - productivity_tasks_archive')
      console.log('  - productivity_history_archive')
      console.log('  - productivity_daily_totals_archive')
      console.log('  - productivity_task_totals_archive')
      console.log('  - productivity_active_sessions_archive')

      db.close()
    })
  })
})
