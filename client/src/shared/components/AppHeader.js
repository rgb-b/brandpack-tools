/**
 * AppHeader Web Component
 * Reusable header for all tools with user info and logout
 */

import { getCurrentUserFromCache, clearCurrentUserCache, isAdmin } from '../utils/auth.js'
import { users, getAppConfig } from '../../api/client.js'
import { theme } from '../utils/theme.js'
import { lowEnergy } from '../utils/lowEnergy.js'
import commandPalette from './CommandPalette.js'
import toast from './Toast.js'
import keyboardService from '../utils/keyboard.js'
import searchModal from './SearchModal.js'
import commandRegistry from '../config/commands.js'

export class AppHeader extends HTMLElement {
  async connectedCallback() {
    const toolName = this.getAttribute('tool-name') || ''
    const user = getCurrentUserFromCache()
    const isLauncher = window.location.pathname.includes('/launcher/') || this.hasAttribute('full')

    // Load app name from config (fast — cached in sessionStorage after first call)
    let appName = 'WorkBase'
    let cfg = null
    try {
      cfg = await getAppConfig()
      appName = cfg?.app?.name || 'WorkBase'
      // Apply accent colour if set
      if (cfg?.app?.primaryColor) {
        document.documentElement.style.setProperty('--color-primary', cfg.app.primaryColor)
      }
    } catch {}

    if (isLauncher) {
      this.renderFullHeader(toolName || appName, user, appName)
    } else {
      this.renderSlimHeader(toolName || appName, user, appName, cfg)
    }

    if (user) this.setupUserMenu()

    if (!window.__commandPaletteInitialized) {
      window.__commandPaletteInitialized = true
      commandRegistry.register({
        id: 'global-search',
        title: 'Search Everything',
        category: 'Global',
        icon: '🔍',
        hotkey: 'Ctrl Shift F',
        keywords: ['search', 'find', 'query'],
        handler: () => searchModal.open(),
        priority: 95
      })
      console.log('[CommandPalette] Initialized - Press Ctrl+K to open')
      console.log('[KeyboardService] Initialized - Press ? to view all shortcuts')
      console.log('[SearchModal] Initialized - Press Ctrl+Shift+F to search')
    }
  }

  renderFullHeader(toolName, user, appName = 'WorkBase') {
    this.innerHTML = `
      <header class="app-header">
        <div class="header-left">
          <h1 class="text-gradient">${appName}</h1>
          <p class="subtitle">${toolName}</p>
        </div>
        ${user ? `
          <div class="header-right">
            <div class="header-actions">
              <button class="header-icon-btn" id="headerScreensaverBtn" title="Enable screensaver">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path fill="currentColor" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              </button>
              <button class="header-icon-btn" id="headerHelpBtn" title="Keyboard shortcuts (?)">?</button>
              <div class="user-menu">
                <button class="user-button" id="userMenuToggle">
                  <svg class="user-icon" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                  <span>${user.username}</span>
                  ${isAdmin(user) ? '<span class="admin-badge">Admin</span>' : ''}
                </button>
                <div class="user-dropdown" id="userDropdown" style="display: none;">
                  ${isAdmin(user) ? `
                    <a href="../admin/index.html" class="dropdown-item">
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                      </svg>
                      Admin Panel
                    </a>
                  ` : ''}
                  <a href="../launcher/index.html" class="dropdown-item">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                    </svg>
                    Dashboard
                  </a>
                  <button class="dropdown-item theme-picker-item" id="themePickerToggle">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                    </svg>
                    <span>Theme: <span id="currentThemeName">${theme.getDisplayName()}</span></span>
                    <svg class="chevron" viewBox="0 0 24 24" width="12" height="12">
                      <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                    </svg>
                  </button>
                  <div class="theme-submenu" id="themeSubmenu" style="display: none;">
                    ${this.renderThemeOptions()}
                  </div>
                  <button class="dropdown-item" id="lowEnergyToggle">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path fill="currentColor" d="M7 2v11h3v9l7-12h-4l4-8z"/>
                    </svg>
                    Low Energy: <span id="lowEnergyStatus">${lowEnergy.get() ? 'On' : 'Off'}</span>
                  </button>
                  <button class="dropdown-item logout-btn" id="logoutBtn">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path fill="currentColor" d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
                    </svg>
                    Logout
                  </button>
                </div>
              </div>
            </div><!-- end header-actions -->
          </div>
        ` : ''}
      </header>
    `
  }

  renderSlimHeader(toolName, user, appName = 'WorkBase', cfg = null) {
    // Build tool switcher links from config — only show enabled tools
    const toolLinks = [
      { key: 'inventory',         icon: '📦', label: 'Inventory',        path: '../inventory/index.html' },
      { key: 'productivity-v4',   icon: '⏱️', label: 'Time Tracker',     path: '../productivity-v4/index.html' },
      { key: 'pantone',           icon: '🎨', label: 'Colour Library',   path: '../pantone/index.html' },
      { key: 'converter',         icon: '🔀', label: 'Converter',        path: '../converter/index.html' },
      { key: 'maintenance',       icon: '🔧', label: 'Maintenance',      path: '../maintenance/index.html' },
      { key: 'density-profiles',  icon: '🎯', label: 'Density Profiles', path: '../density-profiles/index.html' },
      { key: 'ink-density',       icon: '🖨️', label: 'Ink Density',      path: '../ink-density/index.html' },
    ]
    const toolsConfig = cfg?.tools || {}
    const enabledLinks = toolLinks
      .filter(t => !toolsConfig[t.key] || toolsConfig[t.key].enabled !== false)
      .map(t => `<a href="${t.path}" class="dropdown-item">${t.icon} ${toolsConfig[t.key]?.label || t.label}</a>`)
      .join('')

    this.innerHTML = `
      <header class="app-header app-header--slim">
        <a href="../launcher/index.html" class="header-back">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          Back
        </a>
        <div class="header-slim-title">${toolName}</div>
        ${user ? `
          <div class="header-right">
            <div class="header-actions">
              <div class="tool-switcher-menu">
                <button class="header-icon-btn tool-switcher-btn" id="toolSwitcherToggle" title="Switch tool">
                  <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
                </button>
                <div class="tool-switcher-dropdown" id="toolSwitcherDropdown" style="display:none;">
                  ${enabledLinks}
                  ${isAdmin(user) ? '<a href="../admin/index.html" class="dropdown-item">👤 Admin Panel</a>' : ''}
                  <a href="../launcher/index.html" class="dropdown-item">🏠 Dashboard</a>
                </div>
              </div>
              <button class="header-icon-btn" id="headerHelpBtn" title="Keyboard shortcuts (?)">?</button>
              <div class="user-menu">
                <button class="user-button" id="userMenuToggle">
                  <svg class="user-icon" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                  <span>${user.username}</span>
                  ${isAdmin(user) ? '<span class="admin-badge">Admin</span>' : ''}
                </button>
                <div class="user-dropdown" id="userDropdown" style="display: none;">
                  ${isAdmin(user) ? `
                    <a href="../admin/index.html" class="dropdown-item">
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                      </svg>
                      Admin Panel
                    </a>
                  ` : ''}
                  <a href="../launcher/index.html" class="dropdown-item">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                    </svg>
                    Dashboard
                  </a>
                  <button class="dropdown-item theme-picker-item" id="themePickerToggle">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                    </svg>
                    <span>Theme: <span id="currentThemeName">${theme.getDisplayName()}</span></span>
                    <svg class="chevron" viewBox="0 0 24 24" width="12" height="12">
                      <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                    </svg>
                  </button>
                  <div class="theme-submenu" id="themeSubmenu" style="display: none;">
                    ${this.renderThemeOptions()}
                  </div>
                  <button class="dropdown-item" id="lowEnergyToggle">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path fill="currentColor" d="M7 2v11h3v9l7-12h-4l4-8z"/>
                    </svg>
                    Low Energy: <span id="lowEnergyStatus">${lowEnergy.get() ? 'On' : 'Off'}</span>
                  </button>
                  <button class="dropdown-item logout-btn" id="logoutBtn">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path fill="currentColor" d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
                    </svg>
                    Logout
                  </button>
                </div>
              </div>
            </div><!-- end header-actions -->
          </div>
        ` : ''}
      </header>
    `
  }

  renderThemeOptions() {
    const themes = theme.getAvailable()
    const isCyberpunk = theme.isCyberpunkTheme()
    const variant = theme.getCyberpunkVariant()

    // Filter out duplicate Cyberpunk entries - show only one
    const filteredThemes = themes.filter(t => t.value !== 'cyberpunk-orange')

    let html = filteredThemes.map(t => `
      <button class="dropdown-item theme-option ${t.active ? 'active' : ''}" data-theme="${t.value}">
        <span class="theme-indicator"></span>
        ${t.label}
      </button>
    `).join('')

    // Cyberpunk variant toggle (only show if Cyberpunk theme active)
    if (isCyberpunk) {
      html += `
        <div class="cyberpunk-variant-toggle" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
          <button class="dropdown-item variant-toggle-btn" id="cyberpunkVariantToggle">
            <span class="toggle-icon">⚡</span>
            <span class="toggle-label">
              ${variant === 'magenta' ? 'Magenta/Blue' : 'Orange/Teal'}
            </span>
          </button>
        </div>
      `
    }

    return html
  }

  setupUserMenu() {
    // Screensaver trigger button — only present in full header (launcher page)
    const screensaverBtn = this.querySelector('#headerScreensaverBtn')
    if (screensaverBtn) {
      if (!document.getElementById('screensaver')) {
        screensaverBtn.style.display = 'none'
      } else {
        screensaverBtn.addEventListener('click', () => {
          window.dispatchEvent(new CustomEvent('screensaver:trigger'))
        })
      }
    }

    // Help / keyboard shortcuts button
    const helpBtn = this.querySelector('#headerHelpBtn')
    if (helpBtn) {
      helpBtn.addEventListener('click', () => {
        keyboardService.showHints()
      })
    }

    // Tool switcher dropdown (slim header only)
    const toolSwitcherToggle = this.querySelector('#toolSwitcherToggle')
    const toolSwitcherDropdown = this.querySelector('#toolSwitcherDropdown')
    if (toolSwitcherToggle && toolSwitcherDropdown) {
      toolSwitcherToggle.addEventListener('click', (e) => {
        e.stopPropagation()
        const isOpen = toolSwitcherDropdown.style.display !== 'none'
        toolSwitcherDropdown.style.display = isOpen ? 'none' : 'block'
      })
      toolSwitcherDropdown.addEventListener('click', (e) => {
        e.stopPropagation()
      })
    }

    const toggleBtn = this.querySelector('#userMenuToggle')
    const dropdown = this.querySelector('#userDropdown')
    const logoutBtn = this.querySelector('#logoutBtn')
    const themePickerToggle = this.querySelector('#themePickerToggle')
    const themeSubmenu = this.querySelector('#themeSubmenu')

    if (toggleBtn && dropdown) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none'
        // Close theme submenu when dropdown opens
        if (dropdown.style.display === 'block') {
          themeSubmenu.style.display = 'none'
          themePickerToggle.classList.remove('open')
        }
      })

      // Close all dropdowns when clicking outside
      document.addEventListener('click', () => {
        dropdown.style.display = 'none'
        themeSubmenu.style.display = 'none'
        themePickerToggle.classList.remove('open')
        if (toolSwitcherDropdown) toolSwitcherDropdown.style.display = 'none'
      })

      dropdown.addEventListener('click', (e) => {
        e.stopPropagation()
      })
    }

    // Theme picker submenu toggle
    if (themePickerToggle && themeSubmenu) {
      themePickerToggle.addEventListener('click', (e) => {
        e.stopPropagation()
        const isOpen = themeSubmenu.style.display === 'block'
        themeSubmenu.style.display = isOpen ? 'none' : 'block'
        themePickerToggle.classList.toggle('open', !isOpen)
      })
    }

    // Attach all theme-related listeners
    this.attachThemeOptionListeners()

    // Listen for theme changes from other tabs
    window.addEventListener('themechange', () => {
      const themeNameSpan = this.querySelector('#currentThemeName')
      if (themeNameSpan) {
        themeNameSpan.textContent = theme.getDisplayName()
      }
      const themeOptions = this.querySelectorAll('.theme-option')
      themeOptions.forEach(option => {
        const isActive = option.dataset.theme === theme.get()
        option.classList.toggle('active', isActive)
      })
    })

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await users.logout()
          clearCurrentUserCache()
          window.location.href = '../login/index.html'
        } catch (error) {
          console.error('Logout failed:', error)
          clearCurrentUserCache()
          window.location.href = '../login/index.html'
        }
      })
    }

    const lowEnergyToggle = this.querySelector('#lowEnergyToggle')
    const lowEnergyStatus = this.querySelector('#lowEnergyStatus')
    if (lowEnergyToggle) {
      lowEnergyToggle.addEventListener('click', (e) => {
        e.stopPropagation()
        const enabled = lowEnergy.toggle()
        if (lowEnergyStatus) lowEnergyStatus.textContent = enabled ? 'On' : 'Off'
        if (dropdown) dropdown.style.display = 'none'
      })
    }

    window.addEventListener('lowenergychange', (e) => {
      if (lowEnergyStatus) lowEnergyStatus.textContent = e.detail.enabled ? 'On' : 'Off'
    })
  }

  attachThemeOptionListeners() {
    const dropdown = this.querySelector('#userDropdown')
    const themeSubmenu = this.querySelector('#themeSubmenu')
    const themePickerToggle = this.querySelector('#themePickerToggle')

    // Theme option click listeners
    const themeOptions = this.querySelectorAll('.theme-option')
    themeOptions.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation()
        const themeName = option.dataset.theme
        if (themeName) {
          theme.set(themeName)
          // Update active indicator
          themeOptions.forEach(opt => opt.classList.remove('active'))
          option.classList.add('active')
          // Update theme name in picker label
          const themeNameSpan = this.querySelector('#currentThemeName')
          if (themeNameSpan) {
            themeNameSpan.textContent = theme.getDisplayName()
          }
          // Re-render theme options to show/hide variant toggle
          const themeSubmenuContent = this.querySelector('#themeSubmenu')
          if (themeSubmenuContent) {
            themeSubmenuContent.innerHTML = this.renderThemeOptions()
            this.attachThemeOptionListeners() // Re-attach listeners after re-render
          }
          // Close menus
          if (dropdown) dropdown.style.display = 'none'
          if (themeSubmenu) themeSubmenu.style.display = 'none'
          if (themePickerToggle) themePickerToggle.classList.remove('open')
        }
      })
    })

    // Cyberpunk variant toggle listener
    const variantToggle = this.querySelector('#cyberpunkVariantToggle')
    if (variantToggle) {
      variantToggle.addEventListener('click', (e) => {
        e.stopPropagation()
        theme.toggleCyberpunkVariant()
        // Update toggle label
        const variant = theme.getCyberpunkVariant()
        const toggleLabel = this.querySelector('.toggle-label')
        if (toggleLabel) {
          toggleLabel.textContent = variant === 'magenta' ? 'Magenta/Blue' : 'Orange/Teal'
        }
        // Update theme name in header
        const themeNameSpan = this.querySelector('#currentThemeName')
        if (themeNameSpan) {
          themeNameSpan.textContent = theme.getDisplayName()
        }
      })
    }
  }
}

customElements.define('app-header', AppHeader)
