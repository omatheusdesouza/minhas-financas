import { addMonths, diffDays, parse, startOfMonth } from './dates'
import type { GoalContribution, SavingsGoal } from './types'

export interface GoalProgress {
  saved: number
  remaining: number
  /** 0 a 1 */
  pct: number
  done: boolean
  /** meses que faltam no ritmo do aporte mensal (null sem aporte definido) */
  monthsToGo: number | null
  /** data prevista para chegar lá no ritmo atual */
  projected: string | null
  /** com prazo: quanto precisaria guardar por mês para cumprir */
  neededPerMonth: number | null
  /** com prazo e aporte: o ritmo atual cumpre o prazo? */
  onTrack: boolean | null
  /** saldo acumulado ao fim de cada mês (para o gráfico) */
  history: { month: string; total: number }[]
}

export function goalProgress(goal: SavingsGoal, contributions: GoalContribution[], today: string): GoalProgress {
  const list = contributions.filter((c) => c.goal_id === goal.id).sort((a, b) => (a.date < b.date ? -1 : 1))
  const saved = round(list.reduce((s, c) => s + c.amount, 0))
  const remaining = round(Math.max(0, goal.target_amount - saved))
  const done = remaining === 0
  const monthly = goal.monthly_contribution ?? 0
  const monthsToGo = done ? 0 : monthly > 0 ? Math.ceil(remaining / monthly) : null
  const projected = monthsToGo == null ? null : addMonths(today, monthsToGo)

  let neededPerMonth: number | null = null
  let onTrack: boolean | null = null
  if (goal.target_date && !done) {
    const months = Math.max(1, Math.round(diffDays(today, goal.target_date) / 30.44))
    neededPerMonth = diffDays(today, goal.target_date) <= 0 ? remaining : round(remaining / months)
    onTrack = projected ? projected <= goal.target_date : null
  } else if (done) {
    onTrack = true
  }

  // Histórico acumulado mês a mês, do primeiro aporte até hoje
  const history: { month: string; total: number }[] = []
  if (list.length) {
    let m = startOfMonth(list[0].date)
    const end = startOfMonth(today)
    let total = 0
    let i = 0
    while (m <= end) {
      const next = addMonths(m, 1)
      while (i < list.length && list[i].date < next) total += list[i++].amount
      history.push({ month: m, total: round(total) })
      m = next
    }
  }
  return { saved, remaining, pct: Math.min(1, saved / goal.target_amount), done, monthsToGo, projected, neededPerMonth, onTrack, history }
}

export const monthLabel = (m: string) => {
  const d = parse(m)
  return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(d.getFullYear()).slice(2)
}

const round = (v: number) => Math.round(v * 100) / 100
