/**
 * Density Profiles Import Utility
 * Parses Original densities.xlsx and seeds the density_profiles table.
 * Safe to call repeatedly — checks if table is empty before seeding.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import * as XLSX from 'xlsx'
import { promisifyDb } from '../config/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SEED_PATH = join(__dirname, '../../data/seed/density-profiles.xlsx')

// Printer header rows to skip (not real printers)
const SKIP_VALUES = new Set(['ORIGINAL DENSITY', 'PRINTER', null, undefined])

// Printers whose profiles are flagged needs_review on import
const NEEDS_REVIEW_PRINTERS = new Set(['Golden', 'Integrated Packaging'])

// Known printer name typo corrections
const PRINTER_CORRECTIONS = {
  'Schur Star Sytems': 'Schur Star Systems'
}

/**
 * Extract print type from profile name string.
 * Returns 'CBW SP', 'SP', 'RP', or null.
 */
function extractPrintType (profileName) {
  const name = profileName.toUpperCase()
  if (name.includes('CBW')) return 'CBW SP'
  if (name.endsWith(' SP') || name.includes(' SP ') || name.includes('- SP') || name.includes('-SP')) return 'SP'
  if (name.endsWith(' RP') || name.includes(' RP ') || name.includes('- RP') || name.includes('-RP')) return 'RP'
  return null
}

/**
 * Parse both sheets from the seed Excel file.
 * Returns array of profile objects ready for DB insert.
 */
function parseExcel (filePath) {
  const buf = readFileSync(filePath)
  const wb = XLSX.read(buf, { type: 'buffer' })
  const profiles = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

    let currentPrinter = null

    for (let i = 3; i < rows.length; i++) {  // skip first 3 header rows
      const row = rows[i]
      if (!row || row.length === 0) continue

      const colA = row[0] != null ? String(row[0]).trim() : null
      const colB = row[1] != null ? String(row[1]).trim() : null
      const cyan    = row[2] != null ? parseFloat(row[2]) : null
      const magenta = row[3] != null ? parseFloat(row[3]) : null
      const yellow  = row[4] != null ? parseFloat(row[4]) : null
      const black   = row[5] != null ? parseFloat(row[5]) : null
      const comment = row[8] != null ? String(row[8]).trim() : null

      // Printer header row: col A has value, col B is null
      if (colA && !colB && !SKIP_VALUES.has(colA)) {
        const corrected = PRINTER_CORRECTIONS[colA] || colA
        currentPrinter = corrected
        continue
      }

      // Profile row: col B has value (col A may have an annotation note)
      if (colB && currentPrinter) {
        const correctedPrinter = PRINTER_CORRECTIONS[currentPrinter] || currentPrinter
        const profileName = colB.replace(/\s+/g, ' ').trim()
        const status = NEEDS_REVIEW_PRINTERS.has(correctedPrinter) ? 'needs_review' : 'ok'

        profiles.push({
          printer:      correctedPrinter,
          profile_name: profileName,
          print_type:   extractPrintType(profileName),
          cyan:         isNaN(cyan)    ? null : cyan,
          magenta:      isNaN(magenta) ? null : magenta,
          yellow:       isNaN(yellow)  ? null : yellow,
          black:        isNaN(black)   ? null : black,
          comments:     comment || null,
          status,
          source_sheet: sheetName
        })
      }
    }
  }

  return profiles
}

/**
 * Seed the database if the density_profiles table is empty.
 * Called automatically on server startup.
 */
export async function seedIfEmpty (db) {
  const dbPromise = promisifyDb(db)

  try {
    const row = await dbPromise.get('SELECT COUNT(*) as count FROM density_profiles')
    if (row.count > 0) return  // already seeded

    console.log('↳ Seeding density_profiles from Excel...')
    const profiles = parseExcel(SEED_PATH)
    await insertProfiles(db, profiles)
    console.log(`✓ Seeded ${profiles.length} density profiles`)
  } catch (err) {
    // Table might not exist yet on very first run — migrations run before this, so safe to warn
    console.warn('⚠ density_profiles seed skipped:', err.message)
  }
}

/**
 * Re-import from Excel, replacing all existing data.
 * Called from the admin API endpoint.
 */
export async function reimportFromExcel (db) {
  const dbPromise = promisifyDb(db)
  const profiles = parseExcel(SEED_PATH)

  await dbPromise.run('DELETE FROM density_profiles')
  await insertProfiles(db, profiles)

  return profiles.length
}

/**
 * Bulk insert an array of profile objects.
 */
async function insertProfiles (db, profiles) {
  const dbPromise = promisifyDb(db)
  const now = new Date().toISOString()

  const stmt = `
    INSERT INTO density_profiles
      (printer, profile_name, print_type, cyan, magenta, yellow, black, comments, status, source_sheet, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `

  for (const p of profiles) {
    await dbPromise.run(stmt, [
      p.printer, p.profile_name, p.print_type,
      p.cyan, p.magenta, p.yellow, p.black,
      p.comments, p.status, p.source_sheet,
      now, now
    ])
  }
}
