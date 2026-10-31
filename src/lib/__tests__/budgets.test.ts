import { describe, expect, it } from 'vitest'
import { budgetMessage, budgetStatus, crossed } from '../budgets'
import { CategoryIndex } from '../services'
import type { Category, Transaction } from '../types'

const cat = (id: string, name: string, monthly_budget: number | null, parent_id: string | null = null): Category =>
  ({ id, name, kind: 'expense', icon: '🍔', color: '', parent_id, archived: false, sort_order: 0, nature: 'superfluo', monthly_budget } as unknown as Category)
const idx = new CategoryIndex([cat('food', 'Delivery', 400), cat('ifood', 'iFood', null, 'food'), cat('mkt', 'Mercado', null), cat('bar', 'Bares', 100, 'mkt')])
const tx = (category_id: string, amount: number | null): Transaction => ({
  id: crypto.randomUUID(), kind: 'expense', amount, date: '2026-10-10', description: '', category_id, payment_method_id: null, paid: true,
  paid_at: null, notes: null, installment_plan_id: null, installment_number: null, recurring_bill_id: null, recurring_month: null, receipt_path: null,
})

describe('limites por categoria', () => {
  it('soma as subcategorias no limite da principal e calcula o nível', () => {
    const s = budgetStatus([tx('food', 200), tx('ifood', 130), tx('bar', 50), tx('mkt', 999), tx('food', null)], idx)
    expect(s.map((x) => [x.category.id, x.spent, x.level])).toEqual([['food', 330, 'warn'], ['bar', 50, 'ok']])
  })

  it('avisa só quando o limite é cruzado (80% e 100%)', () => {
    const before = budgetStatus([tx('food', 300)], idx) // 75%
    const warn = budgetStatus([tx('food', 300), tx('food', 30)], idx) // 82,5%
    expect(crossed(before, warn).map((x) => x.level)).toEqual(['warn'])
    expect(crossed(warn, budgetStatus([tx('food', 300), tx('food', 40)], idx))).toEqual([]) // continua em alerta: não repete
    const over = budgetStatus([tx('food', 300), tx('food', 120)], idx)
    expect(crossed(warn, over).map((x) => x.level)).toEqual(['over'])
    expect(crossed(over, before)).toEqual([]) // baixou: nada a avisar
  })

  it('mensagens', () => {
    const [s] = budgetStatus([tx('food', 340)], idx)
    expect(budgetMessage(s)).toMatch(/Delivery chegou a 85% do limite: R\$\s?340,00 de R\$\s?400,00/)
    const [o] = budgetStatus([tx('food', 450)], idx)
    expect(budgetMessage(o, 'novembro')).toMatch(/estourou o limite em novembro: .*\+R\$\s?50,00/)
  })
})
