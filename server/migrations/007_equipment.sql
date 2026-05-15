-- Migration 007: Equipment table
-- Replaces hardcoded printer/machine lists in constants.js
-- Inventory items link to equipment by name (backwards compatible)

CREATE TABLE IF NOT EXISTS equipment (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  category   TEXT NOT NULL DEFAULT 'General',
  notes      TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed from existing inventory_items distinct printer values
-- (runs on existing DBs — new installs will populate via setup wizard)
INSERT OR IGNORE INTO equipment (name, category)
SELECT DISTINCT printer, 'Equipment'
FROM inventory_items
WHERE printer IS NOT NULL AND printer != '';
