import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // GitHub Pages publica este projeto abaixo de /advanced_lotes_dflegal/.
  base: process.env.GITHUB_ACTIONS ? '/advanced_lotes_dflegal/' : '/',
  plugins: [react(), tailwindcss()],
  root: path.resolve(rootDir, 'client'),
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'client', 'src'),
    },
  },
  build: {
    outDir: path.resolve(rootDir, 'dist'),
    emptyOutDir: true,
  },
})
