import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Política de segurança de conteúdo (CSP) da versão web: o navegador só executa o código do próprio site
 * e só conversa com o Supabase do app. Barra código injetado (XSS) e envio de dados para outros endereços.
 * O APK (VITE_TARGET=android) não leva a política: o app nativo só abre os arquivos que já vêm dentro dele.
 */
function securityHeaders(env: Record<string, string>): Plugin {
  let supabase = ''
  try { supabase = new URL(env.VITE_SUPABASE_URL ?? '').origin } catch { /* modo demonstração */ }
  const api = supabase ? ` ${supabase} ${supabase.replace(/^https:/, 'wss:')}` : ''
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabase ? ` ${supabase}` : ''}`,
    "font-src 'self' data:",
    `connect-src 'self'${api}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ')
  return {
    name: 'fynvault-security-headers',
    apply: 'build',
    transformIndexHtml() {
      if (env.VITE_TARGET === 'android') return []
      return [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' },
        { tag: 'meta', attrs: { name: 'referrer', content: 'same-origin' }, injectTo: 'head-prepend' },
      ]
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env } as Record<string, string>
  return {
    plugins: [
      react(),
      securityHeaders(env),
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
          // versão nova entra na hora (sem esperar fechar todas as janelas do app); a página recarrega sozinha
          skipWaiting: true,
          clientsClaim: true,
        },
      }),
    ],
    // Caminhos relativos para funcionar dentro do app nativo (Capacitor) e no GitHub Pages
    base: './',
    // Data da montagem, mostrada em Ajustes para saber qual versão está aberta
    define: { __APP_BUILD__: JSON.stringify(new Date().toISOString()) },
    build: { chunkSizeWarningLimit: 1200 },
    // Código publicado sem comentários, sem "debugger" e sem mensagens de depuração no console
    esbuild: mode === 'production' ? { legalComments: 'none', drop: ['debugger'], pure: ['console.log', 'console.debug', 'console.info'] } : undefined,
  }
})
