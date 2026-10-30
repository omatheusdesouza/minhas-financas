import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Versão web instalável (computador e iPhone via "Adicionar à Tela de Início").
    // O registro do service worker é feito em main.tsx, só fora do app nativo.
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      includeAssets: ['brand/icon.svg', 'brand/apple-touch-icon.png'],
      manifest: {
        name: 'Fynvault · Personal finance',
        short_name: 'Fynvault',
        description: 'Suas finanças pessoais: gastos, contas, metas e relatórios.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F2EBDD',
        theme_color: '#0B2A3C',
        icons: [
          { src: 'brand/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'brand/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Guarda o app inteiro no aparelho para abrir sem internet (os dados já ficam no IndexedDB)
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  // Caminhos relativos para funcionar dentro do app nativo (Capacitor) e no GitHub Pages
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
})
