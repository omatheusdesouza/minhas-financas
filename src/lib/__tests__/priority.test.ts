import { describe, expect, it } from 'vitest'
import { autoPriority, effectivePriority, recommend, type PlanBill } from '../priority'
import { CategoryIndex } from '../services'
import type { Category, RecurringBill, Transaction } from '../types'

const cat = (id: string, name: string, parent: string | null = null, p: Partial<Category> = {}): Category =>
  ({ id, name, kind: 'expense', icon: '', color: '', parent_id: parent, archived: false, sort_order: 0, nature: 'essencial', monthly_budget: null, ...p })
const idx = new CategoryIndex([
  cat('casa', 'Casa – contas fixas'), cat('alug', 'Aluguel / financiamento', 'casa'), cat('net', 'Internet / telefone', 'casa'),
  cat('bes', 'Besteiras', null, { nature: 'superfluo' }), cat('apps', 'Apps e assinaturas', 'bes'), cat('prom', 'Promissórias e parcelas'),
  cat('outros', 'Outros gastos'), cat('lazer', 'Lazer', null, { nature: 'superfluo', priority: 2 }),
])
const tx = (p: Partial<Transaction>): Transaction => ({
  id: 't', kind: 'expense', amount: 10, date: '2026-11-10', description: '', category_id: null, payment_method_id: null, paid: false,
  paid_at: null, notes: null, installment_plan_id: null, installment_number: null, recurring_bill_id: null, recurring_month: null, receipt_path: null, ...p,
})

describe('prioridade sugerida', () => {
  it('pela categoria, pelo nome e pelo tipo', () => {
    expect(autoPriority(tx({ category_id: 'alug' }), idx)).toBe(1)
    expect(autoPriority(tx({ category_id: 'outros', description: 'Conta de luz' }), idx)).toBe(1)
    expect(autoPriority(tx({ category_id: 'prom' }), idx)).toBe(2)
    expect(autoPriority(tx({ category_id: 'outros', installment_plan_id: 'p' }), idx)).toBe(2)
    expect(autoPriority(tx({ category_id: 'net' }), idx)).toBe(3)
    expect(autoPriority(tx({ category_id: 'apps' }), idx)).toBe(4)
  })

  it('escolha da pessoa: lançamento → conta fixa → categoria → sugestão', () => {
    const rec = new Map<string, RecurringBill>([['r1', { id: 'r1', priority: 1 } as RecurringBill]])
    expect(effectivePriority(tx({ category_id: 'apps', priority: 2 }), idx, rec)).toEqual({ level: 2, source: 'tx' })
    expect(effectivePriority(tx({ category_id: 'apps', recurring_bill_id: 'r1' }), idx, rec)).toEqual({ level: 1, source: 'recurring' })
    expect(effectivePriority(tx({ category_id: 'lazer' }), idx, rec)).toEqual({ level: 2, source: 'category' })
    expect(effectivePriority(tx({ category_id: 'apps' }), idx, rec)).toEqual({ level: 4, source: 'auto' })
  })
})

const bill = (key: string, due: string, amount: number, priority: 1 | 2 | 3 | 4): PlanBill => ({ key, label: key, due, amount, priority })
const pick = (p: ReturnType<typeof recommend>) => Object.fromEntries(p.steps.map((s) => [s.bill.key, [s.action, s.payOn, s.fundedBy]]))

describe('pagamentos recomendados', () => {
  const today = '2026-11-06'

  it('dinheiro suficiente: cada conta é paga com a entrada mais perto do vencimento', () => {
    const p = recommend({
      cash: 500, today,
      incomes: [{ key: 's', label: 'Salário', date: '2026-11-10', amount: 3000 }, { key: 'e', label: 'Extra', date: '2026-11-20', amount: 1500 }],
      bills: [bill('Energia', '2026-11-08', 200, 1), bill('Aluguel', '2026-11-10', 1200, 1), bill('Netflix', '2026-11-07', 55, 4),
        bill('Fatura', '2026-11-12', 900, 2), bill('Internet', '2026-11-25', 120, 3)],
    })
    expect(pick(p)).toEqual({
      Energia: ['pay', today, 'hoje'], Netflix: ['pay', today, 'hoje'], Aluguel: ['pay', '2026-11-10', 'Salário'],
      Fatura: ['pay', '2026-11-10', 'Salário'], Internet: ['pay', '2026-11-20', 'Extra'],
    })
    expect(p.steps.map((s) => s.bill.key)).toEqual(['Energia', 'Netflix', 'Aluguel', 'Fatura', 'Internet'])
    expect(p.steps.map((s) => s.balanceAfter)).toEqual([300, 245, 2045, 1145, 2525])
    expect(p.shortfall).toBe(0)
    expect(p.nextIncome?.label).toBe('Salário')
    expect(p.needBeforeNext).toBe(255)
    // dos 500 de hoje, 255 vão para Energia e Netflix; o resto (245) está livre: os salários cobrem as outras contas
    expect(p.freeNow).toBe(245)
    expect(p.freeAtEnd).toBe(2525)
  })

  it('dinheiro curto e sem pagamento parcial: a fatura espera juntando o que sobra; a flexível não usa esse dinheiro', () => {
    const p = recommend({
      cash: 160, today,
      incomes: [{ key: 's', label: 'Salário', date: '2026-11-15', amount: 2000 }],
      bills: [bill('Netflix', '2026-11-07', 55, 4), bill('Energia', '2026-11-08', 150, 1), bill('Aluguel', '2026-11-15', 1500, 1), bill('Fatura', '2026-11-16', 600, 2)],
    })
    // 160 hoje paga a Energia; o salário paga o aluguel; para a fatura ficam guardados R$ 510 (faltam 90)
    expect(pick(p)).toEqual({
      Energia: ['pay', today, 'hoje'], Aluguel: ['pay', '2026-11-15', 'Salário'], Fatura: ['short', null, null], Netflix: ['short', null, null],
    })
    const fatura = p.steps.find((s) => s.bill.key === 'Fatura')!
    expect([fatura.paidAmount, fatura.missing]).toEqual([510, 90])
    expect([p.steps.find((s) => s.bill.key === 'Netflix')!.paidAmount, p.steps.find((s) => s.bill.key === 'Netflix')!.missing]).toEqual([0, 55])
    expect(p.shortfall).toBe(145)
    expect(p.freeNow).toBe(0)
  })

  it('essencial que não cabe até o vencimento é paga na próxima entrada (atrasada), antes das menos importantes', () => {
    const p = recommend({
      cash: 100, today,
      incomes: [{ key: 's', label: 'Salário', date: '2026-11-15', amount: 1000 }],
      bills: [bill('Energia', '2026-11-08', 300, 1), bill('Celular', '2026-11-09', 80, 3), bill('Academia', '2026-11-20', 900, 4)],
    })
    expect(pick(p)).toEqual({
      Celular: ['pay', today, 'hoje'], Energia: ['defer', '2026-11-15', 'Salário'], Academia: ['short', null, null],
    })
    expect(p.steps.find((s) => s.bill.key === 'Academia')!.missing).toBe(180)
  })

  it('conta atrasada conta como vencendo hoje', () => {
    const p = recommend({ cash: 50, today, incomes: [], bills: [bill('Água', '2026-11-01', 40, 1)] })
    expect(p.steps[0]).toMatchObject({ action: 'pay', payOn: today, overdue: true, daysLeft: -5, balanceAfter: 10 })
    expect(p.freeNow).toBe(10)
  })

  it('ganho previsto para hoje entra no plano, mas não conta como dinheiro livre', () => {
    const p = recommend({ cash: 100, today, incomes: [{ key: 's', label: 'Salário', date: today, amount: 2000 }], bills: [bill('Aluguel', today, 500, 1)] })
    expect(p.steps[0]).toMatchObject({ action: 'pay', payOn: today })
    expect(p.availableNow).toBe(2100)
    expect(p.freeNow).toBe(100)
  })
})
