import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { App as CapApp } from '@capacitor/app'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'

if (Capacitor.isNativePlatform()) {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
  if (Capacitor.getPlatform() === 'android') {
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})
    StatusBar.setBackgroundColor({ color: dark ? '#0b1215' : '#f4f7f6' }).catch(() => {})
  }
  // Botão "voltar" do Android: fecha o painel aberto ou volta de tela
  CapApp.addListener('backButton', ({ canGoBack }) => {
    const close = document.querySelector<HTMLButtonElement>('.sheet-head .icon-btn')
    if (close) close.click()
    else if (canGoBack && location.hash !== '#/') history.back()
    else CapApp.minimizeApp()
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
