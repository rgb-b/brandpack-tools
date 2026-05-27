-- Ink Density Jobs
-- Stores press density readings per job; shapes/inks/weights are child records.

CREATE TABLE IF NOT EXISTS ink_density_jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  preset_name  TEXT NOT NULL DEFAULT '',
  job_name     TEXT NOT NULL DEFAULT '',
  job_number   TEXT NOT NULL DEFAULT '',
  customer     TEXT NOT NULL DEFAULT '',
  plate_tech   TEXT NOT NULL DEFAULT '',
  press_system TEXT NOT NULL DEFAULT '',
  esxr_number  TEXT NOT NULL DEFAULT '',
  print_type   TEXT NOT NULL DEFAULT '',
  date         TEXT NOT NULL DEFAULT '',
  set_number   TEXT NOT NULL DEFAULT '',
  step_labels  TEXT NOT NULL DEFAULT '["100","95","90","80","70","60","50","40","30","20","10","5","3","1"]',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ink channels per job (ordered by sort_order)
CREATE TABLE IF NOT EXISTS ink_density_inks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     INTEGER NOT NULL REFERENCES ink_density_jobs(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'spot',   -- cyan/magenta/yellow/black/white/spot
  name       TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Dot shapes per job (ordered by sort_order)
CREATE TABLE IF NOT EXISTS ink_density_shapes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     INTEGER NOT NULL REFERENCES ink_density_jobs(id) ON DELETE CASCADE,
  dot_type   TEXT NOT NULL DEFAULT '',
  dot_number TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- LPI weight readings per shape (ordered by sort_order)
-- density_json: JSON array of max-density values, one per ink
-- steps_json:   JSON 2D array [step_idx][ink_idx]
CREATE TABLE IF NOT EXISTS ink_density_weights (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  shape_id     INTEGER NOT NULL REFERENCES ink_density_shapes(id) ON DELETE CASCADE,
  lpi          TEXT NOT NULL DEFAULT '',
  density_json TEXT NOT NULL DEFAULT '[]',
  steps_json   TEXT NOT NULL DEFAULT '[]',
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ink_density_inks_job     ON ink_density_inks(job_id);
CREATE INDEX IF NOT EXISTS idx_ink_density_shapes_job   ON ink_density_shapes(job_id);
CREATE INDEX IF NOT EXISTS idx_ink_density_weights_shape ON ink_density_weights(shape_id);
