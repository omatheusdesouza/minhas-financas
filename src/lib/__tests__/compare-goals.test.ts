import { describe, expect, it } from 'vitest'
import { compareSpending, insights } from '../compare'
import { goalProgress } from '../goals'
import { CategoryIndex } from '../services'
import type { Category, GoalContribution, SavingsGoal, Transaction } from '../types'

const cat = (id: string, name: string, parent: string | null = null): Category => ({
  id, parent_id: parent, name, kind: 'expense', nature: 'essencial', icon: '🏷️', color: '#123', monthly_budget: null, sort_order: 0, archived: false,
})
const idx = new CategoryIndex([cat('casa', 'Casa'), cat('luz', 'Energia', 'casa'), cat('food', 'Fast food')])
let n = 0
const tx = (over: Partial<Transaction>): Transaction => ({
  id: `t${++n}`, kind: 'expense', amount: 10, date: '2026-10-10', description: '', category_id: 'food', payment_method_id: null,
  paid: true, paid_at: null, notes: null, installment_plan_id: null, installment_number: null, recurring_bill_id: null,
  recurring_month: null, receipt_path: null, ...over,
})

describe('comparação com o período anterior', () => {
  it('compara conta fixa com conta fixa: "sua conta de luz subiu 18%"', () => {
    const prev = [tx({ amount: 112, recurring_bill_id: 'b-luz', description: 'Energia', category_id: 'luz' })]
    const cur = [tx({ amount: 132.16, recurring_bill_id: 'b-luz', description: 'Energia', category_id: 'luz' })]
    const [c] = compareSpending(cur, prev, idx)
    expect(c.label).toBe('Energia')
    expect(c.delta).toBe(20.16)
    expect(Math.round(c.pct! * 100)).toBe(18)
    expect(insights([c])[0]).toMatch(/^Energia subiu 18% \(R\$\s112,00 → R\$\s132,16\)$/)
  })

  it('agrupa gastos avulsos por categoria e ordena pela maior variação', () => {
    const prev = [tx({ amount: 50 }), tx({ amount: 30, category_id: 'casa' })]
    const cur = [tx({ amount: 150 }), tx({ amount: 25, category_id: 'casa' })]
    const cs = compareSpending(cur, prev, idx)
    expect(cs.map((c) => c.label)).toEqual(['Fast food', 'Casa'])
    expect(insights(cs)).toEqual([expect.stringMatching(/^Fast food subiu 200%/)])  // Casa: só R$ 5, abaixo do mínimo
  })

  it('gasto novo, gasto que sumiu e valores não informados', () => {
    const cs = compareSpending(
      [tx({ amount: 80 }), tx({ amount: null, paid: false, recurring_bill_id: 'b-agua', description: 'Água' })],
      [tx({ amount: 60, category_id: 'casa' })], idx,
    )
    expect(cs.find((c) => c.key === 'bill:b-agua')).toBeUndefined()
    const text = insights(cs)
    expect(text).toContain('Fast food: novo gasto de R$ 80,00')
    expect(text).toContain('Casa: nenhum gasto (antes R$ 60,00)')
  })

  it('ignora ganhos', () => {
    expect(compareSpending([tx({ kind: 'income', amount: 5000 })], [], idx)).toEqual([])
  })
})

describe('progresso das metas', () => {
  const goal = (over: Partial<SavingsGoal> = {}): SavingsGoal => ({
    id: 'g', name: 'Reserva', icon: '🎯', color: '#B8964F', target_amount: 10000, monthly_contribution: 500,
    contribution_day: 5, target_date: null, archived: false, ...over,
  })
  const c = (date: string, amount: number): GoalContribution => ({ id: date + amount, goal_id: 'g', amount, date, note: null })

  it('soma os aportes e calcula quanto falta e em quantos meses', () => {
    const p = goalProgress(goal(), [c('2026-08-05', 500), c('2026-09-05', 500), c('2026-10-05', 1000)], '2026-10-30')
    expect(p.saved).toBe(2000)
    expect(p.remaining).toBe(8000)
    expect(p.pct).toBe(0.2)
    expect(p.monthsToGo).toBe(16)
    expect(p.projected).toBe('2028-02-29')
  })

  it('histórico acumulado mês a mês, incluindo meses sem aporte', () => {
    const p = goalProgress(goal(), [c('2026-07-20', 300), c('2026-09-01', 200)], '2026-10-15')
    expect(p.history).toEqual([
      { month: '2026-07-01', total: 300 }, { month: '2026-08-01', total: 300 },
      { month: '2026-09-01', total: 500 }, { month: '2026-10-01', total: 500 },
    ])
  })

  it('com prazo: diz quanto guardar por mês e se está no ritmo', () => {
    const late = goalProgress(goal({ target_date: '2027-10-30' }), [], '2026-10-30')
    expect(late.neededPerMonth).toBeCloseTo(833.33, 1)
    expect(late.onTrack).toBe(false) // 500/mês leva 20 meses
    const ok = goalProgress(goal({ target_date: '2029-01-01' }), [], '2026-10-30')
    expect(ok.onTrack).toBe(true)
  })

  it('meta alcançada e meta sem aporte mensal', () => {
    const done = goalProgress(goal(), [c('2026-10-01', 12000)], '2026-10-30')
    expect(done.done).toBe(true)
    expect(done.pct).toBe(1)
    expect(done.remaining).toBe(0)
    expect(goalProgress(goal({ monthly_contribution: null }), [], '2026-10-30').monthsToGo).toBeNull()
  })
})
