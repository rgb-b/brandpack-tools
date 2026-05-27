/**
 * Inventory System v3.0
 * API-based inventory management with barcode scanner support
 */

import '../../shared/components/AppHeader.js'
import '../../shared/components/AppFooter.js'
import '../../shared/components/Modal.js'
import { inventory as inventoryAPI, dashboard } from '../../api/client.js'
import { formatDate } from '../../shared/utils/datetime.js'
import '../../shared/utils/cyberpunk-effects.js'
import { requireAuth } from '../../shared/utils/auth.js'

// Dynamic import for onscan.js to handle UMD module
let onScan = null

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let items = []
let usageHistory = []
let currentView = 'machines' // Start with machine selection view
let statsFilter = 'month'
let selectedPrinter = null // Currently selected machine/printer
let selectedCategory = null
let filterPrinter = null
let filterCategory = null

// Search/filter state
let searchQuery = ''

// Barcode scanner state
let isDeliveryMode = false
let deliveryQueue = []
let scannerDebugMode = false
let lastScan = null

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Load all inventory items from API
 */
async function loadInventory() {
  try {
    console.log('[Inventory] Loading inventory with filters:', { filterPrinter, filterCategory })

    // API Health Check
    try {
      const healthResponse = await fetch('/api/health')
      if (!healthResponse.ok) {
        throw new Error('API server not responding')
      }
      console.log('[Inventory] API health check passed')
    } catch (healthError) {
      console.error('[Inventory] API health check failed:', healthError)
      showErrorBanner('Cannot connect to server', 'Check that the server is running on port 8080')
      return []
    }

    const filters = {}
    if (filterPrinter) filters.printer = filterPrinter
    if (filterCategory) filters.category = filterCategory

    const response = await inventoryAPI.getAll(filters)
    items = response.data || response || []

    console.log(`[Inventory] Loaded ${items.length} items:`, items)

    if (items.length === 0) {
      console.warn('[Inventory] No items found in database')
    }

    return items
  } catch (error) {
    console.error('[Inventory] Error loading inventory:', error)
    console.error('[Inventory] Error stack:', error.stack)
    showToast('Failed to load inventory', 'error')
    showErrorBanner('Failed to load inventory', error.message)
    return []
  }
}

/**
 * Load usage history from API
 */
async function loadUsageHistory() {
  try {
    const filters = {}

    // Apply date filter based on statsFilter
    const now = new Date()
    let startDate

    switch (statsFilter) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = null
    }

    if (startDate) {
      filters.startDate = startDate.toISOString().split('T')[0]
    }

    const response = await inventoryAPI.getUsageHistory(filters)
    usageHistory = response.data || response || []
    return usageHistory
  } catch (error) {
    console.error('Error loading usage history:', error)
    return []
  }
}

/**
 * Load critical stock items
 */
async function loadCriticalStock() {
  try {
    const response = await inventoryAPI.getCritical()
    return response.data || response || []
  } catch (error) {
    console.error('Error loading critical stock:', error)
    return []
  }
}

// ============================================================================
// BARCODE SCANNER INITIALIZATION
// ============================================================================

/**
 * Initialize barcode scanner with onScan.js
 */
async function initScanner() {
  try {
    // Dynamically import onscan.js
    if (!onScan) {
      const module = await import('onscan.js')
      onScan = module.default || module
    }

    onScan.attachTo(document, {
      suffixKeyCodes: [13], // Enter key
      reactToPaste: true,   // Support paste mode
      minLength: 4,         // Minimum barcode length
      timeBeforeScanTest: 200,
      avgTimeByChar: 40,    // Speed detection: 40ms between chars
      onScan: (scannedCode) => handleBarcodeScanned(scannedCode),
      onKeyDetect: (keyCode) => {
        if (scannerDebugMode) {
          console.log('[Scanner] Key detected:', keyCode)
          updateDebugPanel({ lastKey: keyCode })
        }
      }
    })
    console.log('[Scanner] Initialized successfully')
  } catch (error) {
    console.error('[Scanner] Failed to initialize:', error)
  }
}

/**
 * Handle barcode scan event
 */
async function handleBarcodeScanned(barcode) {
  console.log('[Scanner] Barcode scanned:', barcode)

  // Update debug info
  if (scannerDebugMode) {
    lastScan = {
      code: barcode,
      timestamp: new Date(),
      length: barcode.length
    }
    updateDebugPanel(lastScan)
  }

  // Show loading toast
  const loadingToast = showToast('Looking up item...', 'info', false)

  try {
    const response = await inventoryAPI.getByBarcode(barcode)
    const item = response.data || response

    if (loadingToast) {
      document.getElementById(loadingToast).remove()
    }

    if (item) {
      // Route based on current mode
      if (isDeliveryMode) {
        addToDeliveryQueue(item)
      } else {
        showQuickAdjustModal(item)
      }
    }
  } catch (error) {
    if (loadingToast) {
      document.getElementById(loadingToast).remove()
    }

    if (error.message && error.message.includes('404')) {
      // Not found: show "add item" modal with barcode pre-filled
      showToast(`Barcode ${barcode} not found`, 'warning')
      showAddItemModal({ barcode })
    } else {
      showToast('Error looking up item: ' + error.message, 'error')
    }
  }
}

// ============================================================================
// DELIVERY MODE
// ============================================================================

/**
 * Toggle delivery mode
 */
function toggleDeliveryMode() {
  isDeliveryMode = !isDeliveryMode

  if (isDeliveryMode) {
    deliveryQueue = []
    showToast('Delivery mode activated - scan items to add to queue', 'info')
  } else {
    deliveryQueue = []
    showToast('Delivery mode deactivated', 'info')
  }

  render()
}

/**
 * Add item to delivery queue
 */
function addToDeliveryQueue(item) {
  // Check if item already in queue
  const existing = deliveryQueue.find(q => q.item.id === item.id)

  if (existing) {
    existing.quantity += 1
    showToast(`${item.name} quantity increased to ${existing.quantity}`, 'success')
  } else {
    deliveryQueue.push({
      item: item,
      quantity: 1
    })
    showToast(`Added ${item.name} to delivery queue`, 'success')
  }

  render()
}

/**
 * Remove item from delivery queue
 */
function removeFromDeliveryQueue(itemId) {
  deliveryQueue = deliveryQueue.filter(q => q.item.id !== itemId)
  render()
}

/**
 * Update delivery queue item quantity
 */
function updateDeliveryQueueQuantity(itemId, quantity) {
  const queueItem = deliveryQueue.find(q => q.item.id === itemId)
  if (queueItem) {
    queueItem.quantity = Math.max(1, parseInt(quantity) || 1)
    render()
  }
}

/**
 * Save all delivery queue items
 */
async function saveDeliveryQueue() {
  if (deliveryQueue.length === 0) {
    showToast('Delivery queue is empty', 'warning')
    return
  }

  const loadingToast = showToast(`Saving ${deliveryQueue.length} items...`, 'info', false)

  try {
    // Update each item's stock
    for (const queueItem of deliveryQueue) {
      const newStock = queueItem.item.stock + queueItem.quantity
      await inventoryAPI.update(queueItem.item.id, { stock: newStock })
    }

    if (loadingToast) {
      document.getElementById(loadingToast).remove()
    }

    showToast(`Successfully updated ${deliveryQueue.length} items`, 'success')
    deliveryQueue = []
    isDeliveryMode = false
    await loadInventory()
    render()
  } catch (error) {
    if (loadingToast) {
      document.getElementById(loadingToast).remove()
    }
    showToast('Error saving delivery: ' + error.message, 'error')
  }
}

/**
 * Clear delivery queue
 */
function clearDeliveryQueue() {
  deliveryQueue = []
  showToast('Delivery queue cleared', 'info')
  render()
}

// ============================================================================
// QUICK ADJUST MODAL (Normal Mode)
// ============================================================================

/**
 * Show quick adjust modal for scanned item
 */
function showQuickAdjustModal(item) {
  const modalContent = `
    <div class="quick-adjust-modal">
      <h3>📦 Scanned: ${item.id}</h3>
      <div class="item-details">
        <h4>${item.name}</h4>
        <p class="item-meta">${item.printer} › ${item.category}</p>
        ${item.barcode ? `<p class="item-barcode">🏷️ ${item.barcode}</p>` : ''}
        <p class="current-stock">Current Stock: <strong>${item.stock} ${item.unit}</strong></p>
      </div>

      <div class="quick-buttons">
        <h5>Quick Adjust:</h5>
        <div class="button-group">
          <button class="btn-adjust" data-change="-5">-5</button>
          <button class="btn-adjust" data-change="-1">-1</button>
          <button class="btn-adjust" data-change="1">+1</button>
          <button class="btn-adjust" data-change="5">+5</button>
          <button class="btn-adjust" data-change="10">+10</button>
        </div>
      </div>

      <div class="manual-adjust">
        <label>Or adjust by:</label>
        <input type="number" id="adjustAmount" placeholder="+ to add, - to remove" />
        <small>Enter positive number to add, negative to remove</small>
      </div>

      <div class="modal-actions">
        <button class="btn-primary" id="updateStock">Update</button>
        <button class="btn-secondary" id="cancelAdjust">Cancel</button>
      </div>
    </div>
  `

  showModal('Quick Adjust Stock', modalContent)

  // Attach event listeners
  document.querySelectorAll('.btn-adjust').forEach(btn => {
    btn.addEventListener('click', async () => {
      const change = parseInt(btn.dataset.change)
      await updateItemStock(item, change)
      hideModal()
    })
  })

  document.getElementById('updateStock').addEventListener('click', async () => {
    const adjustAmount = parseInt(document.getElementById('adjustAmount').value)
    if (adjustAmount && adjustAmount !== 0) {
      await updateItemStock(item, adjustAmount)
      hideModal()
    } else {
      showToast('Please enter an adjustment amount', 'warning')
    }
  })

  document.getElementById('cancelAdjust').addEventListener('click', () => {
    hideModal()
  })
}

/**
 * Update item stock with loading states and visual feedback
 */
async function updateItemStock(item, change) {
  console.log('[Inventory] updateItemStock called with:', {
    itemId: item.id,
    itemName: item.name,
    currentStock: item.stock,
    change: change,
    newStock: item.stock + change
  })

  // Find the item card in the DOM
  const itemCard = document.querySelector(`.item-card[data-id="${item.id}"]`)
  const plusBtn = itemCard?.querySelector('.stock-btn-plus')
  const minusBtn = itemCard?.querySelector('.stock-btn-minus')
  const stockDisplay = itemCard?.querySelector('.stock-display')

  try {
    const newStock = item.stock + change

    if (newStock < 0) {
      console.warn('[Inventory] Stock cannot be negative:', newStock)
      showToast('Stock cannot be negative', 'error')

      // Flash error on card
      if (itemCard) {
        itemCard.classList.add('flash-error')
        setTimeout(() => itemCard.classList.remove('flash-error'), 600)
      }
      return
    }

    // Disable buttons and show loading state
    if (plusBtn) plusBtn.disabled = true
    if (minusBtn) minusBtn.disabled = true
    if (stockDisplay) {
      stockDisplay.style.opacity = '0.5'
      stockDisplay.textContent = '...'
    }

    console.log('[Inventory] Calling API to update stock...')
    const response = await inventoryAPI.update(item.id, { stock: newStock })
    console.log('[Inventory] API response:', response)

    showToast(`✓ ${item.name}: ${item.stock} → ${newStock} ${item.unit}`, 'success')
    const action = change > 0 ? 'Restocked' : 'Used'
    dashboard.createActivity({ type: 'inventory', description: `${action} ${item.name}: ${item.stock} → ${newStock} ${item.unit}` }).catch(() => {})

    // Flash success on card
    if (itemCard) {
      itemCard.classList.add('flash-success')
      setTimeout(() => itemCard.classList.remove('flash-success'), 600)
    }

    console.log('[Inventory] Reloading inventory...')
    await loadInventory()

    console.log('[Inventory] Re-rendering UI...')
    render()
  } catch (error) {
    console.error('[Inventory] Error updating stock:', error)
    console.error('[Inventory] Error stack:', error.stack)
    showToast('Error updating stock: ' + error.message, 'error')
    showErrorBanner('Failed to update stock', `Item: ${item.name}, Error: ${error.message}`)

    // Flash error on card
    if (itemCard) {
      itemCard.classList.add('flash-error')
      setTimeout(() => itemCard.classList.remove('flash-error'), 600)
    }

    // Re-enable buttons on error
    if (plusBtn) plusBtn.disabled = false
    if (minusBtn) minusBtn.disabled = false
    if (stockDisplay) {
      stockDisplay.style.opacity = '1'
      stockDisplay.textContent = `${item.stock} ${item.unit}`
    }
  }
}

// ============================================================================
// SAMPLE DATA LOADING
// ============================================================================

/**
 * Load sample inventory data for testing and demonstration
 */
async function loadSampleData() {
  const confirmed = confirm(
    'Load Sample Data?\n\n' +
    'This will add 25+ sample inventory items including:\n' +
    '• Epson 9900/WT7900 inks (8 items)\n' +
    '• Roland VS300 inks (4 items)\n' +
    '• Media (vinyl, paper, canvas)\n' +
    '• Laminate rolls\n' +
    '• Maintenance supplies\n\n' +
    'All items include barcodes for scanner testing.\n\n' +
    'Continue?'
  )

  if (!confirmed) return

  console.log('[Inventory] Loading sample data...')

  const loadingToast = showToast('Loading sample data...', 'info', false)

  try {
    // Sample data is defined inline to avoid circular dependency
    const sampleData = [
      // Epson inks
      { id: 'T636100', name: 'Photo Black - 700ml', printer: 'Epson 9900/WT7900', category: 'Ink', stock: 3, unit: 'cartridge', barcode: '010343851931' },
      { id: 'T636200', name: 'Cyan - 700ml', printer: 'Epson 9900/WT7900', category: 'Ink', stock: 2, unit: 'cartridge', barcode: '010343851948' },
      { id: 'T636300', name: 'Vivid Magenta - 700ml', printer: 'Epson 9900/WT7900', category: 'Ink', stock: 2, unit: 'cartridge', barcode: '010343851955' },
      { id: 'T636400', name: 'Yellow - 700ml', printer: 'Epson 9900/WT7900', category: 'Ink', stock: 1, unit: 'cartridge', barcode: '010343851962' },
      { id: 'T636500', name: 'Light Cyan - 700ml', printer: 'Epson 9900/WT7900', category: 'Ink', stock: 2, unit: 'cartridge', barcode: '010343851979' },
      { id: 'T636600', name: 'Vivid Light Magenta - 700ml', printer: 'Epson 9900/WT7900', category: 'Ink', stock: 2, unit: 'cartridge', barcode: '010343851986' },
      { id: 'T636700', name: 'Light Black - 700ml', printer: 'Epson 9900/WT7900', category: 'Ink', stock: 3, unit: 'cartridge', barcode: '010343851993' },
      { id: 'T636800', name: 'Matte Black - 700ml', printer: 'Epson 9900/WT7900', category: 'Ink', stock: 4, unit: 'cartridge', barcode: '010343852006' },

      // Roland inks
      { id: 'ESL3-4CY', name: 'Cyan ECO-SOL MAX 3 - 440cc', printer: 'Roland VS300', category: 'Ink', stock: 3, unit: 'cartridge', barcode: '012345678001' },
      { id: 'ESL3-4MG', name: 'Magenta ECO-SOL MAX 3 - 440cc', printer: 'Roland VS300', category: 'Ink', stock: 3, unit: 'cartridge', barcode: '012345678002' },
      { id: 'ESL3-4YE', name: 'Yellow ECO-SOL MAX 3 - 440cc', printer: 'Roland VS300', category: 'Ink', stock: 2, unit: 'cartridge', barcode: '012345678003' },
      { id: 'ESL3-4BK', name: 'Black ECO-SOL MAX 3 - 440cc', printer: 'Roland VS300', category: 'Ink', stock: 4, unit: 'cartridge', barcode: '012345678004' },

      // Vinyl
      { id: 'VINYL-3651', name: '3M IJ3651 Vinyl - 54" x 50yd', printer: 'Roland VS300', category: 'Media', stock: 2, unit: 'roll', barcode: '051131687653' },
      { id: 'VINYL-180CV3', name: '3M 180CV3 Cast Vinyl - 60" x 50yd', printer: 'Roland VS300', category: 'Media', stock: 1, unit: 'roll', barcode: '051131687660' },
      { id: 'VINYL-ORACAL', name: 'Oracal 3651 White Vinyl - 54" x 50yd', printer: 'Roland VS300', category: 'Media', stock: 3, unit: 'roll', barcode: '012345670001' },

      // Paper
      { id: 'PAPER-PHOTO', name: 'Premium Luster Photo Paper - 44" x 100ft', printer: 'Epson 9900/WT7900', category: 'Media', stock: 2, unit: 'roll', barcode: '010343859364' },
      { id: 'PAPER-CANVAS', name: 'Enhanced Matte Canvas - 44" x 40ft', printer: 'Epson 9900/WT7900', category: 'Media', stock: 1, unit: 'roll', barcode: '010343859371' },
      { id: 'PAPER-PROOF', name: 'Proofing Paper - 44" x 100ft', printer: 'Epson 9900/WT7900', category: 'Media', stock: 3, unit: 'roll', barcode: '010343859388' },

      // Laminate
      { id: 'LAM-8518', name: '3M Scotchcal 8518 Gloss Laminate - 54" x 50yd', printer: 'Roland VS300', category: 'Laminate', stock: 2, unit: 'roll', barcode: '051131687677' },
      { id: 'LAM-8519', name: '3M Scotchcal 8519 Luster Laminate - 54" x 50yd', printer: 'Roland VS300', category: 'Laminate', stock: 1, unit: 'roll', barcode: '051131687684' },

      // Maintenance
      { id: 'MAINT-WIPER', name: 'Roland Wiper Sheets (100 pack)', printer: 'Roland VS300', category: 'Maintenance', stock: 15, unit: 'pack', barcode: '012345670101' },
      { id: 'MAINT-CLEAN', name: 'Epson Cleaning Cartridge', printer: 'Epson 9900/WT7900', category: 'Maintenance', stock: 2, unit: 'unit', barcode: '010343852013' },
      { id: 'MAINT-BLADE', name: 'Roland Cutting Blade - 45° (5 pack)', printer: 'Roland VS300', category: 'Maintenance', stock: 8, unit: 'pack', barcode: '012345670102' },
      { id: 'MAINT-MAT', name: 'Roland Cutting Mat - 12" x 24"', printer: 'Roland VS300', category: 'Maintenance', stock: 5, unit: 'unit', barcode: '012345670103' }
    ]

    console.log('[Inventory] Calling bulk create API with', sampleData.length, 'items')

    const response = await inventoryAPI.bulkCreate(sampleData)
    const result = response.data || response

    console.log('[Inventory] Bulk create response:', result)

    if (loadingToast) {
      document.getElementById(loadingToast).remove()
    }

    if (result.errorCount > 0) {
      showToast(
        `Loaded ${result.successCount} items (${result.errorCount} already existed)`,
        'warning'
      )
      console.warn('[Inventory] Some items already existed:', result.errors)
    } else {
      showToast(`Successfully loaded ${result.successCount} sample items!`, 'success')
    }

    await loadInventory()
    render()
  } catch (error) {
    if (loadingToast) {
      document.getElementById(loadingToast).remove()
    }
    console.error('[Inventory] Error loading sample data:', error)
    showToast('Error loading sample data: ' + error.message, 'error')
    showErrorBanner('Failed to load sample data', error.message)
  }
}

// ============================================================================
// ADD ITEM MODAL
// ============================================================================

/**
 * Show add item modal (with optional pre-filled barcode)
 */
function showAddItemModal(prefill = {}) {
  const modalContent = `
    <form id="addItemForm" class="form">
      <div class="form-group">
        <label for="itemId">Item ID</label>
        <input type="text" id="itemId" placeholder="e.g., T636200 (optional - auto-generated if empty)" />
      </div>

      <div class="form-group">
        <label for="itemName">Name *</label>
        <input type="text" id="itemName" required placeholder="e.g., Cyan - 700ml" />
      </div>

      <div class="form-group">
        <label for="itemPrinter">Printer *</label>
        <select id="itemPrinter" required>
          <option value="">Select printer...</option>
          ${getUniquePrinters().map(p => `<option value="${p}" ${selectedPrinter === p ? 'selected' : ''}>${p}</option>`).join('')}
          ${selectedPrinter && !getUniquePrinters().includes(selectedPrinter) ? `<option value="${selectedPrinter}" selected>${selectedPrinter}</option>` : ''}
          <option value="__custom">+ Add custom printer</option>
        </select>
        <input type="text" id="customPrinter" style="display:none; margin-top:8px;" placeholder="Enter custom printer name" />
      </div>

      <div class="form-group">
        <label for="itemCategory">Category *</label>
        <select id="itemCategory" required>
          <option value="">Select category...</option>
          ${getUniqueCategories().map(c => `<option value="${c}">${c}</option>`).join('')}
          <option value="__custom">+ Add custom category</option>
        </select>
        <input type="text" id="customCategory" style="display:none; margin-top:8px;" placeholder="Enter custom category name" />
      </div>

      <div class="form-group">
        <label for="itemStock">Initial Stock</label>
        <input type="number" id="itemStock" value="0" min="0" />
      </div>

      <div class="form-group">
        <label for="itemUnit">Unit *</label>
        <input type="text" id="itemUnit" required value="unit" placeholder="e.g., ml, roll, unit" />
      </div>

      <div class="form-group">
        <label for="itemBarcode">Barcode</label>
        <input type="text" id="itemBarcode" value="${prefill.barcode || ''}" placeholder="e.g., 012345678901 (optional)" />
      </div>

      <div class="form-group">
        <label for="itemThreshold">Low Stock Threshold</label>
        <input type="number" id="itemThreshold" value="2" min="0" step="1" placeholder="Alert when stock reaches this level" />
      </div>

      <div class="modal-actions">
        <button type="submit" class="btn-primary">Add Item</button>
        <button type="button" class="btn-secondary" id="cancelAdd">Cancel</button>
      </div>
    </form>
  `

  showModal('Add New Item', modalContent)

  // Custom printer/category handling
  document.getElementById('itemPrinter').addEventListener('change', (e) => {
    const customInput = document.getElementById('customPrinter')
    customInput.style.display = e.target.value === '__custom' ? 'block' : 'none'
  })

  document.getElementById('itemCategory').addEventListener('change', (e) => {
    const customInput = document.getElementById('customCategory')
    customInput.style.display = e.target.value === '__custom' ? 'block' : 'none'
  })

  // Form submission
  document.getElementById('addItemForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    await addNewItem()
  })

  document.getElementById('cancelAdd').addEventListener('click', () => {
    hideModal()
  })
}

/**
 * Add new inventory item
 */
async function addNewItem() {
  const form = document.getElementById('addItemForm')

  let printer = document.getElementById('itemPrinter').value
  let category = document.getElementById('itemCategory').value

  // Handle custom printer/category
  if (printer === '__custom') {
    printer = document.getElementById('customPrinter').value.trim()
    if (!printer) {
      showToast('Please enter a custom printer name', 'warning')
      return
    }
  }

  if (category === '__custom') {
    category = document.getElementById('customCategory').value.trim()
    if (!category) {
      showToast('Please enter a custom category name', 'warning')
      return
    }
  }

  const itemData = {
    id: document.getElementById('itemId').value.trim() || undefined,
    name: document.getElementById('itemName').value.trim(),
    printer: printer,
    category: category,
    stock: parseInt(document.getElementById('itemStock').value) || 0,
    unit: document.getElementById('itemUnit').value.trim(),
    barcode: document.getElementById('itemBarcode').value.trim() || undefined,
    low_stock_threshold: parseInt(document.getElementById('itemThreshold').value) ?? 2
  }

  try {
    await inventoryAPI.create(itemData)
    showToast('Item added successfully', 'success')
    dashboard.createActivity({ type: 'inventory', description: `Added item: ${itemData.name} (${itemData.printer})` }).catch(() => {})
    hideModal()
    await loadInventory()
    render()
  } catch (error) {
    showToast('Error adding item: ' + error.message, 'error')
  }
}

// ============================================================================
// EDIT ITEM MODAL
// ============================================================================

/**
 * Show edit item modal
 */
function showEditItemModal(item) {
  const modalContent = `
    <form id="editItemForm" class="form">
      <div class="form-group">
        <label>Item ID</label>
        <input type="text" value="${item.id}" disabled />
        <small>ID cannot be changed</small>
      </div>

      <div class="form-group">
        <label for="editName">Name *</label>
        <input type="text" id="editName" required value="${item.name}" />
      </div>

      <div class="form-group">
        <label for="editPrinter">Printer *</label>
        <input type="text" id="editPrinter" required value="${item.printer}" />
      </div>

      <div class="form-group">
        <label for="editCategory">Category *</label>
        <input type="text" id="editCategory" required value="${item.category}" />
      </div>

      <div class="form-group">
        <label for="editStock">Stock</label>
        <input type="number" id="editStock" value="${item.stock}" min="0" />
      </div>

      <div class="form-group">
        <label for="editUnit">Unit *</label>
        <input type="text" id="editUnit" required value="${item.unit}" />
      </div>

      <div class="form-group">
        <label for="editBarcode">Barcode</label>
        <input type="text" id="editBarcode" value="${item.barcode || ''}" placeholder="Optional" />
      </div>

      <div class="form-group">
        <label for="editThreshold">Low Stock Threshold</label>
        <input type="number" id="editThreshold" value="${item.low_stock_threshold ?? 2}" min="0" step="1" />
      </div>

      <div class="modal-actions">
        <button type="submit" class="btn-primary">Save Changes</button>
        <button type="button" class="btn-secondary" id="cancelEdit">Cancel</button>
      </div>
    </form>
  `

  showModal('Edit Item', modalContent)

  document.getElementById('editItemForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    await updateItem(item.id)
  })

  document.getElementById('cancelEdit').addEventListener('click', () => {
    hideModal()
  })
}

/**
 * Update existing item
 */
async function updateItem(itemId) {
  const updates = {
    name: document.getElementById('editName').value.trim(),
    printer: document.getElementById('editPrinter').value.trim(),
    category: document.getElementById('editCategory').value.trim(),
    stock: parseInt(document.getElementById('editStock').value),
    unit: document.getElementById('editUnit').value.trim(),
    barcode: document.getElementById('editBarcode').value.trim() || null,
    low_stock_threshold: parseInt(document.getElementById('editThreshold').value) ?? 2
  }

  try {
    await inventoryAPI.update(itemId, updates)
    showToast('Item updated successfully', 'success')
    dashboard.createActivity({ type: 'inventory', description: `Updated item: ${updates.name}` }).catch(() => {})
    hideModal()
    await loadInventory()
    render()
  } catch (error) {
    showToast('Error updating item: ' + error.message, 'error')
  }
}

// ============================================================================
// DELETE ITEM
// ============================================================================

/**
 * Delete inventory item
 */
async function deleteItem(itemId, itemName) {
  if (!confirm(`Are you sure you want to delete "${itemName}"?\n\nThis action cannot be undone.`)) {
    return
  }

  try {
    await inventoryAPI.delete(itemId)
    showToast('Item deleted successfully', 'success')
    dashboard.createActivity({ type: 'inventory', description: `Deleted item: ${itemName}` }).catch(() => {})
    await loadInventory()
    render()
  } catch (error) {
    showToast('Error deleting item: ' + error.message, 'error')
  }
}

// ============================================================================
// SEARCH & FILTER
// ============================================================================

/**
 * Filter items based on search query
 */
function getFilteredItems() {
  if (!searchQuery.trim()) {
    return items
  }

  const query = searchQuery.toLowerCase().trim()

  return items.filter(item => {
    return (
      item.name.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query) ||
      (item.barcode && item.barcode.toLowerCase().includes(query)) ||
      item.printer.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    )
  })
}

/**
 * Handle search input
 */
function handleSearch(query) {
  searchQuery = query
  render()
}

/**
 * Clear search
 */
function clearSearch() {
  searchQuery = ''
  const searchInput = document.getElementById('search-input')
  if (searchInput) {
    searchInput.value = ''
  }
  render()
}

// ============================================================================
// EXPORT TO CSV
// ============================================================================

/**
 * Export inventory to CSV
 */
function exportToCSV() {
  console.log('[Inventory] Exporting to CSV...')

  const filteredItems = getFilteredItems()

  if (filteredItems.length === 0) {
    showToast('No items to export', 'warning')
    return
  }

  // CSV header
  const headers = ['ID', 'Name', 'Printer', 'Category', 'Stock', 'Unit', 'Barcode', 'Created', 'Updated']

  // CSV rows
  const rows = filteredItems.map(item => [
    item.id,
    `"${item.name}"`, // Quote name in case it contains commas
    item.printer,
    item.category,
    item.stock,
    item.unit,
    item.barcode || '',
    item.created_at ? new Date(item.created_at).toLocaleDateString() : '',
    item.updated_at ? new Date(item.updated_at).toLocaleDateString() : ''
  ])

  // Combine into CSV string
  const csv = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n')

  // Create blob and download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `inventory-export-${timestamp}.csv`

  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  showToast(`Exported ${filteredItems.length} items to ${filename}`, 'success')
  console.log('[Inventory] CSV export complete:', filename)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get unique printers from current items
 */
function getUniquePrinters() {
  const printers = new Set(items.map(item => item.printer))
  return Array.from(printers).sort()
}

/**
 * Get unique categories from current items
 */
function getUniqueCategories() {
  const categories = new Set(items.map(item => item.category))
  return Array.from(categories).sort()
}

/**
 * Get stock level status
 */
function getStockLevel(stock, threshold = 2) {
  if (stock === 0) return 'empty'
  if (stock <= threshold) return 'low'
  return 'good'
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info', autoHide = true) {
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = message
  toast.id = `toast-${Date.now()}`

  document.body.appendChild(toast)

  setTimeout(() => toast.classList.add('show'), 10)

  if (autoHide) {
    setTimeout(() => {
      toast.classList.remove('show')
      setTimeout(() => toast.remove(), 300)
    }, 3000)
  }

  return toast.id
}

/**
 * Show persistent error banner at top of page
 */
function showErrorBanner(message, details) {
  // Remove existing error banner if any
  const existing = document.getElementById('error-banner')
  if (existing) existing.remove()

  const banner = document.createElement('div')
  banner.id = 'error-banner'
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #dc2626;
    color: white;
    padding: 16px;
    z-index: 10000;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    font-family: var(--font-sans);
  `

  banner.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto; display: flex; align-items: start; gap: 12px;">
      <div style="font-size: 24px;">⚠️</div>
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">${message}</div>
        ${details ? `<div style="font-size: 14px; opacity: 0.9;">${details}</div>` : ''}
        <div style="font-size: 12px; opacity: 0.8; margin-top: 8px;">
          Open browser console (F12) for more details
        </div>
      </div>
      <button
        onclick="this.parentElement.parentElement.remove()"
        style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 600;"
      >
        Dismiss
      </button>
    </div>
  `

  document.body.appendChild(banner)
  console.error('[Error Banner]', message, details)
}

/**
 * Show modal
 */
function showModal(title, content) {
  const modal = document.createElement('div')
  modal.className = 'modal-overlay'
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        ${content}
      </div>
    </div>
  `

  document.body.appendChild(modal)

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove()
    }
  })
}

/**
 * Hide modal
 */
function hideModal() {
  const modal = document.querySelector('.modal-overlay')
  if (modal) {
    modal.remove()
  }
}

// ============================================================================
// BARCODE LIST MODAL
// ============================================================================

/**
 * Show barcode list modal
 */
function showBarcodeList() {
  const itemsWithBarcodes = items.filter(item => item.barcode)

  if (itemsWithBarcodes.length === 0) {
    showToast('No items have barcodes assigned', 'warning')
    return
  }

  const modalContent = `
    <div style="max-height: 60vh; overflow-y: auto;">
      <p style="margin: 0 0 16px 0; color: var(--color-text-secondary);">
        Click a barcode to copy it to clipboard
      </p>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.1);">
            <th style="padding: 12px; text-align: left; font-size: 13px; color: var(--color-text-secondary);">Item</th>
            <th style="padding: 12px; text-align: left; font-size: 13px; color: var(--color-text-secondary);">Barcode</th>
            <th style="padding: 12px; text-align: left; font-size: 13px; color: var(--color-text-secondary);">Printer</th>
          </tr>
        </thead>
        <tbody>
          ${itemsWithBarcodes.map(item => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 12px;">
                <strong style="color: var(--color-text-primary);">${item.name}</strong><br>
                <small style="color: var(--color-text-muted);">${item.id}</small>
              </td>
              <td style="padding: 12px;">
                <button
                  onclick="window.inventoryApp.copyBarcode('${item.barcode}')"
                  style="font-family: 'Monaco', monospace; padding: 6px 12px; background: var(--color-bg-elevated); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: var(--color-primary-light); cursor: pointer; transition: all 0.2s;"
                  onmouseover="this.style.background='var(--color-primary)'; this.style.color='white'"
                  onmouseout="this.style.background='var(--color-bg-elevated)'; this.style.color='var(--color-primary-light)'"
                >
                  📋 ${item.barcode}
                </button>
              </td>
              <td style="padding: 12px; color: var(--color-text-secondary); font-size: 14px;">
                ${item.printer}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `

  showModal(`🏷️ All Barcodes (${itemsWithBarcodes.length} items)`, modalContent)
}

/**
 * Copy barcode to clipboard
 */
async function copyBarcode(barcode) {
  try {
    await navigator.clipboard.writeText(barcode)
    showToast(`Copied: ${barcode}`, 'success')
  } catch (err) {
    console.error('[Inventory] Failed to copy barcode:', err)
    showToast('Failed to copy barcode', 'error')
  }
}

// ============================================================================
// HELP MODAL
// ============================================================================

/**
 * Show help modal
 */
function showHelpModal() {
  const modalContent = `
    <div style="max-height: 70vh; overflow-y: auto;">
      <h3 style="margin: 0 0 12px 0; font-size: 18px; color: var(--color-primary-light);">
        📖 Inventory Management Guide
      </h3>

      <div style="background: rgba(255,255,255,0.02); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 8px 0; font-size: 14px; color: var(--color-text-primary);">Machine Management</h4>
        <ul style="margin: 0; padding-left: 20px; color: var(--color-text-secondary); font-size: 14px;">
          <li>View all machines on the dashboard with stock summaries</li>
          <li>Click <strong>"Add New Machine"</strong> to create a new machine/printer</li>
          <li>Click a machine card to manage its inventory</li>
          <li>Use the <strong>"← Back"</strong> button to return to machine selection</li>
        </ul>
      </div>

      <div style="background: rgba(255,255,255,0.02); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 8px 0; font-size: 14px; color: var(--color-text-primary);">Stock Management</h4>
        <ul style="margin: 0; padding-left: 20px; color: var(--color-text-secondary); font-size: 14px;">
          <li>Click <strong>+</strong> or <strong>-</strong> buttons to adjust stock by 1 unit</li>
          <li>Click the <strong>stock number</strong> to edit item details</li>
          <li>Hover over buttons to see tooltips with current stock</li>
          <li>Watch for flash animations: <span style="color: #34d399;">green = success</span>, <span style="color: #f87171;">red = error</span></li>
        </ul>
      </div>

      <div style="background: rgba(255,255,255,0.02); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 8px 0; font-size: 14px; color: var(--color-text-primary);">Stock Level Indicators</h4>
        <div style="display: flex; gap: 12px; margin-top: 12px;">
          <div style="flex: 1; padding: 8px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px;">
            <strong style="color: #f87171;">Empty</strong><br>
            <small style="color: var(--color-text-muted);">Stock = 0</small>
          </div>
          <div style="flex: 1; padding: 8px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px;">
            <strong style="color: #fbbf24;">Low</strong><br>
            <small style="color: var(--color-text-muted);">Stock ≤ 2</small>
          </div>
          <div style="flex: 1; padding: 8px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px;">
            <strong style="color: #34d399;">Good</strong><br>
            <small style="color: var(--color-text-muted);">Stock > 2</small>
          </div>
        </div>
      </div>

      <div style="background: rgba(255,255,255,0.02); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 8px 0; font-size: 14px; color: var(--color-text-primary);">Barcode Scanner</h4>
        <ul style="margin: 0; padding-left: 20px; color: var(--color-text-secondary); font-size: 14px;">
          <li>Connect a USB barcode scanner - it works automatically</li>
          <li>Scan any item barcode for quick stock adjustment</li>
          <li><strong>Delivery Mode:</strong> Scan multiple items, adjust quantities, save all at once</li>
          <li><strong>Virtual Scanner:</strong> Press <kbd>Ctrl+Shift+D</kbd> to test without hardware</li>
        </ul>
      </div>

      <div style="background: rgba(255,255,255,0.02); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 12px 0; font-size: 14px; color: var(--color-text-primary);">⌨️ Keyboard Shortcuts</h4>
        <table style="width: 100%; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0;"><kbd style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; font-family: monospace;">Ctrl+K</kbd></td>
            <td style="padding: 6px 0; color: var(--color-text-secondary);">Add new item</td>
          </tr>
          <tr>
            <td style="padding: 6px 0;"><kbd style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; font-family: monospace;">Ctrl+B</kbd></td>
            <td style="padding: 6px 0; color: var(--color-text-secondary);">Show all barcodes</td>
          </tr>
          <tr>
            <td style="padding: 6px 0;"><kbd style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; font-family: monospace;">Ctrl+H</kbd></td>
            <td style="padding: 6px 0; color: var(--color-text-secondary);">Show this help</td>
          </tr>
          <tr>
            <td style="padding: 6px 0;"><kbd style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; font-family: monospace;">Ctrl+E</kbd></td>
            <td style="padding: 6px 0; color: var(--color-text-secondary);">Export to CSV</td>
          </tr>
          <tr>
            <td style="padding: 6px 0;"><kbd style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; font-family: monospace;">Ctrl+Shift+D</kbd></td>
            <td style="padding: 6px 0; color: var(--color-text-secondary);">Toggle debug mode</td>
          </tr>
          <tr>
            <td style="padding: 6px 0;"><kbd style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; font-family: monospace;">ESC</kbd></td>
            <td style="padding: 6px 0; color: var(--color-text-secondary);">Close modal</td>
          </tr>
        </table>
      </div>

      <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px;">
        <strong style="color: #60a5fa;">💡 Pro Tip:</strong>
        <span style="color: var(--color-text-secondary); font-size: 14px;">
          Use the search bar to quickly find items by name, ID, barcode, printer, or category
        </span>
      </div>
    </div>

    <div class="modal-actions" style="margin-top: 20px;">
      <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">Got it!</button>
    </div>
  `

  showModal('Help & Keyboard Shortcuts', modalContent)
}

// ============================================================================
// DEBUG PANEL
// ============================================================================

/**
 * Toggle scanner debug mode
 */
function toggleDebugMode() {
  scannerDebugMode = !scannerDebugMode

  if (scannerDebugMode) {
    showDebugPanel()
  } else {
    hideDebugPanel()
  }
}

/**
 * Show debug panel with virtual scanner
 */
function showDebugPanel() {
  const existing = document.getElementById('scanner-debug-panel')
  if (existing) return

  const panel = document.createElement('div')
  panel.id = 'scanner-debug-panel'
  panel.className = 'debug-panel'
  panel.innerHTML = `
    <h4>🔍 Scanner Debug Mode</h4>

    <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
      <label style="display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--color-primary-light);">
        Virtual Scanner:
      </label>
      <div style="display: flex; gap: 8px;">
        <input
          type="text"
          id="virtual-barcode-input"
          placeholder="Enter barcode (e.g., 010343851948)"
          style="flex: 1; padding: 8px; background: var(--color-bg-elevated); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: var(--color-text-primary); font-size: 13px;"
          value="010343851948"
        />
        <button
          id="virtual-scan-button"
          style="padding: 8px 16px; background: var(--gradient-primary); border: none; border-radius: 6px; color: white; font-weight: 600; cursor: pointer; font-size: 13px;"
        >
          Scan
        </button>
      </div>
      <small style="display: block; margin-top: 6px; color: var(--color-text-muted); font-size: 11px;">
        Simulates barcode scanner input without physical hardware
      </small>
    </div>

    <div id="debug-content">
      <p style="margin: 6px 0; font-size: 12px; color: var(--color-text-secondary);">
        Last scan: <span id="debug-last-scan" style="color: var(--color-text-primary); font-weight: 500;">None</span>
      </p>
      <p style="margin: 6px 0; font-size: 12px; color: var(--color-text-secondary);">
        Scan length: <span id="debug-scan-length" style="color: var(--color-text-primary); font-weight: 500;">-</span>
      </p>
      <p style="margin: 6px 0; font-size: 12px; color: var(--color-text-secondary);">
        Timestamp: <span id="debug-timestamp" style="color: var(--color-text-primary); font-weight: 500;">-</span>
      </p>
      <p style="margin: 6px 0; font-size: 12px; color: var(--color-text-secondary);">
        Last key: <span id="debug-last-key" style="color: var(--color-text-primary); font-weight: 500;">-</span>
      </p>
    </div>

    <small style="display: block; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); color: var(--color-text-muted); font-size: 11px;">
      Press Ctrl+Shift+D to close
    </small>
  `

  document.body.appendChild(panel)

  // Set up virtual scanner event handlers
  const input = document.getElementById('virtual-barcode-input')
  const button = document.getElementById('virtual-scan-button')

  const triggerVirtualScan = () => {
    const barcode = input.value.trim()
    if (barcode) {
      console.log('[Virtual Scanner] Simulating scan:', barcode)
      handleBarcodeScanned(barcode)
    } else {
      showToast('Please enter a barcode', 'warning')
    }
  }

  button.addEventListener('click', triggerVirtualScan)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      triggerVirtualScan()
    }
  })

  // Focus input for immediate use
  setTimeout(() => input.focus(), 100)
}

/**
 * Hide debug panel
 */
function hideDebugPanel() {
  const panel = document.getElementById('scanner-debug-panel')
  if (panel) {
    panel.remove()
  }
}

/**
 * Update debug panel
 */
function updateDebugPanel(data) {
  if (!scannerDebugMode) return

  if (data.code) {
    document.getElementById('debug-last-scan').textContent = data.code
    document.getElementById('debug-scan-length').textContent = data.length + ' characters'
    document.getElementById('debug-timestamp').textContent = data.timestamp.toLocaleTimeString()
  }

  if (data.lastKey) {
    document.getElementById('debug-last-key').textContent = data.lastKey
  }
}

// ============================================================================
// VIEW RENDERING
// ============================================================================

/**
 * Render machine selection view (dashboard)
 */
function renderMachineSelectionView() {
  const printers = getUniquePrinters()

  if (printers.length === 0) {
    return `
      <div class="empty-state" style="padding: 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <span style="color: var(--color-text-secondary);">🏭 No machines set up yet.</span>
        <button class="btn-primary btn-sm" onclick="window.inventoryApp.showAddMachineModal()">+ Add Machine</button>
        <button class="btn-secondary btn-sm" onclick="window.inventoryApp.loadSampleData()">Load Sample Data</button>
      </div>
    `
  }

  // Calculate stats for each machine
  const machineStats = printers.map(printer => {
    const printerItems = items.filter(item => item.printer === printer)
    const totalItems = printerItems.length
    const criticalItems = printerItems.filter(item => item.stock <= (item.low_stock_threshold ?? 2)).length
    const emptyItems = printerItems.filter(item => item.stock === 0).length
    const totalStock = printerItems.reduce((sum, item) => sum + item.stock, 0)

    // Determine status
    let status = 'good'
    let statusColor = '#34d399'
    if (emptyItems > 0 || criticalItems >= totalItems * 0.3) {
      status = 'critical'
      statusColor = '#f87171'
    } else if (criticalItems > 0) {
      status = 'warning'
      statusColor = '#fbbf24'
    }

    return {
      printer,
      totalItems,
      criticalItems,
      emptyItems,
      totalStock,
      status,
      statusColor
    }
  })

  return `
    <div style="padding: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
        <h2 style="margin: 0; font-size: 20px; color: var(--color-text-primary);">Machines</h2>
        <button
          class="btn-primary"
          onclick="window.inventoryApp.showAddMachineModal()"
          style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; font-size: 14px;"
        >
          <span>+</span>
          Add New Machine
        </button>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; max-width: 1200px; margin: 0 auto;">
        ${machineStats.length === 0 ? `
          <div style="grid-column: 1 / -1; padding: 24px; background: var(--gradient-card); border-radius: var(--radius-xl); border: 1px dashed rgba(255,255,255,0.15); color: var(--color-text-muted); text-align: center; font-size: 14px;">
            No machines yet — add one to get started
          </div>
        ` : ''}
        ${machineStats.map(stats => `
          <div
            onclick="window.inventoryApp.selectMachine('${stats.printer}')"
            style="background: var(--gradient-card); border-radius: var(--radius-xl); padding: 24px; cursor: pointer; transition: all 0.3s; border: 2px solid rgba(255,255,255,0.1);"
            onmouseover="this.style.transform='translateY(-4px)'; this.style.borderColor='${stats.statusColor}'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)'"
            onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='rgba(255,255,255,0.1)'; this.style.boxShadow='none'"
          >
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
              <h3 style="margin: 0; font-size: 20px; color: var(--color-text-primary);">
                ${stats.printer}
              </h3>
              <div style="width: 12px; height: 12px; border-radius: 50%; background: ${stats.statusColor}; box-shadow: 0 0 12px ${stats.statusColor};"></div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
              <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px;">
                <div style="font-size: 24px; font-weight: 700; color: var(--color-text-primary); font-family: var(--font-mono);">
                  ${stats.totalItems}
                </div>
                <div style="font-size: 12px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
                  Total Items
                </div>
              </div>

              <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px;">
                <div style="font-size: 24px; font-weight: 700; color: ${stats.criticalItems > 0 ? '#fbbf24' : 'var(--color-text-primary)'}; font-family: var(--font-mono);">
                  ${stats.criticalItems}
                </div>
                <div style="font-size: 12px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
                  Low Stock
                </div>
              </div>
            </div>

            ${stats.emptyItems > 0 ? `
              <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 18px;">⚠️</span>
                  <span style="color: #f87171; font-weight: 600; font-size: 14px;">
                    ${stats.emptyItems} item${stats.emptyItems > 1 ? 's' : ''} out of stock
                  </span>
                </div>
              </div>
            ` : ''}

            <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
              <span style="color: var(--color-text-secondary); font-size: 14px;">
                Click to manage →
              </span>
              <div style="padding: 6px 12px; background: ${stats.statusColor}22; border-radius: 6px; color: ${stats.statusColor}; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                ${stats.status}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `
}

/**
 * Show add new machine modal
 */
function showAddMachineModal() {
  const modalContent = `
    <form id="addMachineForm" class="form">
      <div style="margin-bottom: 20px;">
        <p style="margin: 0; color: var(--color-text-secondary); font-size: 14px;">
          Create a new machine to start managing its inventory. You can add items to it after creation.
        </p>
      </div>

      <div class="form-group">
        <label for="machineName">Machine Name *</label>
        <input
          type="text"
          id="machineName"
          required
          placeholder="e.g., Roland VS300, HP Latex 570"
          style="width: 100%;"
        />
        <small>Enter a descriptive name for the machine or printer</small>
      </div>

      <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px; margin-top: 16px;">
        <strong style="color: #60a5fa;">💡 Examples:</strong>
        <ul style="margin: 8px 0 0 20px; padding: 0; color: var(--color-text-secondary); font-size: 13px;">
          <li>Roland VS300</li>
          <li>HP Latex 570</li>
          <li>Mimaki CJV150-160</li>
          <li>Canon imagePROGRAF PRO-6000</li>
        </ul>
      </div>

      <div class="modal-actions" style="margin-top: 24px;">
        <button type="submit" class="btn-primary">Create Machine</button>
        <button type="button" class="btn-secondary" id="cancelAddMachine">Cancel</button>
      </div>
    </form>
  `

  showModal('Add New Machine', modalContent)

  // Form submission
  document.getElementById('addMachineForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const machineName = document.getElementById('machineName').value.trim()

    if (!machineName) {
      showToast('Please enter a machine name', 'warning')
      return
    }

    // Check if machine already exists
    const existingMachines = getUniquePrinters()
    if (existingMachines.includes(machineName)) {
      showToast('A machine with this name already exists', 'warning')
      return
    }

    console.log('[Inventory] Creating new machine:', machineName)

    // Set the selected printer and navigate to inventory view
    selectedPrinter = machineName
    currentView = 'inventory'

    hideModal()
    showToast(`Machine "${machineName}" created! Add items to get started.`, 'success')
    render()
  })

  document.getElementById('cancelAddMachine').addEventListener('click', () => {
    hideModal()
  })

  // Focus the input
  setTimeout(() => {
    document.getElementById('machineName').focus()
  }, 100)
}

/**
 * Select a machine and show its inventory
 */
function selectMachine(printer) {
  console.log('[Inventory] Machine selected:', printer)
  selectedPrinter = printer
  currentView = 'inventory'
  render()
}

/**
 * Return to machine selection
 */
function returnToMachines() {
  console.log('[Inventory] Returning to machine selection')
  selectedPrinter = null
  currentView = 'machines'
  searchQuery = ''
  render()
}

/**
 * Render inventory view (for selected machine)
 */
function renderInventoryView() {
  // Filter by selected printer if one is selected
  let filteredItems = getFilteredItems()
  if (selectedPrinter) {
    filteredItems = filteredItems.filter(item => item.printer === selectedPrinter)
  }

  const printers = new Set(filteredItems.map(item => item.printer))
  const uniquePrinters = Array.from(printers).sort()

  // Show message if search returns no results
  if (items.length > 0 && filteredItems.length === 0) {
    return `
      <div class="empty-state" style="padding: 16px; display: flex; align-items: center; gap: 12px;">
        <span style="color: var(--color-text-secondary);">🔍 No items match your search.</span>
        <button class="btn-secondary btn-sm" onclick="window.inventoryApp.clearSearch()">Clear Search</button>
      </div>
    `
  }

  if (uniquePrinters.length === 0) {
    // If a machine is selected but has no items
    if (selectedPrinter) {
      return `
        <div class="empty-state" style="padding: 16px; display: flex; align-items: center; gap: 12px;">
          <span style="color: var(--color-text-secondary);">📦 No items for ${selectedPrinter}.</span>
          <button class="btn-primary btn-sm" onclick="window.inventoryApp.showAddItemModal()">+ Add Item</button>
        </div>
      `
    }

    // No machines at all - shouldn't happen since we show machine selection first
    return `
      <div class="empty-state" style="padding: 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <span style="color: var(--color-text-secondary);">📦 No inventory items yet.</span>
        <button class="btn-primary btn-sm" onclick="window.inventoryApp.loadSampleData()">Load Sample Data</button>
        <button class="btn-secondary btn-sm" onclick="window.inventoryApp.showAddItemModal()">+ Add Item</button>
      </div>
    `
  }

  return uniquePrinters.map(printer => {
    const printerItems = filteredItems.filter(item => item.printer === printer)
    const categories = [...new Set(printerItems.map(item => item.category))]

    return categories.map(category => {
      const categoryItems = printerItems.filter(item => item.category === category)

      return `
        <div class="category-section">
          <div class="category-header">
            <h3 class="category-title">${printer} - ${category}</h3>
          </div>
          <div class="category-content">
            <div class="items-grid">
              ${categoryItems.map(item => {
                const stockLevel = getStockLevel(item.stock, item.low_stock_threshold ?? 2)

                return `
                  <div class="item-card" data-id="${item.id}">
                    <div class="item-header">
                      <div class="item-info">
                        <h4>${item.name}</h4>
                        <p>${item.id}</p>
                        ${item.barcode ? `<p class="item-barcode">🏷️ ${item.barcode}</p>` : ''}
                      </div>
                      <div class="stock-badge stock-${stockLevel}">
                        ${stockLevel === 'empty' ? 'Empty' : stockLevel === 'low' ? 'Low' : 'Good'}
                      </div>
                    </div>
                    <div class="item-controls">
                      <button
                        class="stock-btn stock-btn-minus"
                        onclick="window.inventoryApp.updateStock('${item.id}', -1)"
                        title="Remove 1 ${item.unit} (Current: ${item.stock})"
                        aria-label="Remove 1 ${item.unit} from ${item.name}"
                      >−</button>
                      <div
                        class="stock-display"
                        onclick="window.inventoryApp.editItem('${item.id}')"
                        title="Click to edit item details"
                      >${item.stock} ${item.unit}</div>
                      <button
                        class="stock-btn stock-btn-plus"
                        onclick="window.inventoryApp.updateStock('${item.id}', 1)"
                        title="Add 1 ${item.unit} (Current: ${item.stock})"
                        aria-label="Add 1 ${item.unit} to ${item.name}"
                      >+</button>
                    </div>
                    <div class="item-controls">
                      <button class="btn-secondary" onclick="window.inventoryApp.editItem('${item.id}')">✏️ Edit</button>
                      <button class="btn-warning" onclick="window.inventoryApp.deleteItem('${item.id}', '${item.name.replace(/'/g, "\\'")}')">🗑️</button>
                    </div>
                  </div>
                `
              }).join('')}
            </div>
          </div>
        </div>
      `
    }).join('')
  }).join('')
}

/**
 * Render delivery mode view
 */
function renderDeliveryModeView() {
  if (deliveryQueue.length === 0) {
    return `
      <div class="delivery-empty">
        <h3>Delivery queue is empty</h3>
        <p>Scan items to add them to the delivery queue</p>
      </div>
    `
  }

  return `
    <div class="delivery-queue">
      <h3>Scanned Items (${deliveryQueue.length})</h3>
      <table class="delivery-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Current Stock</th>
            <th>Add Quantity</th>
            <th>New Stock</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${deliveryQueue.map(q => `
            <tr>
              <td>
                <strong>${q.item.name}</strong><br>
                <small>${q.item.id}</small>
              </td>
              <td>${q.item.stock} ${q.item.unit}</td>
              <td>
                <input
                  type="number"
                  value="${q.quantity}"
                  min="1"
                  onchange="window.inventoryApp.updateDeliveryQuantity('${q.item.id}', this.value)"
                  style="width: 80px;"
                />
              </td>
              <td><strong>${q.item.stock + q.quantity} ${q.item.unit}</strong></td>
              <td>
                <button onclick="window.inventoryApp.removeFromDelivery('${q.item.id}')">Remove</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="delivery-actions">
        <button class="btn-primary" onclick="window.inventoryApp.saveDeliveryQueue()">
          Save All Changes (${deliveryQueue.length} items)
        </button>
        <button class="btn-secondary" onclick="window.inventoryApp.clearDeliveryQueue()">Clear All</button>
      </div>
    </div>
  `
}

/**
 * Render usage statistics view
 */
async function renderStatsView() {
  await loadUsageHistory()

  if (usageHistory.length === 0) {
    return `
      <div class="empty-state">
        <h3>No usage history yet</h3>
        <p>Usage will be recorded when stock is decreased</p>
      </div>
    `
  }

  return `
    <div class="stats-view">
      <div class="stats-filters">
        <button class="btn ${statsFilter === 'week' ? 'active' : ''}" onclick="window.inventoryApp.setStatsFilter('week')">Last Week</button>
        <button class="btn ${statsFilter === 'month' ? 'active' : ''}" onclick="window.inventoryApp.setStatsFilter('month')">Last Month</button>
        <button class="btn ${statsFilter === 'year' ? 'active' : ''}" onclick="window.inventoryApp.setStatsFilter('year')">Last Year</button>
      </div>

      <table class="usage-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Item</th>
            <th>Printer</th>
            <th>Category</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          ${usageHistory.map(entry => `
            <tr>
              <td>${formatDate(new Date(entry.timestamp))}</td>
              <td>${entry.item_name}</td>
              <td>${entry.printer}</td>
              <td>${entry.category}</td>
              <td>${entry.quantity} ${entry.unit}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

/**
 * Main render function
 */
async function render() {
  const app = document.getElementById('app')

  if (!app) return

  // Render header with delivery mode toggle
  const header = `
    <div class="inventory-header">
      <div class="header-content">
        <div class="header-title">
          ${selectedPrinter && currentView !== 'machines' ? `
            <button
              onclick="window.inventoryApp.returnToMachines()"
              style="background: var(--color-bg-elevated); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-md); padding: 8px 12px; color: var(--color-text-secondary); cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 14px; transition: all 0.2s;"
              onmouseover="this.style.background='var(--color-bg-hover)'; this.style.color='var(--color-text-primary)'"
              onmouseout="this.style.background='var(--color-bg-elevated)'; this.style.color='var(--color-text-secondary)'"
              title="Back to machine selection"
            >
              ← Back
            </button>
          ` : `
            <div class="header-icon">📦</div>
          `}
          <div>
            <h2 style="margin: 0; font-size: var(--text-xl);">
              ${selectedPrinter && currentView !== 'machines' ? selectedPrinter : 'Inventory Management'}
            </h2>
            ${isDeliveryMode ? '<span class="delivery-badge">🚚 DELIVERY MODE ACTIVE</span>' : ''}
          </div>
        </div>
        <div class="header-buttons">
          ${!isDeliveryMode && selectedPrinter ? `
            <button class="btn-view ${currentView === 'inventory' ? 'active' : ''}" onclick="window.inventoryApp.setView('inventory')">Inventory</button>
            <button class="btn-view ${currentView === 'stats' ? 'active' : ''}" onclick="window.inventoryApp.setView('stats')">Usage Stats</button>
          ` : ''}
          ${selectedPrinter ? `
            <button class="btn-view ${isDeliveryMode ? 'active' : ''}" onclick="window.inventoryApp.toggleDeliveryMode()">
              ${isDeliveryMode ? 'Exit Delivery Mode' : '📦 Delivery Mode'}
            </button>
          ` : ''}
          ${!isDeliveryMode && selectedPrinter ? '<button class="btn-primary" onclick="window.inventoryApp.showAddItemModal()">+ Add Item</button>' : ''}
        </div>
      </div>

      ${!isDeliveryMode && currentView === 'inventory' && selectedPrinter && items.length > 0 ? `
        <div style="max-width: 1200px; margin: 16px auto 0 auto; padding: 0 var(--spacing-xl); display: flex; gap: 12px; align-items: center;">
          <div style="position: relative; flex: 1; max-width: 500px;">
            <input
              type="text"
              id="search-input"
              placeholder="Search by name, ID, barcode, printer, or category..."
              value="${searchQuery}"
              oninput="window.inventoryApp.handleSearch(this.value)"
              style="width: 100%; padding: 10px 40px 10px 40px; background: var(--color-bg-elevated); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-md); color: var(--color-text-primary); font-size: 14px;"
            />
            <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 18px; opacity: 0.5;">🔍</span>
            ${searchQuery ? `
              <button
                onclick="window.inventoryApp.clearSearch()"
                style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 20px; padding: 4px 8px; border-radius: 4px;"
                onmouseover="this.style.background='rgba(255,255,255,0.1)'"
                onmouseout="this.style.background='none'"
                title="Clear search"
              >×</button>
            ` : ''}
          </div>
          <button
            class="btn-view"
            onclick="window.inventoryApp.showBarcodeList()"
            title="View all barcodes (Ctrl+B)"
            style="padding: 10px 16px; white-space: nowrap;"
          >
            🏷️ Barcodes
          </button>
          <button
            class="btn-view"
            onclick="window.inventoryApp.exportToCSV()"
            title="Export to CSV (Ctrl+E)"
            style="padding: 10px 16px; white-space: nowrap;"
          >
            📥 Export
          </button>
          <button
            class="btn-view"
            onclick="window.inventoryApp.showHelpModal()"
            title="Help & Shortcuts (Ctrl+H)"
            style="padding: 10px 16px;"
          >
            ❓
          </button>
        </div>
      ` : ''}
    </div>
  `

  // Render main content based on mode and view
  let content
  let searchInfo = ''

  if (isDeliveryMode) {
    content = renderDeliveryModeView()
  } else {
    if (currentView === 'machines') {
      // Machine selection view
      content = renderMachineSelectionView()
    } else if (currentView === 'inventory') {
      content = renderInventoryView()

      // Show search results counter if filtering
      if (searchQuery && items.length > 0 && selectedPrinter) {
        const machineItems = items.filter(item => item.printer === selectedPrinter)
        const filteredCount = getFilteredItems().filter(item => item.printer === selectedPrinter).length
        searchInfo = `
          <div class="search-results-info">
            Showing ${filteredCount} of ${machineItems.length} items matching "${searchQuery}"
          </div>
        `
      }
    } else if (currentView === 'stats') {
      content = await renderStatsView()
    }
  }

  app.innerHTML = header + searchInfo + `<div class="inventory-container">${content}</div>`
}

/**
 * Set current view
 */
function setView(view) {
  currentView = view
  // Clear search when changing views
  if (view !== 'inventory') {
    searchQuery = ''
  }
  render()
}

/**
 * Set stats filter
 */
function setStatsFilter(filter) {
  statsFilter = filter
  render()
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize app
 */
async function init() {
  try {
    console.log('='.repeat(60))
    console.log('[Inventory] INITIALIZATION STARTED')
    console.log('='.repeat(60))

    // Check authentication
    console.log('[Inventory] Step 1: Checking authentication...')
    await requireAuth()
    console.log('[Inventory] ✓ Authentication successful')

    // Load initial data
    console.log('[Inventory] Step 2: Loading inventory data...')
    await loadInventory()
    console.log(`[Inventory] ✓ Loaded ${items.length} items`)

    // Initialize scanner
    console.log('[Inventory] Step 3: Initializing barcode scanner...')
    await initScanner()
    console.log('[Inventory] ✓ Scanner initialized')

    // Keyboard shortcuts
    console.log('[Inventory] Step 4: Setting up keyboard shortcuts...')
    document.addEventListener('keydown', (e) => {
      // ESC - Close modal
      if (e.key === 'Escape') {
        const modal = document.querySelector('.modal-overlay')
        if (modal) {
          modal.remove()
          e.preventDefault()
        }
      }

      // Ctrl+K - Add new item
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        if (!isDeliveryMode) {
          showAddItemModal()
        }
      }

      // Ctrl+B - Show barcode list
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        if (!isDeliveryMode && currentView === 'inventory') {
          showBarcodeList()
        }
      }

      // Ctrl+H - Show help
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault()
        showHelpModal()
      }

      // Ctrl+E - Export to CSV
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault()
        if (!isDeliveryMode && currentView === 'inventory') {
          exportToCSV()
        }
      }

      // Ctrl+Shift+D - Toggle debug mode
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        toggleDebugMode()
      }
    })
    console.log('[Inventory] ✓ Keyboard shortcuts registered:')
    console.log('[Inventory]   - ESC: Close modal')
    console.log('[Inventory]   - Ctrl+K: Add item')
    console.log('[Inventory]   - Ctrl+B: Barcodes')
    console.log('[Inventory]   - Ctrl+H: Help')
    console.log('[Inventory]   - Ctrl+E: Export CSV')
    console.log('[Inventory]   - Ctrl+Shift+D: Debug mode')

    // Expose API for onclick handlers
    console.log('[Inventory] Step 5: Exposing global API...')
    window.inventoryApp = {
      // Sample data
      loadSampleData,

      // CRUD operations
      showAddItemModal: () => showAddItemModal(),
      editItem: async (id) => {
        const item = items.find(i => i.id === id)
        if (item) showEditItemModal(item)
      },
      deleteItem: (id, name) => deleteItem(id, name),
      updateStock: async (id, change) => {
        console.log('[Inventory] window.inventoryApp.updateStock called:', { id, change })
        const item = items.find(i => i.id === id)
        if (item) {
          await updateItemStock(item, change)
        } else {
          console.error('[Inventory] Item not found:', id)
        }
      },

      // Delivery mode
      toggleDeliveryMode,
      removeFromDelivery: removeFromDeliveryQueue,
      updateDeliveryQuantity: updateDeliveryQueueQuantity,
      saveDeliveryQueue,
      clearDeliveryQueue,

      // Machine selection
      selectMachine,
      returnToMachines,
      showAddMachineModal,

      // Views
      setView,
      setStatsFilter,

      // Search & filter
      handleSearch,
      clearSearch,

      // Export & utilities
      exportToCSV,
      showBarcodeList,
      copyBarcode,
      showHelpModal
    }
    console.log('[Inventory] ✓ Global API exposed:', Object.keys(window.inventoryApp))

    // Initial render
    console.log('[Inventory] Step 6: Initial render...')
    await render()
    console.log('[Inventory] ✓ Render complete')

    console.log('='.repeat(60))
    console.log('[Inventory] INITIALIZATION COMPLETE')
    console.log(`[Inventory] Items loaded: ${items.length}`)
    console.log(`[Inventory] Global API available: window.inventoryApp`)
    console.log('='.repeat(60))

  } catch (error) {
    console.error('='.repeat(60))
    console.error('[Inventory] INITIALIZATION FAILED')
    console.error('='.repeat(60))
    console.error('[Inventory] Error:', error)
    console.error('[Inventory] Stack trace:', error.stack)

    showErrorBanner(
      'Inventory tool failed to initialize',
      `Error: ${error.message}. Check browser console for details.`
    )
  }
}

// Start the app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
