import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rolldownOptions: {
      output: {
        // Stable dependency domains cache independently and keep the app entry
        // small. Priorities stop editor dependencies from absorbing React.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 40 },
            { name: 'editor', test: /node_modules[\\/](@tiptap|prosemirror-|orderedmap)/, priority: 30, maxSize: 260_000 },
            { name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/, priority: 20 },
            { name: 'state', test: /node_modules[\\/]zustand[\\/]/, priority: 20 },
            { name: 'vendor', test: /node_modules/, priority: 10, maxSize: 260_000 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Playwright owns real Electron journeys; Vitest must not execute its specs.
    exclude: ['e2e/**', '**/node_modules/**', '**/.git/**'],
  },
})
