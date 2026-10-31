import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH lets the same build run at a domain root or under a sub-path (e.g. GitHub Pages: /papercell/).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Papercell',
        short_name: 'Papercell',
        description: 'Print a spreadsheet range with boxes, mark them by hand, photograph the page and get the marks back as cells.',
        theme_color: '#3b5bdb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: 'es' },
  build: {
    // The only chunk above Vite's 500 kB default is ExcelJS, which is loaded on demand.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        // Libraries in chunks of their own keep their file names between releases, so an update of the app only
        // downloads the app's own code. ExcelJS stays out: it is loaded only when an .xlsx file is opened.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
            { name: 'vendor', test: /node_modules[\\/](?!.*exceljs)/, priority: 1 },
          ],
        },
      },
    },
  },
  server: { host: true },
  preview: { host: true },
});
