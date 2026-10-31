import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { api } from './lib/api'
import { cspReport, isFramed } from './lib/security'
import { applyTheme } from './lib/theme'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/cormorant-garamond/600.css'
import './styles.css'

applyTheme()

if (Capacitor.isNativePlatform()) {
  // Botão "voltar" do Android: fecha o painel aberto ou volta de tela
  CapApp.addListener('backButton', ({ canGoBack }) => {
    const close = document.querySelector<HTMLButtonElement>('.sheet-head .icon-btn')
    if (close) close.click()
    else if (canGoBack && location.hash !== '#/') history.back()
    else CapApp.minimizeApp()
  })
} else {
  // Versão web: guarda o app no aparelho (abre sem internet) e atualiza sozinho quando há versão nova
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({
    immediate: true,
    // Procura versão nova ao voltar para a aba e a cada hora (não só ao abrir)
    onRegisteredSW(_url, reg) {
      if (!reg) return
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}) })
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    },
  }))
}

// Bloqueios da política de segurança (código estranho tentando rodar): avisa o gestor
const cspSeen = new Set<string>()
document.addEventListener('securitypolicyviolation', (e) => {
  const detail = cspReport(e, cspSeen)
  if (detail && cspSeen.size <= 5) api.security?.report('csp_violation', null, detail)
})

const root = ReactDOM.createRoot(document.getElementById('root')!)
if (!Capacitor.isNativePlatform() && isFramed(window)) {
  // Aberto escondido dentro de outro site: não mostra nada além do aviso
  root.render(
    <p style={{ padding: 24, fontFamily: 'sans-serif' }}>
      Por segurança, o Fynvault só funciona aberto diretamente.{' '}
      <a href={location.href} target="_top" rel="noopener">Abrir o Fynvault</a>
    </p>,
  )
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
