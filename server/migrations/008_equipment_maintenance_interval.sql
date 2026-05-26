-- Migration 008: Equipment maintenance interval
-- Adds configurable maintenance interval (days) per equipment item
-- Defaults to 7 days (weekly). Used by dashboard maintenance reminder.

ALTER TABLE equipment ADD COLUMN maintenance_interval_days INTEGER DEFAULT 7;
