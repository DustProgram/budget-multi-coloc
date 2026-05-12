import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Chemins relatifs pour que les assets se chargent correctement quand
  // l'app est servie derrière /api/hassio_ingress/<token>/ par le supervisor.
  // Sans ça, le <script src="/assets/..."> du index.html buildé fait 404
  // sur la racine de HA au lieu d'être préfixé par le path d'ingress.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Budget Multi-Coloc',
        short_name: 'Budget',
        description: 'Gestionnaire de budget et colocation chiffré',
        theme_color: '#1c1917',
        background_color: '#faf7f2',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Don't try to navigate-fallback inside the HA ingress path — Workbox would
        // otherwise hijack /api/hassio_ingress/<token>/ requests on offline reload.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // API GET → stale-while-revalidate : on sert le cache immédiatement,
          // on rafraîchit en arrière-plan. Marche aussi pour les paths préfixés
          // par /api/hassio_ingress/<token>/api/...
          {
            urlPattern: ({ request, url }) =>
              request.method === 'GET' && url.pathname.includes('/api/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-get-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Mutations (POST/PATCH/DELETE) → on tente le réseau, on n'en cache pas.
          {
            urlPattern: ({ request, url }) =>
              request.method !== 'GET' && url.pathname.includes('/api/'),
            handler: 'NetworkOnly',
          },
          // Google Fonts — long cache
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'charts': ['recharts'],
        },
      },
    },
  },
});
