#!/usr/bin/env node

/**
 * Clear existing data and import from data-fill.txt
 * Preserves: users, sessions
 * Clears: inventory, maintenance, pantone, dashboard, productivity
 */

import sqlite3 from 'sqlite3'
import { promisify } from 'util'

const dbPath = './data/app.db'

async function clearAndImport() {
  console.log('🗑️  Clearing and Importing Data\n')

  const db = new sqlite3.Database(dbPath)
  const run = promisify(db.run.bind(db))
  const all = promisify(db.all.bind(db))

  try {
    console.log('📊 Current data counts:')
    const tables = [
      'inventory_items',
      'inventory_usage_history',
      'maintenance_issues',
      'service_visits',
      'pantone_colors',
      'productivity_tasks',
      'productivity_history',
      'productivity_daily_totals',
      'productivity_task_totals',
      'productivity_active_sessions',
      'timeclock_entries',
      'dashboard_todos',
      'dashboard_activity'
    ]

    for (const table of tables) {
      const result = await all(`SELECT COUNT(*) as count FROM ${table}`)
      console.log(`  ${table}: ${result[0].count} rows`)
    }

    console.log('\n⚠️  WARNING: This will DELETE all data except users!')
    console.log('Press Ctrl+C within 3 seconds to cancel...\n')
    await new Promise(resolve => setTimeout(resolve, 3000))

    console.log('🗑️  Clearing data...\n')

    // Clear inventory
    console.log('  Clearing inventory...')
    await run('DELETE FROM inventory_usage_history')
    await run('DELETE FROM inventory_items')
    console.log('  ✅ Inventory cleared')

    // Clear maintenance
    console.log('  Clearing maintenance...')
    await run('DELETE FROM maintenance_issues')
    await run('DELETE FROM service_visits')
    console.log('  ✅ Maintenance cleared')

    // Clear pantone
    console.log('  Clearing pantone...')
    await run('DELETE FROM pantone_colors')
    console.log('  ✅ Pantone cleared')

    // Clear productivity
    console.log('  Clearing productivity...')
    await run('DELETE FROM productivity_active_sessions')
    await run('DELETE FROM productivity_task_totals')
    await run('DELETE FROM productivity_daily_totals')
    await run('DELETE FROM productivity_history')
    await run('DELETE FROM productivity_tasks')
    await run('DELETE FROM timeclock_entries')
    console.log('  ✅ Productivity cleared')

    // Clear dashboard
    console.log('  Clearing dashboard...')
    await run('DELETE FROM dashboard_activity')
    await run('DELETE FROM dashboard_todos')
    console.log('  ✅ Dashboard cleared')

    console.log('\n📥 Importing data from data-fill.txt...\n')

    // Roland VS-300i Inks
    console.log('  Adding Roland VS-300i Inks...')
    await run(`INSERT INTO inventory_items (id, printer, category, name, stock, unit) VALUES
      ('VS300-INK-CYAN', 'Roland VS-300i', 'Inks', 'Cyan', 2, 'cartridges'),
      ('VS300-INK-MAGENTA', 'Roland VS-300i', 'Inks', 'Magenta', 1, 'cartridges'),
      ('VS300-INK-YELLOW', 'Roland VS-300i', 'Inks', 'Yellow', 2, 'cartridges'),
      ('VS300-INK-BLACK', 'Roland VS-300i', 'Inks', 'Black', 2, 'cartridges'),
      ('VS300-INK-ORANGE', 'Roland VS-300i', 'Inks', 'Orange', 2, 'cartridges'),
      ('VS300-INK-GREEN', 'Roland VS-300i', 'Inks', 'Green', 2, 'cartridges'),
      ('VS300-INK-WHITE', 'Roland VS-300i', 'Inks', 'White', 3, 'cartridges'),
      ('VS300-INK-METALLIC', 'Roland VS-300i', 'Inks', 'Metallic', 3, 'cartridges')
    `)

    // Roland VS-300i Misc
    console.log('  Adding Roland VS-300i Misc...')
    await run(`INSERT INTO inventory_items (id, printer, category, name, stock, unit) VALUES
      ('VS300-MISC-SOLVENT', 'Roland VS-300i', 'Misc', 'Solvent', 1, 'bottles'),
      ('VS300-MISC-SWABS', 'Roland VS-300i', 'Misc', 'Cleaning swabs', 2, 'packs')
    `)

    // Epson 9900/WT7900 Inks
    console.log('  Adding Epson 9900/WT7900 Inks...')
    await run(`INSERT INTO inventory_items (id, printer, category, name, stock, unit) VALUES
      ('E9900-INK-CYAN', 'Epson 9900/WT7900', 'Inks', 'Cyan', 2, 'cartridges'),
      ('E9900-INK-LCYAN', 'Epson 9900/WT7900', 'Inks', 'Light Cyan', 2, 'cartridges'),
      ('E9900-INK-MAGENTA', 'Epson 9900/WT7900', 'Inks', 'Magenta', 2, 'cartridges'),
      ('E9900-INK-LMAGENTA', 'Epson 9900/WT7900', 'Inks', 'Light Magenta', 2, 'cartridges'),
      ('E9900-INK-YELLOW', 'Epson 9900/WT7900', 'Inks', 'Yellow', 2, 'cartridges'),
      ('E9900-INK-BLACK', 'Epson 9900/WT7900', 'Inks', 'Black', 2, 'cartridges'),
      ('E9900-INK-ORANGE', 'Epson 9900/WT7900', 'Inks', 'Orange', 2, 'cartridges'),
      ('E9900-INK-GREEN', 'Epson 9900/WT7900', 'Inks', 'Green', 2, 'cartridges'),
      ('E9900-INK-LBLACK', 'Epson 9900/WT7900', 'Inks', 'Light Black', 3, 'cartridges'),
      ('E9900-INK-LLBLACK', 'Epson 9900/WT7900', 'Inks', 'Light Light Black', 2, 'cartridges'),
      ('E9900-INK-WHITE', 'Epson 9900/WT7900', 'Inks', 'White', 3, 'cartridges')
    `)

    // Epson 9900/WT7900 Misc
    console.log('  Adding Epson 9900/WT7900 Misc...')
    await run(`INSERT INTO inventory_items (id, printer, category, name, stock, unit) VALUES
      ('E9900-MISC-FLUID', 'Epson 9900/WT7900', 'Misc', 'Cleaning fluid', 1, 'bottles'),
      ('E9900-MISC-TANK', 'Epson 9900/WT7900', 'Misc', 'Maintenance tank', 3, 'units')
    `)

    // Epson 9900/WT7900 Media
    console.log('  Adding Epson 9900/WT7900 Media...')
    await run(`INSERT INTO inventory_items (id, printer, category, name, stock, unit) VALUES
      ('E9900-MEDIA', 'Epson 9900', 'Media', 'Media', 2, 'rolls'),
      ('WT7900-MEDIA', 'Epson WT7900', 'Media', 'Media', 1, 'rolls')
    `)

    // Epson P9070 Inks
    console.log('  Adding Epson P9070 Inks...')
    await run(`INSERT INTO inventory_items (id, printer, category, name, stock, unit) VALUES
      ('P9070-INK-CYAN', 'Epson P9070', 'Inks', 'Cyan', 1, 'cartridges'),
      ('P9070-INK-LCYAN', 'Epson P9070', 'Inks', 'Light Cyan', 1, 'cartridges'),
      ('P9070-INK-MAGENTA', 'Epson P9070', 'Inks', 'Magenta', 1, 'cartridges'),
      ('P9070-INK-LMAGENTA', 'Epson P9070', 'Inks', 'Light Magenta', 1, 'cartridges'),
      ('P9070-INK-YELLOW', 'Epson P9070', 'Inks', 'Yellow', 1, 'cartridges'),
      ('P9070-INK-BLACK', 'Epson P9070', 'Inks', 'Black', 1, 'cartridges'),
      ('P9070-INK-ORANGE', 'Epson P9070', 'Inks', 'Orange', 1, 'cartridges'),
      ('P9070-INK-GREEN', 'Epson P9070', 'Inks', 'Green', 1, 'cartridges'),
      ('P9070-INK-VIOLET', 'Epson P9070', 'Inks', 'Violet', 1, 'cartridges'),
      ('P9070-INK-LBLACK', 'Epson P9070', 'Inks', 'Light Black', 1, 'cartridges'),
      ('P9070-INK-LLBLACK', 'Epson P9070', 'Inks', 'Light Light Black', 1, 'cartridges')
    `)

    // Epson P9070 Misc & Media
    console.log('  Adding Epson P9070 Misc & Media...')
    await run(`INSERT INTO inventory_items (id, printer, category, name, stock, unit) VALUES
      ('P9070-MISC-TANK', 'Epson P9070', 'Misc', 'Maintenance tank', 2, 'units'),
      ('P9070-MEDIA', 'Epson P9070', 'Media', 'Media', 2, 'rolls')
    `)

    // Other Stock
    console.log('  Adding Other Stock...')
    await run(`INSERT INTO inventory_items (id, printer, category, name, stock, unit) VALUES
      ('OTHER-LABELS', 'General', 'Misc', 'Labels', 4, 'packs')
    `)

    // Maintenance Issue
    console.log('  Adding Maintenance Issue...')
    await run(`INSERT INTO maintenance_issues
      (machine, issue_type, issue_subtype, description, severity, status, notes, created_at) VALUES
      (
        'Roland VS-300i',
        'Part failures/faults',
        'pump-failure',
        'Drain bottle broken on lid/seal. Needs to be replaced. Temporarily repaired.',
        'medium',
        'open',
        'Part number: 11369115. Happened on 2/2/26',
        '2026-02-02T00:00:00.000Z'
      )
    `)

    console.log('\n📊 New data counts:')
    for (const table of tables) {
      const result = await all(`SELECT COUNT(*) as count FROM ${table}`)
      console.log(`  ${table}: ${result[0].count} rows`)
    }

    console.log('\n✅ Data import complete!\n')
    console.log('Summary:')
    console.log('  - 39 inventory items added')
    console.log('  - 1 maintenance issue added')
    console.log('  - Users preserved')
    console.log('\nYou can now login and use the tools with your data!')

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    throw error
  } finally {
    db.close()
  }
}

clearAndImport().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
