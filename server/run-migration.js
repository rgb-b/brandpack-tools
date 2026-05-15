/**
 * Run a specific SQL migration file
 * Usage: node run-migration.js <migration-file>
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sqlite3 from 'sqlite3'

const __dirname = dirname(fileURLToPath(import.meta.url))

const migrationFile = process.argv[2]
if (!migrationFile) {
  console.error('Usage: node run-migration.js <migration-file>')
  process.exit(1)
}

const dbPath = join(__dirname, 'data', 'app.db')
const migrationPath = join(__dirname, 'migrations', migrationFile)

console.log(`Running migration: ${migrationFile}`)
console.log(`Database: ${dbPath}`)

const db = new sqlite3.Database(dbPath)

// Read migration SQL
const sql = readFileSync(migrationPath, 'utf8')

// Run migration
db.exec(sql, (err) => {
  if (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
  console.log('Migration completed successfully!')
  db.close()
})
