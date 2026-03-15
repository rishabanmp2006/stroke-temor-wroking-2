import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
            manifest: {
                name: 'NeuroGuard AI',
                short_name: 'NeuroGuard',
                description: 'AI-powered stroke & motor impairment rehabilitation platform',
                theme_color: '#0f0f0f',
                background_color: '#0f0f0f',
                display: 'standalone',
                orientation: 'portrait',
                scope: '/',
                start_url: '/',
                icons: [
                    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
                    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
                    },
                    {
                        urlPattern: /^https:\/\/storage\.googleapis\.com\/mediapipe-models\/.*/i,
                        handler: 'CacheFirst',
                        options: { cacheName: 'mediapipe-models-cache', expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 } }
                    }
                ]
            }
        })
    ],
    server: { port: 5173 }
})
