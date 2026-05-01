import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import path from 'path'
import fs from 'fs'
import { VitePWA } from 'vite-plugin-pwa'

// 从 VERSION 文件读取版本号
const appVersion = fs.readFileSync(path.resolve(__dirname, 'public', 'VERSION'), 'utf-8').trim();

// GitHub Pages 部署路径：https://<user>.github.io/<repo>/
const basePath = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Audiobookshelf Player',
        short_name: 'ABS Player',
        description: 'iOS Web Player for Audiobookshelf',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        version: appVersion,
        scope: basePath,
        start_url: basePath,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: true,
    port: 5173
  }
})
