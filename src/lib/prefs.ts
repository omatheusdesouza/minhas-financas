/**
 * Personalização: quais blocos aparecem no Início (e em que ordem) e quais telas ficam na navegação.
 * Fica no aparelho (localStorage) e na conta (dados do login), para valer em todos os aparelhos;
 * vale a versão alterada por último (updatedAt).
 */

export type WidgetId = 'saldo' | 'caixa' | 'fixos' | 'limites' | 'meta' | 'reservas' | 'destaques' | 'contas' | 'saude' | 'gastos' | 'ultimos'

export interface WidgetInfo {
  id: WidgetId
  label: string
  desc: string
  icon: string
  /** coluna no computador (no celular é tudo uma coluna só, na ordem escolhida) */
  col: 'main' | 'side'
}

/** Na ordem padrão (a mesma de antes da personalização). */
export const WIDGETS: WidgetInfo[] = [
  { id: 'saldo', label: 'Saldo previsto do mês', desc: 'Ganhos, gastos e quanto sobra', icon: '💰', col: 'main' },
  { id: 'caixa', label: 'Caixa', desc: 'Quanto você tem nas contas agora', icon: '🏦', col: 'main' },
  { id: 'fixos', label: 'Renda e gastos fixos', desc: 'Quanto entra e sai todo mês', icon: '🔁', col: 'main' },
  { id: 'limites', label: 'Atenção aos limites', desc: 'Categorias perto ou acima do limite (só aparece quando há)', icon: '⚠️', col: 'side' },
  { id: 'meta', label: 'Meta de economia', desc: 'Progresso da meta principal', icon: '🎯', col: 'side' },
  { id: 'reservas', label: 'Reservas', desc: 'Saldo guardado, entradas e retiradas', icon: '🛟', col: 'side' },
  { id: 'destaques', label: 'Destaques do mês', desc: 'O que subiu ou caiu em relação ao mês anterior', icon: '✨', col: 'side' },
  { id: 'contas', label: 'Próximas contas', desc: 'O que vence nos próximos 30 dias', icon: '🧾', col: 'main' },
  { id: 'saude', label: 'Saúde financeira', desc: 'Nota de 0 a 100 com dicas', icon: '❤️', col: 'side' },
  { id: 'gastos', label: 'Para onde foi o dinheiro', desc: 'Gráfico de gastos por categoria', icon: '🍩', col: 'side' },
  { id: 'ultimos', label: 'Últimos lançamentos', desc: 'Os 6 mais recentes do mês', icon: '📋', col: 'main' },
]

export type NavId = 'inicio' | 'caixa' | 'lancamentos' | 'contas' | 'relatorios' | 'metas' | 'reservas' | 'cartoes' | 'importar' | 'familia' | 'ajustes'

export interface NavInfo {
  id: NavId
  to: string
  label: string
  /** nome curto para a barra de baixo do celular */
  short: string
  icon: string
}

export const NAV: NavInfo[] = [
  { id: 'inicio', to: '/', label: 'Início', short: 'Início', icon: 'home' },
  { id: 'lancamentos', to: '/lancamentos', label: 'Lançamentos', short: 'Lançamentos', icon: 'list' },
  { id: 'contas', to: '/contas', label: 'Contas', short: 'Contas', icon: 'bills' },
  { id: 'relatorios', to: '/relatorios', label: 'Relatórios', short: 'Relatórios', icon: 'chart' },
  { id: 'metas', to: '/metas', label: 'Metas', short: 'Metas', icon: 'target' },
  { id: 'reservas', to: '/reservas', label: 'Reservas', short: 'Reservas', icon: 'safe' },
  { id: 'caixa', to: '/caixa', label: 'Caixa', short: 'Caixa', icon: 'wallet' },
  { id: 'cartoes', to: '/contas?tab=cartoes', label: 'Cartões e faturas', short: 'Cartões', icon: 'card' },
  { id: 'importar', to: '/lancamentos/importar', label: 'Importar extrato', short: 'Importar', icon: 'download' },
  { id: 'familia', to: '/ajustes/familia', label: 'Família', short: 'Família', icon: 'user' },
  { id: 'ajustes', to: '/ajustes', label: 'Ajustes', short: 'Ajustes', icon: 'gear' },
]

/** Início fica sempre no 1º lugar da barra de baixo (é o caminho de volta); a pessoa escolhe os outros 3. */
export const TAB_SLOTS = 3
export const DEFAULT_TABS: NavId[] = ['lancamentos', 'contas', 'relatorios']
/** Menu lateral: Início e Ajustes não podem ser escondidos. */
export const LOCKED_MENU: NavId[] = ['inicio', 'ajustes']
export const DEFAULT_MENU_HIDDEN: NavId[] = ['cartoes', 'importar', 'familia']

export interface OrderedPrefs<T extends string> { order: T[]; hidden: T[] }

export interface UiPrefs {
  home?: OrderedPrefs<WidgetId>
  tabs?: NavId[]
  menu?: OrderedPrefs<NavId>
  /** quando foi alterado (ISO): entre aparelho e conta, vale o mais recente */
  updatedAt?: string
}

/**
 * Ordem completa a partir do que foi salvo: ignora ids que não existem mais e encaixa os novos (de versões
 * mais novas do app, como o Caixa) logo depois do item que vem antes deles na ordem padrão.
 */
export function fullOrder<T extends string>(saved: T[] | undefined, all: T[]): T[] {
  const out = (saved ?? []).filter((id, i, arr) => all.includes(id) && arr.indexOf(id) === i)
  if (!out.length) return [...all]
  all.forEach((id, i) => {
    if (out.includes(id)) return
    const before = all.slice(0, i).reverse().find((x) => out.includes(x))
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, id)
  })
  return out
}

export interface HomeLayoutItem extends WidgetInfo { visible: boolean; position: number }

/** Blocos do Início na ordem escolhida, com visível/escondido. */
export function homeLayout(p: UiPrefs | undefined): HomeLayoutItem[] {
  const order = fullOrder(p?.home?.order, WIDGETS.map((w) => w.id))
  const hidden = new Set(p?.home?.hidden ?? [])
  return order.map((id, position) => ({ ...WIDGETS.find((w) => w.id === id)!, visible: !hidden.has(id), position }))
}

export interface MenuItem extends NavInfo { visible: boolean; locked: boolean }

/** Menu lateral na ordem escolhida. */
export function menuLayout(p: UiPrefs | undefined): MenuItem[] {
  const order = fullOrder(p?.menu?.order, NAV.map((n) => n.id))
  const hidden = new Set(p?.menu ? p.menu.hidden : DEFAULT_MENU_HIDDEN)
  return order.map((id) => {
    const n = NAV.find((x) => x.id === id)!
    const locked = LOCKED_MENU.includes(id)
    return { ...n, locked, visible: locked || !hidden.has(id) }
  })
}

/** Os 4 itens da barra de baixo: Início + 3 escolhidos (sem repetir; completa com o padrão se faltar). */
export function tabLayout(p: UiPrefs | undefined): NavInfo[] {
  const ids: NavId[] = []
  for (const id of [...(p?.tabs ?? []), ...DEFAULT_TABS, ...NAV.map((n) => n.id)]) {
    if (ids.length >= TAB_SLOTS) break
    if (id !== 'inicio' && !ids.includes(id) && NAV.some((n) => n.id === id)) ids.push(id)
  }
  return [NAV[0], ...ids.map((id) => NAV.find((n) => n.id === id)!)]
}

/** Move um item para cima (-1) ou para baixo (+1) na ordem. */
export function move<T>(list: T[], item: T, dir: -1 | 1): T[] {
  const i = list.indexOf(item)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** Entre a versão do aparelho e a da conta, a alterada por último. */
export function newest(a: UiPrefs | null | undefined, b: UiPrefs | null | undefined): UiPrefs {
  if (!a) return b ?? {}
  if (!b) return a
  return (a.updatedAt ?? '') >= (b.updatedAt ?? '') ? a : b
}

const key = (userId: string) => `fv-prefs-${userId}`

export function loadLocalPrefs(userId: string): UiPrefs | null {
  try {
    const raw = localStorage.getItem(key(userId))
    return raw ? (JSON.parse(raw) as UiPrefs) : null
  } catch {
    return null
  }
}

export function saveLocalPrefs(userId: string, p: UiPrefs) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(p))
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

/** Qual item da navegação está aberto: o endereço mais específico que combina (com a aba, se houver). */
export function activeNav(pathname: string, search: string, items: { id: string; to: string }[]): string | null {
  let best: string | null = null
  let bestScore = -1
  for (const it of items) {
    const [path, query] = it.to.split('?')
    const pathOk = path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)
    if (!pathOk) continue
    if (query && !new URLSearchParams(search).toString().split('&').includes(query)) continue
    const score = path.length + (query ? 100 : 0) + (pathname === path ? 1 : 0)
    if (score > bestScore) { bestScore = score; best = it.id }
  }
  return best
}
