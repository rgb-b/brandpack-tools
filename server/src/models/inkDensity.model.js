/**
 * Ink Density Model
 * CRUD for ink density jobs with nested inks, shapes, and LPI weights.
 *
 * Data shape mirrors xrite-export JobConfig:
 * { id, preset_name, job_name, job_number, customer, plate_tech, press_system,
 *   esxr_number, print_type, date, set_number, step_labels[],
 *   inks: [{kind, name}], shapes: [{dot_type, dot_number, weights: [{lpi, density[], steps[][]}]} ]
 * }
 */

import { promisifyDb } from '../config/database.js'

const DEFAULT_STEP_LABELS = ['100','95','90','80','70','60','50','40','30','20','10','5','3','1']
const DEFAULT_INKS = [
  { kind: 'cyan',    name: 'C' },
  { kind: 'magenta', name: 'M' },
  { kind: 'yellow',  name: 'Y' },
  { kind: 'black',   name: 'K' }
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJSON(str, fallback) {
  try { return JSON.parse(str) } catch { return fallback }
}

/** Assemble a fully-nested job object from flat rows */
function assembleJob(jobRow, inkRows, shapeRows, weightRows) {
  const inks = inkRows
    .filter(r => r.job_id === jobRow.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(r => ({ kind: r.kind, name: r.name }))

  const shapes = shapeRows
    .filter(r => r.job_id === jobRow.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => ({
      dot_type:   s.dot_type,
      dot_number: s.dot_number,
      weights: weightRows
        .filter(w => w.shape_id === s.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(w => ({
          lpi:     w.lpi,
          density: parseJSON(w.density_json, []),
          steps:   parseJSON(w.steps_json,   [])
        }))
    }))

  return {
    id:           jobRow.id,
    preset_name:  jobRow.preset_name,
    job_name:     jobRow.job_name,
    job_number:   jobRow.job_number,
    customer:     jobRow.customer,
    plate_tech:   jobRow.plate_tech,
    press_system: jobRow.press_system,
    esxr_number:  jobRow.esxr_number,
    print_type:   jobRow.print_type,
    date:         jobRow.date,
    set_number:   jobRow.set_number,
    step_labels:  parseJSON(jobRow.step_labels, DEFAULT_STEP_LABELS),
    inks,
    shapes,
    created_at:   jobRow.created_at,
    updated_at:   jobRow.updated_at
  }
}

// ── Write helpers ─────────────────────────────────────────────────────────────

async function insertInks(db, jobId, inks) {
  const d = promisifyDb(db)
  for (let i = 0; i < inks.length; i++) {
    const ink = inks[i]
    await d.run(
      'INSERT INTO ink_density_inks (job_id, kind, name, sort_order) VALUES (?,?,?,?)',
      [jobId, ink.kind || 'spot', ink.name || '', i]
    )
  }
}

async function insertShapesWeights(db, jobId, shapes) {
  const d = promisifyDb(db)
  for (let si = 0; si < shapes.length; si++) {
    const s = shapes[si]
    const sr = await d.run(
      'INSERT INTO ink_density_shapes (job_id, dot_type, dot_number, sort_order) VALUES (?,?,?,?)',
      [jobId, s.dot_type || '', s.dot_number || '', si]
    )
    const shapeId = sr.lastID
    const weights = s.weights || []
    for (let wi = 0; wi < weights.length; wi++) {
      const w = weights[wi]
      await d.run(
        'INSERT INTO ink_density_weights (shape_id, lpi, density_json, steps_json, sort_order) VALUES (?,?,?,?,?)',
        [shapeId, w.lpi || '', JSON.stringify(w.density || []), JSON.stringify(w.steps || []), wi]
      )
    }
  }
}

async function deleteChildren(db, jobId) {
  const d = promisifyDb(db)
  // weights cascade from shapes; shapes + inks cascade from job
  await d.run('DELETE FROM ink_density_inks WHERE job_id = ?', [jobId])
  // Get shape IDs to delete weights (SQLite may not support ON DELETE CASCADE without FK pragma,
  // but our init.sql enables foreign_keys = ON so it should cascade)
  await d.run('DELETE FROM ink_density_shapes WHERE job_id = ?', [jobId])
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** Returns summary list — no shapes/inks (for job browser) */
export async function getAllJobs(db) {
  const d = promisifyDb(db)
  const rows = await d.all(
    'SELECT * FROM ink_density_jobs ORDER BY updated_at DESC'
  )
  return rows.map(r => ({
    id:           r.id,
    preset_name:  r.preset_name,
    job_name:     r.job_name,
    job_number:   r.job_number,
    customer:     r.customer,
    plate_tech:   r.plate_tech,
    press_system: r.press_system,
    esxr_number:  r.esxr_number,
    print_type:   r.print_type,
    date:         r.date,
    set_number:   r.set_number,
    created_at:   r.created_at,
    updated_at:   r.updated_at
  }))
}

/** Returns fully nested job or null */
export async function getJob(db, id) {
  const d = promisifyDb(db)
  const job = await d.get('SELECT * FROM ink_density_jobs WHERE id = ?', [id])
  if (!job) return null

  const inks    = await d.all('SELECT * FROM ink_density_inks WHERE job_id = ?', [id])
  const shapes  = await d.all('SELECT * FROM ink_density_shapes WHERE job_id = ?', [id])
  const wRows   = shapes.length
    ? await d.all(
        `SELECT * FROM ink_density_weights WHERE shape_id IN (${shapes.map(() => '?').join(',')})`,
        shapes.map(s => s.id)
      )
    : []

  return assembleJob(job, inks, shapes, wRows)
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createJob(db, data) {
  const d = promisifyDb(db)
  const now = new Date().toISOString()

  const result = await d.run(
    `INSERT INTO ink_density_jobs
     (preset_name, job_name, job_number, customer, plate_tech, press_system,
      esxr_number, print_type, date, set_number, step_labels, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      data.preset_name  || '',
      data.job_name     || '',
      data.job_number   || '',
      data.customer     || '',
      data.plate_tech   || '',
      data.press_system || '',
      data.esxr_number  || '',
      data.print_type   || '',
      data.date         || '',
      data.set_number   || '',
      JSON.stringify(data.step_labels || DEFAULT_STEP_LABELS),
      now, now
    ]
  )

  const jobId = result.lastID
  await insertInks(db, jobId, data.inks || DEFAULT_INKS)
  await insertShapesWeights(db, jobId, data.shapes || [])

  return getJob(db, jobId)
}

// ── Update (full replace of nested data) ─────────────────────────────────────

export async function updateJob(db, id, data) {
  const d = promisifyDb(db)
  const existing = await d.get('SELECT id FROM ink_density_jobs WHERE id = ?', [id])
  if (!existing) return null

  const now = new Date().toISOString()

  await d.run(
    `UPDATE ink_density_jobs SET
     preset_name=?, job_name=?, job_number=?, customer=?, plate_tech=?, press_system=?,
     esxr_number=?, print_type=?, date=?, set_number=?, step_labels=?, updated_at=?
     WHERE id = ?`,
    [
      data.preset_name  || '',
      data.job_name     || '',
      data.job_number   || '',
      data.customer     || '',
      data.plate_tech   || '',
      data.press_system || '',
      data.esxr_number  || '',
      data.print_type   || '',
      data.date         || '',
      data.set_number   || '',
      JSON.stringify(data.step_labels || DEFAULT_STEP_LABELS),
      now, id
    ]
  )

  await deleteChildren(db, id)
  await insertInks(db, id, data.inks || DEFAULT_INKS)
  await insertShapesWeights(db, id, data.shapes || [])

  return getJob(db, id)
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteJob(db, id) {
  const d = promisifyDb(db)
  const existing = await d.get('SELECT id FROM ink_density_jobs WHERE id = ?', [id])
  if (!existing) return false
  await d.run('DELETE FROM ink_density_jobs WHERE id = ?', [id])
  return true
}
