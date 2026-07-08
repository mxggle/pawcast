import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: isTauriBuild ? './' : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: Number(process.env.PORT) || 3000,
    strictPort: true,
    host: '0.0.0.0',
    open: !process.env.TAURI_ENV_PLATFORM,
  },
  preview: {
    port: 3000,
    open: true,
  },
})
