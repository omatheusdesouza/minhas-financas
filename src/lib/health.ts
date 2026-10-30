import { addMonths, startOfMonth, today } from './dates'
import { money, pct } from './format'
import { CategoryIndex, sumBy } from './services'
import { amt, type Transaction } from './types'

export interface HealthFactor {
  label: string
  points: number
  max: number
  detail: string
}

export interface Health {
  score: number
  level: 'Excelente' | 'Boa' | 'Atenção' | 'Crítica'
  color: string
  factors: HealthFactor[]
  tips: string[]
}

const lerp = (v: number, good: number, bad: number, max: number) => {
  if (good === bad) return max
  const t = (v - bad) / (good - bad)
  return Math.round(Math.max(0, Math.min(1, t)) * max)
}

/**
 * Índice de 0 a 100 calculado a partir do mês:
 * sobra do mês, peso dos gastos supérfluos, parcelas futuras, contas atrasadas e orçamentos.
 */
export function computeHealth(opts: {
  month: Transaction[]
  overdue: Transaction[]
  futureInstallments: Transaction[]
  idx: CategoryIndex
}): Health {
  const { month, overdue, futureInstallments, idx } = opts
  const income = sumBy(month, 'income')
  const expense = sumBy(month, 'expense')
  const factors: HealthFactor[] = []
  const tips: string[] = []

  // 1. Sobra do mês (35)
  const savings = income > 0 ? (income - expense) / income : expense > 0 ? -1 : 0
  factors.push({
    label: 'Sobra do mês', max: 35,
    points: income > 0 ? lerp(savings, 0.2, -0.3, 35) : 0,
    detail: income > 0 ? `${pct(savings)} da renda (${money(income - expense)})` : 'Nenhum ganho registrado',
  })
  if (income === 0) tips.push('Registre seus ganhos do mês para o índice ficar preciso.')
  else if (savings < 0) tips.push(`Você gastou ${money(expense - income)} a mais do que ganhou este mês.`)
  else if (savings < 0.1) tips.push('Tente guardar pelo menos 10% da renda todo mês.')

  // 2. Supérfluos (20)
  const superfluous = month
    .filter((t) => t.kind === 'expense' && idx.nature(t.category_id) === 'superfluo')
    .reduce((s, t) => s + amt(t), 0)
  const supShare = expense > 0 ? superfluous / expense : 0
  factors.push({
    label: 'Gastos supérfluos', max: 20, points: lerp(supShare, 0.1, 0.4, 20),
    detail: `${pct(supShare)} dos gastos (${money(superfluous)})`,
  })
  if (supShare > 0.25) tips.push(`Fast food, shopping e besteiras somam ${pct(supShare)} dos seus gastos. Defina um limite para eles.`)

  // 3. Parcelas futuras (20): média mensal dos próximos 3 meses em relação à renda
  const limit = addMonths(startOfMonth(today()), 4)
  const next3 = futureInstallments.filter((t) => !t.paid && t.date > today() && t.date < limit)
  const committedAvg = next3.reduce((s, t) => s + amt(t), 0) / 3
  const commitShare = income > 0 ? committedAvg / income : committedAvg > 0 ? 1 : 0
  factors.push({
    label: 'Parcelas comprometidas', max: 20, points: lerp(commitShare, 0.1, 0.4, 20),
    detail: `${money(committedAvg)}/mês nos próximos 3 meses`,
  })
  if (commitShare > 0.3) tips.push('Suas parcelas futuras pesam muito na renda. Evite novas compras parceladas.')

  // 4. Contas atrasadas (15)
  const overdueTotal = overdue.reduce((s, t) => s + amt(t), 0)
  factors.push({
    label: 'Contas em dia', max: 15, points: Math.max(0, 15 - overdue.length * 5),
    detail: overdue.length ? `${overdue.length} atrasada(s): ${money(overdueTotal)}` : 'Nenhuma conta atrasada',
  })
  if (overdue.length) tips.push(`Você tem ${overdue.length} conta(s) atrasada(s). Priorize quitá-las para evitar juros.`)

  // 5. Orçamentos (10)
  const budgeted = idx.all.filter((c) => c.kind === 'expense' && c.monthly_budget && !c.archived)
  let budgetPts = 7
  let budgetDetail = 'Nenhum limite definido'
  if (budgeted.length) {
    const exceeded = budgeted.filter((c) => {
      const spent = month
        .filter((t) => t.kind === 'expense' && (t.category_id === c.id || (!c.parent_id && idx.root(t.category_id)?.id === c.id)))
        .reduce((s, t) => s + amt(t), 0)
      return spent > (c.monthly_budget ?? 0)
    })
    budgetPts = Math.round(10 * (1 - exceeded.length / budgeted.length))
    budgetDetail = exceeded.length
      ? `${exceeded.length} de ${budgeted.length} limite(s) estourado(s)`
      : `${budgeted.length} limite(s) respeitado(s)`
    if (exceeded.length) tips.push(`Limite estourado em: ${exceeded.map((c) => c.name).join(', ')}.`)
  } else tips.push('Defina limites mensais nas categorias (Ajustes › Categorias) para controlar melhor.')
  factors.push({ label: 'Limites de gasto', max: 10, points: budgetPts, detail: budgetDetail })

  const score = factors.reduce((s, f) => s + f.points, 0)
  const level = score >= 80 ? 'Excelente' : score >= 60 ? 'Boa' : score >= 40 ? 'Atenção' : 'Crítica'
  const color = score >= 80 ? 'var(--good)' : score >= 60 ? 'var(--accent)' : score >= 40 ? 'var(--warn)' : 'var(--bad)'
  if (!tips.length) tips.push('Parabéns! Suas finanças estão equilibradas. Continue registrando tudo.')
  return { score, level, color, factors, tips }
}
