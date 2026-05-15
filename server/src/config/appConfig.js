/**
 * App Configuration
 *
 * Loads and saves config.json from the project root.
 * Falls back to defaults if config.json doesn't exist.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// config.json lives at the project root (3 levels up from server/src/config/)
const CONFIG_PATH = join(__dirname, '../../../config.json')

const DEFAULTS = {
  app: {
    name: 'WorkBase',
    tagline: 'Team management tools',
    primaryColor: '#ff6b35',
    logoText: 'W'
  },
  setup_complete: false,
  tools: {
    inventory:       { enabled: true,  label: 'Inventory',     description: 'Track supplies and stock levels' },
    pantone:         { enabled: false, label: 'Colour Library', description: 'Colour matching and status tracker' },
    converter:       { enabled: false, label: 'Converter',      description: 'LAB ↔ CMYK colour conversion' },
    maintenance:     { enabled: true,  label: 'Maintenance',    description: 'Equipment issues and service log' },
    'productivity-v4': { enabled: true, label: 'Tasks',          description: 'Task tracking and time sessions' },
    admin:           { enabled: true,  label: 'Admin',          description: 'User and PIN management' }
  },
  equipment: []
}

/**
 * Deep merge two objects (target is mutated).
 */
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {}
      deepMerge(target[key], source[key])
    } else {
      target[key] = source[key]
    }
  }
  return target
}

let _config = null

/**
 * Load config from disk (or return defaults if not found).
 * Result is cached for the process lifetime; call reloadConfig() to refresh.
 */
export function getConfig() {
  if (_config) return _config

  _config = deepMerge({}, DEFAULTS)

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf8')
      const parsed = JSON.parse(raw)
      deepMerge(_config, parsed)
    } catch (err) {
      console.warn('⚠ Could not parse config.json, using defaults:', err.message)
    }
  }

  return _config
}

/**
 * Force reload from disk (useful after a write).
 */
export function reloadConfig() {
  _config = null
  return getConfig()
}

/**
 * Persist updated config to disk.
 * @param {object} updates - Partial config object (deep merged with current config)
 */
export function saveConfig(updates) {
  const current = getConfig()
  const next = deepMerge(deepMerge({}, current), updates)
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8')
  _config = next
  return _config
}

/**
 * Returns true if setup has been completed.
 */
export function isSetupComplete() {
  return getConfig().setup_complete === true
}
