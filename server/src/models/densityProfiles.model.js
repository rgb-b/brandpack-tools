/**
 * Density Profiles Model
 * Database operations for CMYK press profile reference database.
 */

import { promisifyDb } from '../config/database.js'

// ===== READ =====

export async function getAll (db, filters = {}) {
  const dbPromise = promisifyDb(db)
  const conditions = []
  const params = []

  if (filters.printer) {
    conditions.push('printer = ?')
    params.push(filters.printer)
  }

  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''
  return dbPromise.all(
    `SELECT * FROM density_profiles${where} ORDER BY printer, profile_name`,
    params
  )
}

export async function getById (db, id) {
  const dbPromise = promisifyDb(db)
  return dbPromise.get('SELECT * FROM density_profiles WHERE id = ?', [id])
}

export async function getPrinters (db) {
  const dbPromise = promisifyDb(db)
  const rows = await dbPromise.all(
    'SELECT DISTINCT printer FROM density_profiles ORDER BY printer'
  )
  return rows.map(r => r.printer)
}

/**
 * Search by Euclidean distance in 4D CMYK space.
 * Fetches all profiles with non-null CMYK (optionally filtered),
 * ranks by distance in JS, returns top `limit` results with distance attached.
 */
export async function search (db, { c, m, y, k, printer, print_type, limit = 20 } = {}) {
  const dbPromise = promisifyDb(db)
  const conditions = [
    'cyan IS NOT NULL',
    'magenta IS NOT NULL',
    'yellow IS NOT NULL',
    'black IS NOT NULL'
  ]
  const params = []

  if (printer) {
    conditions.push('printer = ?')
    params.push(printer)
  }

  if (print_type) {
    conditions.push('print_type = ?')
    params.push(print_type)
  }

  const profiles = await dbPromise.all(
    `SELECT * FROM density_profiles WHERE ${conditions.join(' AND ')}`,
    params
  )

  // Rank by Euclidean distance — only include channels that have a target value
  const channels = []
  if (c != null) channels.push(['cyan',    parseFloat(c)])
  if (m != null) channels.push(['magenta', parseFloat(m)])
  if (y != null) channels.push(['yellow',  parseFloat(y)])
  if (k != null) channels.push(['black',   parseFloat(k)])

  if (channels.length === 0) return profiles.slice(0, limit)

  const ranked = profiles.map(p => {
    const dist = Math.sqrt(
      channels.reduce((sum, [col, target]) => sum + (p[col] - target) ** 2, 0)
    )
    return { ...p, distance: Math.round(dist * 1000) / 1000 }
  })

  ranked.sort((a, b) => a.distance - b.distance)
  return ranked.slice(0, limit)
}

// ===== WRITE =====

export async function create (db, data) {
  const dbPromise = promisifyDb(db)
  const now = new Date().toISOString()

  const result = await dbPromise.run(
    `INSERT INTO density_profiles
      (printer, profile_name, print_type, cyan, magenta, yellow, black, comments, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.printer?.trim(),
      data.profile_name?.trim(),
      data.print_type || null,
      data.cyan   != null ? parseFloat(data.cyan)    : null,
      data.magenta != null ? parseFloat(data.magenta) : null,
      data.yellow  != null ? parseFloat(data.yellow)  : null,
      data.black   != null ? parseFloat(data.black)   : null,
      data.comments?.trim() || null,
      data.status || 'ok',
      now, now
    ]
  )

  return getById(db, result.lastID)
}

export async function update (db, id, data) {
  const dbPromise = promisifyDb(db)
  const existing = await getById(db, id)
  if (!existing) return null

  const now = new Date().toISOString()
  const allowed = ['printer', 'profile_name', 'print_type', 'cyan', 'magenta', 'yellow', 'black', 'comments', 'status']
  const fields = []
  const values = []

  for (const field of allowed) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`)
      const val = data[field]
      // Parse floats for CMYK fields
      values.push(['cyan','magenta','yellow','black'].includes(field)
        ? (val != null ? parseFloat(val) : null)
        : val)
    }
  }

  if (fields.length === 0) return existing

  fields.push('updated_at = ?')
  values.push(now, id)

  await dbPromise.run(
    `UPDATE density_profiles SET ${fields.join(', ')} WHERE id = ?`,
    values
  )

  return getById(db, id)
}

export async function remove (db, id) {
  const dbPromise = promisifyDb(db)
  const existing = await getById(db, id)
  if (!existing) return false
  await dbPromise.run('DELETE FROM density_profiles WHERE id = ?', [id])
  return true
}
