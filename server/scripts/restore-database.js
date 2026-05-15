#!/usr/bin/env node

/**
 * Database Restore Script
 * Restores the SQLite database from a backup file.
 *
 * Usage:
 *   npm run restore -- <backup-filename>
 *   node scripts/restore-database.js backup-2026-02-09-12-30-00.db
 *
 * Lists available backups if no argument provided.
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = resolve(__dirname, '../data/app.db')
const BACKUP_DIR = resolve(__dirname, '../backups')

const backupFile = process.argv[2]

if (!backupFile) {
  // List available backups
  if (!existsSync(BACKUP_DIR)) {
    console.log('No backups directory found.')
    process.exit(1)
  }

  const backups = readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .sort()
    .reverse()

  if (backups.length === 0) {
    console.log('No backup files found.')
    process.exit(1)
  }

  console.log('Available backups:')
  backups.forEach(b => console.log(`  ${b}`))
  console.log(`\nUsage: npm run restore -- <filename>`)
  process.exit(0)
}

const backupPath = resolve(BACKUP_DIR, backupFile)

if (!existsSync(backupPath)) {
  console.error(`Backup file not found: ${backupPath}`)
  process.exit(1)
}

// Create a safety backup of current DB before restoring
if (existsSync(DB_PATH)) {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[T:.]/g, '-').slice(0, 19)
  const safetyPath = resolve(BACKUP_DIR, `pre-restore-${timestamp}.db`)
  copyFileSync(DB_PATH, safetyPath)
  console.log(`Safety backup of current DB: ${safetyPath}`)
}

copyFileSync(backupPath, DB_PATH)
console.log(`Restored from ${backupFile}`)
console.log('Restart the server for changes to take effect.')
