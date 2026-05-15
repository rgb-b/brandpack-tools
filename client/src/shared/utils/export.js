/**
 * Export/Import utility functions for data portability
 */

import { storage } from './storage.js'
import { STORAGE_KEYS, VERSION } from '../constants.js'
import { formatDate } from './datetime.js'
import { isValidBackupData } from './validation.js'

/**
 * Export all data from all tools
 * @returns {object} Complete data backup
 */
export function exportAllData() {
  return {
    version: VERSION,
    exportDate: new Date().toISOString(),
    inventory: {
      inventory: storage.get(STORAGE_KEYS.INVENTORY, {}),
      history: storage.get(STORAGE_KEYS.USAGE_HISTORY, [])
    },
    productivity: {
      tasks: storage.get(STORAGE_KEYS.TASKS, {}),
      history: storage.get(STORAGE_KEYS.HISTORY, []),
      dailyTotalsByDate: storage.get(STORAGE_KEYS.DAILY_TOTALS, {}),
      taskTotals: storage.get(STORAGE_KEYS.TASK_TOTALS, {})
    },
    pantone: storage.get(STORAGE_KEYS.PANTONE_COLORS, []),
    maintenance: storage.get(STORAGE_KEYS.MAINTENANCE, {})
  }
}

/**
 * Import data from backup
 * @param {object} data - Backup data object
 * @returns {object} Result with success status and message
 */
export function importAllData(data) {
  try {
    // Validate backup data structure
    if (!isValidBackupData(data)) {
      return {
        success: false,
        message: 'Invalid backup data format'
      }
    }

    // Import inventory data
    if (data.inventory) {
      if (data.inventory.inventory) {
        storage.set(STORAGE_KEYS.INVENTORY, data.inventory.inventory)
      }
      if (data.inventory.history) {
        storage.set(STORAGE_KEYS.USAGE_HISTORY, data.inventory.history)
      }
    }

    // Import productivity data
    if (data.productivity) {
      if (data.productivity.tasks) {
        storage.set(STORAGE_KEYS.TASKS, data.productivity.tasks)
      }
      if (data.productivity.history) {
        storage.set(STORAGE_KEYS.HISTORY, data.productivity.history)
      }
      if (data.productivity.dailyTotalsByDate) {
        storage.set(STORAGE_KEYS.DAILY_TOTALS, data.productivity.dailyTotalsByDate)
      }
      if (data.productivity.taskTotals) {
        storage.set(STORAGE_KEYS.TASK_TOTALS, data.productivity.taskTotals)
      }
    }

    // Import Pantone colors
    if (data.pantone) {
      storage.set(STORAGE_KEYS.PANTONE_COLORS, data.pantone)
    }

    // Import maintenance data
    if (data.maintenance) {
      storage.set(STORAGE_KEYS.MAINTENANCE, data.maintenance)
    }

    return {
      success: true,
      message: 'Data imported successfully'
    }
  } catch (error) {
    console.error('Import error:', error)
    return {
      success: false,
      message: `Import failed: ${error.message}`
    }
  }
}

/**
 * Download data as JSON file
 * @param {object} data - Data to download
 * @param {string} filename - Filename (without extension)
 */
export function downloadJSON(data, filename) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Export all data and download as file
 * @param {string} prefix - Filename prefix (default: 'app-backup')
 */
export function exportAndDownload(prefix = 'app-backup') {
  const data = exportAllData()
  const filename = `${prefix}-${formatDate()}`
  downloadJSON(data, filename)
}

/**
 * Import data from file upload
 * @param {File} file - JSON file from input[type="file"]
 * @returns {Promise<object>} Result with success status
 */
export async function importFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result)
        const result = importAllData(data)
        resolve(result)
      } catch (error) {
        resolve({
          success: false,
          message: `Failed to parse JSON: ${error.message}`
        })
      }
    }

    reader.onerror = () => {
      resolve({
        success: false,
        message: 'Failed to read file'
      })
    }

    reader.readAsText(file)
  })
}
