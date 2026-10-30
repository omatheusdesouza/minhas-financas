import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

export type ThemeChoice = 'auto' | 'light' | 'dark'

const KEY = 'fv-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function isDark(choice = getTheme()) {
  return choice === 'dark' || (choice === 'auto' && media.matches)
}

/** Aplica o tema na página e ajusta a barra de status do celular. */
export function applyTheme(choice = getTheme()) {
  const root = document.documentElement
  if (choice === 'auto') delete root.dataset.theme
  else root.dataset.theme = choice
  const dark = isDark(choice)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#071B27' : '#F2EBDD')
  if (Capacitor.isNativePlatform()) {
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
    if (Capacitor.getPlatform() === 'android') {
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})
      StatusBar.setBackgroundColor({ color: dark ? '#071B27' : '#F2EBDD' }).catch(() => {})
    }
  }
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // sem armazenamento: vale só para esta sessão
  }
  applyTheme(choice)
}

/** No modo automático, acompanha a troca de tema do celular. */
media.addEventListener('change', () => getTheme() === 'auto' && applyTheme('auto'))
