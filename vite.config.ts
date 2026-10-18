/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { icsProxyPlugin } from './server/icsProxy'
import { pgSyncPlugin } from './server/pgSync'

export default defineConfig({
  plugins: [react(), tailwindcss(), icsProxyPlugin(), pgSyncPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          charts: ['recharts'],
          data: ['dexie', 'dexie-react-hooks', 'zod', 'papaparse'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
