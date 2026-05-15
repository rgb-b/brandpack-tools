-- ============================================================================
-- WorkBase Database Schema v3.0.0
-- SQLite database schema for web server conversion
-- ============================================================================

-- ============================================================================
-- INVENTORY SYSTEM (2 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,              -- Item ID (e.g., 'T636200')
  printer TEXT NOT NULL,            -- Printer name (e.g., 'Epson 9900/WT7900')
  category TEXT NOT NULL,           -- Category (e.g., 'Shared Inks')
  name TEXT NOT NULL,               -- Full item name
  stock INTEGER NOT NULL DEFAULT 0, -- Current stock level
  unit TEXT NOT NULL,               -- Unit type (e.g., '700ml', 'roll')
  barcode TEXT,                     -- Manufacturer barcode (UPC/EAN, optional)
  low_stock_threshold INTEGER DEFAULT 2, -- Per-item low stock alert threshold
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_printer ON inventory_items(printer);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_stock ON inventory_items(stock);
CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory_items(barcode);

CREATE TABLE IF NOT EXISTS inventory_usage_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,            -- References inventory_items.id
  printer TEXT NOT NULL,
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,        -- Amount used (always positive)
  unit TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON inventory_usage_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_item ON inventory_usage_history(item_id);
CREATE INDEX IF NOT EXISTS idx_usage_date ON inventory_usage_history(DATE(timestamp));

-- ============================================================================
-- USERS (1 table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  pin TEXT NOT NULL,                -- 4-digit PIN stored as text
  role TEXT DEFAULT 'user',         -- 'user' or 'admin'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (role IN ('user', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ============================================================================
-- PRODUCTIVITY TRACKER (4 tables) - User-scoped
-- ============================================================================

CREATE TABLE IF NOT EXISTS productivity_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,         -- References users.id
  status TEXT NOT NULL,             -- 'working' or 'unavailable'
  name TEXT NOT NULL,               -- Task name (e.g., 'Admin', 'Lunch break')
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, status, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON productivity_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON productivity_tasks(status);

CREATE TABLE IF NOT EXISTS productivity_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,         -- References users.id
  status TEXT NOT NULL,             -- 'available', 'working', 'unavailable'
  task TEXT NOT NULL,               -- Task name
  start_time BIGINT NOT NULL,       -- Unix timestamp in milliseconds
  duration BIGINT NOT NULL,         -- Duration in milliseconds
  date DATE NOT NULL,               -- Date string YYYY-MM-DD
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_history_user ON productivity_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_date ON productivity_history(date);
CREATE INDEX IF NOT EXISTS idx_history_status ON productivity_history(status);
CREATE INDEX IF NOT EXISTS idx_history_task ON productivity_history(task);
CREATE INDEX IF NOT EXISTS idx_history_user_date ON productivity_history(user_id, date);

CREATE TABLE IF NOT EXISTS productivity_daily_totals (
  user_id INTEGER NOT NULL,         -- References users.id
  date DATE NOT NULL,               -- YYYY-MM-DD
  available BIGINT DEFAULT 0,       -- Milliseconds
  working BIGINT DEFAULT 0,         -- Milliseconds
  unavailable BIGINT DEFAULT 0,     -- Milliseconds
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_totals_user ON productivity_daily_totals(user_id);

CREATE TABLE IF NOT EXISTS productivity_task_totals (
  user_id INTEGER NOT NULL,         -- References users.id
  task_key TEXT NOT NULL,           -- Format: 'status-taskname'
  total_time BIGINT DEFAULT 0,      -- Total time in milliseconds
  PRIMARY KEY (user_id, task_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_totals_user ON productivity_task_totals(user_id);

CREATE TABLE IF NOT EXISTS productivity_active_sessions (
  user_id INTEGER PRIMARY KEY,              -- One session per user (PK enforces)
  status TEXT NOT NULL,                     -- 'available', 'working', 'unavailable'
  task TEXT NOT NULL,                       -- Task name
  start_time BIGINT NOT NULL,               -- Unix timestamp in milliseconds
  last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (status IN ('available', 'working', 'unavailable'))
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON productivity_active_sessions(user_id);

CREATE TABLE IF NOT EXISTS timeclock_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date DATE NOT NULL,                       -- YYYY-MM-DD
  clock_in BIGINT NOT NULL,                 -- Milliseconds since epoch
  clock_out BIGINT,                         -- NULL if still clocked in
  is_manual BOOLEAN DEFAULT 0,              -- 1 if manually added/adjusted
  notes TEXT,                               -- Optional notes for manual entries
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_timeclock_user_date ON timeclock_entries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_timeclock_user_clockout ON timeclock_entries(user_id, clock_out);

-- ============================================================================
-- PANTONE TRACKER (1 table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pantone_colors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  color_data TEXT NOT NULL,         -- JSON string of complete color object
  name TEXT NOT NULL,               -- Extracted for indexing
  status TEXT DEFAULT 'not_matched', -- 'not_matched', 'matched', 'old'
  match_date DATE,                  -- Date when matched (YYYY-MM-DD)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pantone_name ON pantone_colors(name);
CREATE INDEX IF NOT EXISTS idx_pantone_status ON pantone_colors(status);
CREATE INDEX IF NOT EXISTS idx_pantone_match_date ON pantone_colors(match_date);

-- ============================================================================
-- MAINTENANCE TRACKER (2 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS maintenance_checklist (
  date DATE NOT NULL,               -- YYYY-MM-DD
  item_id INTEGER NOT NULL,         -- Checklist item ID (0-14)
  item_text TEXT NOT NULL,          -- Checklist item description
  completed BOOLEAN DEFAULT 0,
  completed_at DATETIME,
  PRIMARY KEY (date, item_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_date ON maintenance_checklist(date);
CREATE INDEX IF NOT EXISTS idx_checklist_completed ON maintenance_checklist(completed);

CREATE TABLE IF NOT EXISTS maintenance_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine TEXT NOT NULL,            -- Machine name
  issue_type TEXT NOT NULL,         -- Issue category
  issue_subtype TEXT NOT NULL,      -- Specific issue type
  colors TEXT,                      -- JSON array of affected colors if applicable
  description TEXT NOT NULL,        -- Issue description
  photos TEXT,                      -- JSON array of base64 photo data
  status TEXT DEFAULT 'open',       -- 'open', 'in-progress', 'resolved'
  severity TEXT DEFAULT 'medium',   -- 'low', 'medium', 'high', 'critical'
  time_spent INTEGER DEFAULT 0,     -- Time in minutes
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  notes TEXT                        -- Additional notes
);

CREATE INDEX IF NOT EXISTS idx_issues_machine ON maintenance_issues(machine);
CREATE INDEX IF NOT EXISTS idx_issues_status ON maintenance_issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_created ON maintenance_issues(created_at);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON maintenance_issues(severity);

-- ============================================================================
-- DASHBOARD (2 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS dashboard_todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_todos_completed ON dashboard_todos(completed);

CREATE TABLE IF NOT EXISTS dashboard_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,               -- 'inventory', 'productivity', 'maintenance', etc.
  description TEXT NOT NULL,        -- Activity description
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON dashboard_activity(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON dashboard_activity(type);

-- ============================================================================
-- METADATA & CONFIGURATION (1 table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial metadata
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('schema_version', '3.1.0');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('last_backup', NULL);
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('initialized_at', datetime('now'));

-- ============================================================================
-- TRIGGERS for automatic timestamp updates
-- ============================================================================

-- Update inventory_items updated_at
CREATE TRIGGER IF NOT EXISTS update_inventory_timestamp
AFTER UPDATE ON inventory_items
BEGIN
  UPDATE inventory_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update pantone_colors updated_at
CREATE TRIGGER IF NOT EXISTS update_pantone_timestamp
AFTER UPDATE ON pantone_colors
BEGIN
  UPDATE pantone_colors SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update app_metadata updated_at
CREATE TRIGGER IF NOT EXISTS update_metadata_timestamp
AFTER UPDATE ON app_metadata
BEGIN
  UPDATE app_metadata SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
END;

-- Update timeclock_entries updated_at
CREATE TRIGGER IF NOT EXISTS update_timeclock_timestamp
AFTER UPDATE ON timeclock_entries
BEGIN
  UPDATE timeclock_entries SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================================
-- VIEWS for common queries
-- ============================================================================

-- Critical stock items (stock <= low_stock_threshold, default 2)
CREATE VIEW IF NOT EXISTS v_critical_stock AS
SELECT
  id,
  printer,
  category,
  name,
  stock,
  unit,
  low_stock_threshold
FROM inventory_items
WHERE stock <= COALESCE(low_stock_threshold, 2)
ORDER BY stock ASC, printer, category;

-- Recent activity (last 100 entries)
CREATE VIEW IF NOT EXISTS v_recent_activity AS
SELECT
  type,
  description,
  timestamp
FROM dashboard_activity
ORDER BY timestamp DESC
LIMIT 100;

-- Open maintenance issues
CREATE VIEW IF NOT EXISTS v_open_issues AS
SELECT
  id,
  machine,
  issue_type,
  issue_subtype,
  description,
  severity,
  created_at,
  CAST((julianday('now') - julianday(created_at)) AS INTEGER) as age_days
FROM maintenance_issues
WHERE status = 'open'
ORDER BY severity DESC, created_at ASC;

-- ============================================================================
-- SCHEMA COMPLETE
-- ============================================================================
