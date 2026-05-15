#!/usr/bin/env node

/**
 * Database Backup Script
 * Creates a timestamped copy of the SQLite database in server/backups/
 */

import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = resolve(__dirname, '../data/app.db')
const BACKUP_DIR = resolve(__dirname, '../backups')

if (!existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}`)
  process.exit(1)
}

mkdirSync(BACKUP_DIR, { recursive: true })

const now = new Date()
const timestamp = now.toISOString().replace(/[T:.]/g, '-').slice(0, 19)
const backupPath = resolve(BACKUP_DIR, `backup-${timestamp}.db`)

copyFileSync(DB_PATH, backupPath)
console.log(`Backed up to ${backupPath}`)
