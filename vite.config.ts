import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command }) => ({
  // Relative asset URLs so one build works at the domain root or in any FTP subdirectory.
  // Dev stays on `/` because the Vite dev server does not support a relative base.
  base: command === 'build' ? './' : '/',
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      main: path.resolve(__dirname, 'src/main'),
      components: path.resolve(__dirname, 'src/components'),
      modules: path.resolve(__dirname, 'src/modules'),
      pages: path.resolve(__dirname, 'src/pages'),
      utils: path.resolve(__dirname, 'src/utils'),
      static: path.resolve(__dirname, 'src/static'),
      ui: path.resolve(__dirname, 'src/ui'),
      app: path.resolve(__dirname, 'src/app'),
    },
  },
  esbuild: {
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/dexie/')) return 'dexie'
          if (id.includes('node_modules/peerjs/')) return 'peerjs'
        },
      },
    },
  },
}))
