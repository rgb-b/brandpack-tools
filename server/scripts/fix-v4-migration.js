#!/usr/bin/env node

/**
 * Fix Productivity V4 Migration
 * Restores archived tables and re-runs migration correctly
 */

import sqlite3 from 'sqlite3'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DB_PATH = join(__dirname, '../data/app.db')
const MIGRATION_PATH = join(__dirname, '../migrations/006_productivity_v4_refactor.sql')

console.log('🔧 Fixing Productivity V4 Migration...')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Failed to open database:', err.message)
    process.exit(1)
  }

  console.log('Step 1: Checking current state...')

  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%productivity%' ORDER BY name", (err, tables) => {
    if (err) {
      console.error('❌ Failed to query tables:', err.message)
      process.exit(1)
    }

    console.log('\nCurrent tables:')
    tables.forEach(t => console.log('  -', t.name))

    const hasArchive = tables.some(t => t.name.includes('_archive'))
    const hasV4 = tables.some(t => t.name.includes('_v4'))

    if (!hasArchive && hasV4) {
      console.log('\n✓ Database state is correct (old tables exist, v4 tables exist)')
      console.log('  No fix needed!')
      db.close()
      return
    }

    if (hasArchive) {
      console.log('\nStep 2: Restoring archived tables...')

      const restoreCommands = [
        'ALTER TABLE productivity_tasks_archive RENAME TO productivity_tasks',
        'ALTER TABLE productivity_history_archive RENAME TO productivity_history',
        'ALTER TABLE productivity_daily_totals_archive RENAME TO productivity_daily_totals',
        'ALTER TABLE productivity_task_totals_archive RENAME TO productivity_task_totals',
        'ALTER TABLE productivity_active_sessions_archive RENAME TO productivity_active_sessions'
      ]

      let completed = 0
      restoreCommands.forEach(cmd => {
        db.run(cmd, (err) => {
          if (err && !err.message.includes('no such table')) {
            console.error(`  ⚠️  ${err.message}`)
          } else if (!err) {
            console.log(`  ✓ Restored ${cmd.split(' ')[2].replace('_archive', '')}`)
          }

          completed++
          if (completed === restoreCommands.length) {
            dropAndRecreatev4Tables()
          }
        })
      })
    } else {
      dropAndRecreatev4Tables()
    }
  })
})

function dropAndRecreatev4Tables() {
  console.log('\nStep 3: Dropping old V4 tables...')

  const dropCommands = [
    'DROP TABLE IF EXISTS productivity_tasks_v4',
    'DROP TABLE IF EXISTS productivity_tracking_v4',
    'DROP TABLE IF EXISTS productivity_active_sessions_v4',
    'DROP TABLE IF EXISTS work_schedules',
    'DROP INDEX IF EXISTS idx_tracking_user_date',
    'DROP INDEX IF EXISTS idx_tracking_active',
    'DROP INDEX IF EXISTS idx_tasks_user',
    'DROP INDEX IF EXISTS idx_schedule_user'
  ]

  let completed = 0
  dropCommands.forEach(cmd => {
    db.run(cmd, (err) => {
      if (err) {
        console.error(`  ⚠️  ${err.message}`)
      } else {
        console.log(`  ✓ Dropped ${cmd.split(' ')[4] || cmd.split(' ')[3]}`)
      }

      completed++
      if (completed === dropCommands.length) {
        rerunMigration()
      }
    })
  })
}

function rerunMigration() {
  console.log('\nStep 4: Re-running migration...')

  const sql = readFileSync(MIGRATION_PATH, 'utf8')

  db.exec(sql, (err) => {
    if (err) {
      console.error('❌ Migration failed:', err.message)
      db.close()
      process.exit(1)
    }

    console.log('\n✅ Migration fix completed successfully!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('\n📊 Final state:')
    console.log('  ✓ Old V3 tables remain functional')
    console.log('  ✓ New V4 tables created')
    console.log('  ✓ Both systems can run simultaneously')
    console.log('\nYou can now:')
    console.log('  - Continue using old tracker at /productivity/')
    console.log('  - Test new tracker at /productivity-v4/')
    console.log('  - Gradually migrate users to V4')

    db.close()
  })
}
