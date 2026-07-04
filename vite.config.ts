import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/game-signal/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Signal — Frequency Alignment Puzzle',
        short_name: 'Signal',
        description: 'A retro-sci-fi radio-telescope spectrum-sorting puzzle for iPad and mobile.',
        theme_color: '#0B0D14',
        background_color: '#0B0D14',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/game-signal/',
        start_url: '/game-signal/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,json,ogg}']
      }
    })
  ]
});
