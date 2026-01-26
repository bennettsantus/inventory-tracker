import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Restaurant Inventory',
        short_name: 'Inventory',
        description: 'Track restaurant inventory with barcode scanning',
        theme_color: '#2563eb',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  // Base path - works on any domain
  base: '/',

  // Build configuration
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    // Ensure clean URLs work
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },

  // Development server
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Allow any host (for tunnels and deployment)
    allowedHosts: 'all',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },

  // Preview server (for testing production build)
  preview: {
    host: '0.0.0.0',
    port: 4173
  }
});
