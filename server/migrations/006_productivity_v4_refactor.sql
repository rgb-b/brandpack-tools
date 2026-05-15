-- Migration 006: Productivity V4 Refactor
-- Transforms status-based tracking into task-focused system with analytics
-- Archives old data, creates new schema, preserves timeclock functionality

-- ============================================================================
-- STEP 1: Keep Old Tables (No Archiving)
-- ============================================================================

-- NOTE: We are NOT renaming the old productivity tables.
-- The old system (V3) will continue to work alongside the new V4 system.
-- This allows for gradual migration and testing.
--
-- Old tables that remain unchanged:
--   - productivity_tasks
--   - productivity_history
--   - productivity_daily_totals
--   - productivity_task_totals
--   - productivity_active_sessions
--   - timeclock_entries (shared with V4)
--
-- Users can continue using the old /productivity/ route while testing /productivity-v4/

-- ============================================================================
-- STEP 2: Create New V4 Tables
-- ============================================================================

-- Task Library (per-user)
CREATE TABLE IF NOT EXISTS productivity_tasks_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT,  -- Optional grouping for future enhancement
  color TEXT,     -- Optional UI color (hex code)
  is_active INTEGER DEFAULT 1,  -- Soft delete: 1=active, 0=deleted
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Time Tracking Entries
CREATE TABLE IF NOT EXISTS productivity_tracking_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  task_name TEXT NOT NULL,  -- Denormalized for faster analytics queries
  start_time INTEGER NOT NULL,  -- Milliseconds since epoch
  end_time INTEGER,  -- NULL = currently tracking
  duration INTEGER,  -- Milliseconds (calculated when stopped)
  date TEXT NOT NULL,  -- YYYY-MM-DD for filtering
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES productivity_tasks_v4(id) ON DELETE SET NULL
);

-- Active Session (one row per user for real-time sync)
CREATE TABLE IF NOT EXISTS productivity_active_sessions_v4 (
  user_id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL,
  task_name TEXT NOT NULL,
  start_time INTEGER NOT NULL,  -- Milliseconds since epoch
  last_heartbeat INTEGER DEFAULT (strftime('%s','now') * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES productivity_tasks_v4(id) ON DELETE CASCADE
);

-- Work Schedule Configuration
CREATE TABLE IF NOT EXISTS work_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,  -- 0=Sunday, 1=Monday, ..., 6=Saturday
  start_time TEXT NOT NULL,  -- HH:MM format (24-hour)
  end_time TEXT NOT NULL,    -- HH:MM format (24-hour)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, day_of_week),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- STEP 3: Create Indexes
-- ============================================================================

-- Tracking queries by user and date
CREATE INDEX IF NOT EXISTS idx_tracking_user_date ON productivity_tracking_v4(user_id, date);

-- Find active tracking sessions
CREATE INDEX IF NOT EXISTS idx_tracking_active ON productivity_tracking_v4(user_id, end_time) WHERE end_time IS NULL;

-- Task lookup by user
CREATE INDEX IF NOT EXISTS idx_tasks_user ON productivity_tasks_v4(user_id, is_active);

-- Schedule lookup by user
CREATE INDEX IF NOT EXISTS idx_schedule_user ON work_schedules(user_id);

-- ============================================================================
-- NOTES
-- ============================================================================

-- Migration Strategy:
-- - Old V3 tables remain unchanged and functional
-- - New V4 tables created alongside old tables
-- - No data migration (fresh start for V4)
-- - Users can use both systems during transition
-- - Old /productivity/ route continues to work
-- - New /productivity-v4/ route uses new tables

-- Rollback Procedure:
-- If issues found, can remove V4 system by:
-- 1. DROP TABLE productivity_tasks_v4;
-- 2. DROP TABLE productivity_tracking_v4;
-- 3. DROP TABLE productivity_active_sessions_v4;
-- 4. DROP TABLE work_schedules;
-- 5. Old system continues to work normally

-- Timeclock Integration:
-- - timeclock_entries table unchanged
-- - New productivity system uses same timeclock API
-- - Auto clock-in/out triggered by work_schedules + productivity tracking

-- Data Ownership:
-- - All productivity data is per-user (isolated by user_id)
-- - Work schedules are per-user (each user configures their own hours)
-- - Cross-device sync via productivity_active_sessions_v4
