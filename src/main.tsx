import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
