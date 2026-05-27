import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        setup: resolve(__dirname, 'src/tools/setup/index.html'),
        login: resolve(__dirname, 'src/tools/login/index.html'),
        admin: resolve(__dirname, 'src/tools/admin/index.html'),
        launcher: resolve(__dirname, 'src/tools/launcher/index.html'),
        inventory: resolve(__dirname, 'src/tools/inventory/index.html'),
        productivity: resolve(__dirname, 'src/tools/productivity/index.html'),
        'productivity-v4': resolve(__dirname, 'src/tools/productivity-v4/index.html'),
        pantone: resolve(__dirname, 'src/tools/pantone/index.html'),
        converter: resolve(__dirname, 'src/tools/converter/index.html'),
        maintenance: resolve(__dirname, 'src/tools/maintenance/index.html'),
        'density-profiles': resolve(__dirname, 'src/tools/density-profiles/index.html'),
        'ink-density': resolve(__dirname, 'src/tools/ink-density/index.html')
      }
    }
  }
})
