#!/usr/bin/env node
/**
 * Cleanup Script: Remove Incomplete Pantone Entries
 *
 * Removes entries that are just "PANTONE" or "PANTONE C" without any color identifier
 */

import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DB_PATH = join(__dirname, '../data/app.db')

function cleanupIncompletePantone() {
  console.log('🔍 Scanning for incomplete Pantone entries...\n')

  const db = new Database(DB_PATH)

  try {
    // Find all incomplete entries
    const allColors = db.prepare('SELECT id, name, status FROM pantone_colors').all()

    // Filter for incomplete entries
    const incomplete = allColors.filter(r => {
      const name = r.name.trim()
      // Matches: "PANTONE", "PANTONE C", "PANTONE  ", etc.
      return /^PANTONE[\s]*C?[\s]*$/i.test(name)
    })

    console.log(`📊 Found ${incomplete.length} incomplete entries:`)
    console.log(`   - Total colors in database: ${allColors.length}`)
    console.log(`   - Incomplete entries to delete: ${incomplete.length}`)
    console.log(`   - Colors that will remain: ${allColors.length - incomplete.length}`)

    if (incomplete.length === 0) {
      console.log('\n✅ No incomplete entries found. Database is clean!')
      db.close()
      return
    }

    // Show sample of what will be deleted
    console.log('\n📋 Sample of entries to be deleted (first 10):')
    incomplete.slice(0, 10).forEach(r => {
      console.log(`   ID: ${r.id}, Name: "${r.name}", Status: ${r.status}`)
    })

    // Confirmation prompt
    console.log('\n⚠️  This will permanently delete these incomplete entries.')
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n')

    // Wait 5 seconds
    const start = Date.now()
    while (Date.now() - start < 5000) {
      // Busy wait (blocking)
    }

    // Delete incomplete entries
    console.log('🗑️  Deleting incomplete entries...')

    const deleteStmt = db.prepare('DELETE FROM pantone_colors WHERE id = ?')
    const deleteMany = db.transaction((entries) => {
      for (const entry of entries) {
        deleteStmt.run(entry.id)
      }
    })

    deleteMany(incomplete)

    // Verify deletion
    const remainingCount = db.prepare('SELECT COUNT(*) as count FROM pantone_colors').get().count

    console.log('\n✅ Cleanup complete!')
    console.log(`   - Deleted: ${incomplete.length} entries`)
    console.log(`   - Remaining: ${remainingCount} colors`)
    console.log(`   - Database: ${DB_PATH}`)

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error.message)
    process.exit(1)
  } finally {
    db.close()
  }
}

// Run cleanup
cleanupIncompletePantone()
