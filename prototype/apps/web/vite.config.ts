import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { defineConfig } from 'vitest/config'
import { vadStaticAssets } from './src/lib/vadAssets.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: vadStaticAssets.map((asset) => ({
        src: asset.source,
        dest: 'vad',
        rename: { stripBase: true, name: asset.destination },
      })),
    }),
  ],
  server: {
    proxy: {
      '/v1': 'http://127.0.0.1:8787',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
