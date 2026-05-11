import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.ORCA_PAGES_BASE ?? '/',
  define: {
    __ORCA_APP__: JSON.stringify("ics"),
  },
  server: {
    fs: {
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        fileURLToPath(new URL('../../shared', import.meta.url)),
        fileURLToPath(new URL('../../', import.meta.url)),
      ],
    },
  },
})
