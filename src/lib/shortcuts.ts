/** Atalhos de teclado da versão para computador. */
export const NAV_ITEMS = [
  { key: '1', to: '/', label: 'Início', icon: 'home' },
  { key: '2', to: '/lancamentos', label: 'Lançamentos', icon: 'list' },
  { key: '3', to: '/contas', label: 'Contas', icon: 'bills' },
  { key: '4', to: '/relatorios', label: 'Relatórios', icon: 'chart' },
  { key: '5', to: '/metas', label: 'Metas', icon: 'target' },
  { key: '6', to: '/reservas', label: 'Reservas', icon: 'safe' },
  { key: '7', to: '/ajustes', label: 'Ajustes', icon: 'gear' },
] as const

export type ShortcutAction =
  | { type: 'new' }
  | { type: 'search' }
  | { type: 'help' }
  | { type: 'go'; to: string }

export const SHORTCUT_HELP: [string, string][] = [
  ['N', 'Novo lançamento'],
  ['/', 'Buscar nos lançamentos'],
  ...NAV_ITEMS.map((n) => [n.key, n.label] as [string, string]),
  ['Esc', 'Fechar a janela aberta'],
  ['?', 'Ver os atalhos'],
]

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
export function shortcutFor(k: KeyInfo): ShortcutAction | null {
  if (k.ctrlKey || k.metaKey || k.altKey || k.dialogOpen) return null
  if (k.targetEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(k.targetTag ?? '')) return null
  const key = k.key.length === 1 ? k.key.toLowerCase() : k.key
  if (key === 'n') return { type: 'new' }
  if (key === '/') return { type: 'search' }
  if (key === '?') return { type: 'help' }
  const nav = NAV_ITEMS.find((n) => n.key === key)
  return nav ? { type: 'go', to: nav.to } : null
}
