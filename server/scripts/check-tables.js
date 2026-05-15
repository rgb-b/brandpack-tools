#!/usr/bin/env node

import sqlite3 from 'sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DB_PATH = join(__dirname, '../data/app.db')

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message)
    process.exit(1)
  }

  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%productivity%' ORDER BY name", (err, tables) => {
    if (err) {
      console.error('Query failed:', err.message)
      process.exit(1)
    }

    console.log('Productivity-related tables:')
    tables.forEach(t => console.log('  -', t.name))
    db.close()
  })
})
