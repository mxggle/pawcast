import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor'
          }

          if (
            id.includes('/@radix-ui/') ||
            id.includes('/lucide-react/') ||
            id.includes('/framer-motion/') ||
            id.includes('/@heroicons/') ||
            id.includes('/tailwind-merge/') ||
            id.includes('/clsx/') ||
            id.includes('/class-variance-authority/')
          ) {
            return 'ui-vendor'
          }

          if (
            id.includes('/i18next/') ||
            id.includes('/react-i18next/') ||
            id.includes('/i18next-browser-languagedetector/')
          ) {
            return 'i18n-vendor'
          }

          if (
            id.includes('/tone/') ||
            id.includes('/@tanstack/react-virtual/') ||
            id.includes('/zustand/')
          ) {
            return 'media-vendor'
          }

          if (
            id.includes('/ai/') ||
            id.includes('/openai/') ||
            id.includes('/@google/genai/') ||
            id.includes('/@ai-sdk/')
          ) {
            return 'ai-vendor'
          }

          if (
            id.includes('/react-markdown/') ||
            id.includes('/remark-gfm/') ||
            id.includes('/rehype-highlight/')
          ) {
            return 'markdown-vendor'
          }

          return 'vendor'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    open: true,
  },
  preview: {
    port: 3000,
    open: true,
  },
})
