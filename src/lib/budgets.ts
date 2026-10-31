import { money, pct } from './format'
import type { CategoryIndex } from './services'
import { amt, type Category, type Transaction } from './types'

/** Limite mensal por categoria: aviso ao chegar a 80% e ao chegar a 100%. */
export const WARN_AT = 0.8

export type BudgetLevel = 'ok' | 'warn' | 'over'

export interface BudgetStatus {
  category: Category
  spent: number
  limit: number
  /** gasto ÷ limite (1 = 100%) */
  ratio: number
  level: BudgetLevel
}

const round = (v: number) => Math.round(v * 100) / 100

/**
 * Situação de cada categoria com limite, nos lançamentos do mês (os mais apertados primeiro).
 * O limite de uma categoria principal soma as subcategorias; o de uma subcategoria, só ela.
 */
export function budgetStatus(month: Transaction[], idx: CategoryIndex): BudgetStatus[] {
  return idx.all
    .filter((c) => c.kind === 'expense' && c.monthly_budget && !c.archived)
    .map((c) => {
      const spent = round(month
        .filter((t) => t.kind === 'expense' && (t.category_id === c.id || (!c.parent_id && idx.root(t.category_id)?.id === c.id)))
        .reduce((s, t) => s + amt(t), 0))
      const limit = c.monthly_budget!
      const ratio = spent / limit
      return { category: c, spent, limit, ratio, level: (ratio >= 1 ? 'over' : ratio >= WARN_AT ? 'warn' : 'ok') as BudgetLevel }
    })
    .sort((a, b) => b.ratio - a.ratio)
}

const rank: Record<BudgetLevel, number> = { ok: 0, warn: 1, over: 2 }

/** Categorias que subiram de nível (passaram de 80% ou de 100%) entre antes e depois de uma mudança. */
export function crossed(before: BudgetStatus[], after: BudgetStatus[]): BudgetStatus[] {
  const prev = new Map(before.map((s) => [s.category.id, s.level]))
  return after.filter((s) => rank[s.level] > rank[prev.get(s.category.id) ?? 'ok'])
}

export function budgetMessage(s: BudgetStatus, monthLabel?: string): string {
  const name = `${s.category.icon} ${s.category.name}`
  const when = monthLabel ? ` em ${monthLabel}` : ''
  if (s.spent > s.limit) return `🔴 ${name} estourou o limite${when}: ${money(s.spent)} de ${money(s.limit)} (+${money(s.spent - s.limit)})`
  if (s.level === 'over') return `🔴 ${name} chegou ao limite${when}: ${money(s.limit)}`
  return `⚠️ ${name} chegou a ${pct(s.ratio)} do limite${when}: ${money(s.spent)} de ${money(s.limit)}`
}
