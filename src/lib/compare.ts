import { money } from './format'
import type { CategoryIndex } from './services'
import type { Transaction } from './types'

/** Variação de um gasto entre o período atual e o anterior. */
export interface Change {
  key: string
  label: string
  icon: string
  color: string
  current: number
  previous: number
  delta: number
  /** variação percentual; null quando não havia gasto no período anterior */
  pct: number | null
}

/**
 * Compara os gastos de dois períodos.
 * Contas fixas são comparadas conta a conta ("sua conta de luz subiu 18%");
 * o resto, por categoria. Valores ainda não informados são ignorados.
 */
export function compareSpending(cur: Transaction[], prev: Transaction[], idx: CategoryIndex): Change[] {
  const map = new Map<string, Change>()
  const add = (t: Transaction, side: 'current' | 'previous') => {
    if (t.kind !== 'expense' || t.amount == null) return
    const key = t.recurring_bill_id ? `bill:${t.recurring_bill_id}` : `cat:${t.category_id ?? 'none'}`
    let c = map.get(key)
    if (!c) {
      const cat = idx.get(t.category_id)
      c = {
        key,
        label: t.recurring_bill_id ? t.description || idx.label(t.category_id) : idx.label(t.category_id),
        icon: cat?.icon ?? '❔', color: idx.root(t.category_id)?.color ?? '#6B7A85',
        current: 0, previous: 0, delta: 0, pct: null,
      }
      map.set(key, c)
    }
    // a conta fixa mais recente define o nome exibido
    if (side === 'current' && t.recurring_bill_id && t.description) c.label = t.description
    c[side] += t.amount
  }
  for (const t of prev) add(t, 'previous')
  for (const t of cur) add(t, 'current')
  for (const c of map.values()) {
    c.current = round(c.current)
    c.previous = round(c.previous)
    c.delta = round(c.current - c.previous)
    c.pct = c.previous > 0 ? c.delta / c.previous : null
  }
  return [...map.values()].filter((c) => c.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

/** Frases de destaque, só para mudanças relevantes (≥ 5% e ≥ R$ 10). */
export function insights(changes: Change[], max = 4): string[] {
  const out: string[] = []
  for (const c of changes) {
    if (Math.abs(c.delta) < 10) continue
    if (c.pct == null) {
      if (c.current >= 10) out.push(`${c.label}: novo gasto de ${money(c.current)}`)
    } else if (c.current === 0) {
      out.push(`${c.label}: nenhum gasto (antes ${money(c.previous)})`)
    } else if (Math.abs(c.pct) >= 0.05) {
      const pct = Math.round(Math.abs(c.pct) * 100)
      out.push(`${c.label} ${c.delta > 0 ? 'subiu' : 'caiu'} ${pct}% (${money(c.previous)} → ${money(c.current)})`)
    }
    if (out.length >= max) break
  }
  return out
}

const round = (v: number) => Math.round(v * 100) / 100
