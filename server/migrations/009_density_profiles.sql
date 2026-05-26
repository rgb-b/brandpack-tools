-- Migration 009: Density Profiles
-- CMYK press profile reference database with nearest-match search

CREATE TABLE IF NOT EXISTS density_profiles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  printer       TEXT NOT NULL,
  profile_name  TEXT NOT NULL,
  print_type    TEXT,               -- 'RP', 'SP', 'CBW SP', null
  cyan          REAL,               -- null = incomplete profile (no data yet)
  magenta       REAL,
  yellow        REAL,
  black         REAL,
  comments      TEXT,
  status        TEXT NOT NULL DEFAULT 'ok',  -- 'ok' | 'needs_review'
  source_sheet  TEXT,               -- internal: 'Data' or 'Quartz' (import origin)
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_density_profiles_printer    ON density_profiles(printer);
CREATE INDEX IF NOT EXISTS idx_density_profiles_print_type ON density_profiles(print_type);
CREATE INDEX IF NOT EXISTS idx_density_profiles_status     ON density_profiles(status);
