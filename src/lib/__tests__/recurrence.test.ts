import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecurringBill, Transaction } from '../types'

// Banco em memória no lugar do Supabase
const db = vi.hoisted(() => ({ txs: [] as any[], bills: new Map<string, any>() }))
vi.mock('../api', () => ({
  api: {
    async insertRecurringTransactions(ts: any[]) {
      for (const t of ts) {
        if (db.txs.some((x) => x.recurring_bill_id === t.recurring_bill_id && x.recurring_month === t.recurring_month)) continue
        db.txs.push({ ...t, id: `t${db.txs.length + 1}` })
      }
    },
    async saveRecurring(b: any) { db.bills.set(b.id, b); return b },
    async listTransactions(from: string, to: string) { return db.txs.filter((t) => t.date >= from && t.date <= to) },
    async saveTransaction(t: any) { const i = db.txs.findIndex((x) => x.id === t.id); db.txs[i] = t; return t },
  },
}))

import { generateRecurring, propagateRecurring } from '../services'

const bill = (over: Partial<RecurringBill> = {}): RecurringBill => ({
  id: 'b1', description: 'Aluguel', kind: 'expense', amount: 1450, amount_type: 'fixed', income_source: null,
  day_of_month: 10, category_id: null, payment_method_id: null, start_month: '2026-10-01', end_month: null,
  active: true, generated_until: null, notes: null, ...over,
})
const dates = (id = 'b1') => db.txs.filter((t: Transaction) => t.recurring_bill_id === id).map((t) => t.date)

beforeEach(() => {
  db.txs = []
  db.bills.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 20, 12, 0)) // 20/10/2026
})
afterEach(() => vi.useRealTimers())

describe('contas recorrentes', () => {
  it('gera o mês atual e o seguinte, uma única vez', async () => {
    const b = bill()
    await generateRecurring([b])
    expect(dates()).toEqual(['2026-10-10', '2026-11-10'])
    await generateRecurring([db.bills.get('b1')])
    await generateRecurring([b]) // mesmo com a versão antiga, não duplica
    expect(dates()).toEqual(['2026-10-10', '2026-11-10'])
  })

  it('gera a conta do mês seguinte quando o mês vira', async () => {
    await generateRecurring([bill()])
    vi.setSystemTime(new Date(2026, 11, 2)) // 02/12/2026
    await generateRecurring([db.bills.get('b1')])
    expect(dates()).toEqual(['2026-10-10', '2026-11-10', '2026-12-10', '2027-01-10'])
  })

  it('dia 31 respeita meses curtos e ano bissexto', async () => {
    vi.setSystemTime(new Date(2027, 0, 5))
    await generateRecurring([bill({ day_of_month: 31, start_month: '2027-01-01' })])
    expect(dates()).toEqual(['2027-01-31', '2027-02-28'])
    db.txs = []
    vi.setSystemTime(new Date(2028, 0, 5))
    await generateRecurring([bill({ id: 'b2', day_of_month: 30, start_month: '2028-01-01' })])
    expect(dates('b2')).toEqual(['2028-01-30', '2028-02-29'])
  })

  it('conta variável é gerada sem valor (informado depois)', async () => {
    await generateRecurring([bill({ amount_type: 'variable', amount: 90, description: 'Energia' })])
    expect(db.txs.map((t) => t.amount)).toEqual([null, null])
    expect(db.txs.every((t) => t.paid === false)).toBe(true)
  })

  it('conta nova do onboarding não começa vencida (skipPastDue)', async () => {
    await generateRecurring([bill({ day_of_month: 5 })], { skipPastDue: true })
    expect(dates()).toEqual(['2026-11-05'])
    await generateRecurring([bill({ id: 'b3', day_of_month: 25 })], { skipPastDue: true })
    expect(dates('b3')).toEqual(['2026-10-25', '2026-11-25'])
  })

  it('respeita o mês final e ignora contas pausadas', async () => {
    await generateRecurring([bill({ end_month: '2026-10-01' })])
    expect(dates()).toEqual(['2026-10-10'])
    await generateRecurring([bill({ id: 'b4', active: false })])
    expect(dates('b4')).toEqual([])
  })

  it('editar a conta atualiza os meses futuros, mas mantém o valor já informado nas variáveis', async () => {
    const v = bill({ amount_type: 'variable', amount: null, description: 'Água' })
    await generateRecurring([v])
    db.txs[1].amount = 87.4 // novembro já informado
    await propagateRecurring({ ...db.bills.get('b1'), description: 'Água e esgoto', day_of_month: 12 })
    const nov = db.txs.find((t) => t.recurring_month === '2026-11-01')
    expect(nov.amount).toBe(87.4)
    expect(nov.description).toBe('Água e esgoto')
    expect(nov.date).toBe('2026-11-12')
  })
})
