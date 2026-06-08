import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Read sigint/VERSION as the single source of truth so the chip in the header
// and the /api/health response are guaranteed to agree.
const __here = dirname(fileURLToPath(import.meta.url))
let __appVersion = '0.0.0'
try {
  __appVersion = readFileSync(resolve(__here, '..', 'VERSION'), 'utf8').trim() || '0.0.0'
} catch {
  // fall through with default
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(__appVersion),
  },
  server: {
    port: 4444,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8888',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    modulePreload: {
      polyfill: false,
    },
  },
})
