import { menuLayout } from './prefs'

/** Atalhos de teclado da versão para computador: 1 a 9 seguem a ordem do menu lateral (personalizável). */
export interface NavShortcut { key: string; to: string; label: string; icon: string }

export function navShortcuts(items: { to: string; label: string; icon: string }[]): NavShortcut[] {
  return items.slice(0, 9).map((n, i) => ({ key: String(i + 1), to: n.to, label: n.label, icon: n.icon }))
}

/** Menu padrão (sem personalização) */
export const NAV_ITEMS = navShortcuts(menuLayout(undefined).filter((n) => n.visible))

export type ShortcutAction =
  | { type: 'new' }
  | { type: 'search' }
  | { type: 'help' }
  | { type: 'go'; to: string }

export function shortcutHelp(items: NavShortcut[] = NAV_ITEMS): [string, string][] {
  return [
    ['N', 'Novo lançamento'],
    ['/', 'Buscar nos lançamentos'],
    ...items.map((n) => [n.key, n.label] as [string, string]),
    ['Esc', 'Fechar a janela aberta'],
    ['?', 'Ver os atalhos'],
  ]
}

interface KeyInfo {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  /** tag do elemento com foco (INPUT, TEXTAREA...) */
  targetTag?: string
  targetEditable?: boolean
  /** há uma janela (painel) aberta */
  dialogOpen?: boolean
}

/** Qual ação a tecla dispara; null = deixar a tecla seguir normalmente. */
export function shortcutFor(k: KeyInfo, items: NavShortcut[] = NAV_ITEMS): ShortcutAction | null {
  if (k.ctrlKey || k.metaKey || k.altKey || k.dialogOpen) return null
  if (k.targetEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(k.targetTag ?? '')) return null
  const key = k.key.length === 1 ? k.key.toLowerCase() : k.key
  if (key === 'n') return { type: 'new' }
  if (key === '/') return { type: 'search' }
  if (key === '?') return { type: 'help' }
  const nav = items.find((n) => n.key === key)
  return nav ? { type: 'go', to: nav.to } : null
}
