import { describe, expect, it } from 'vitest'
import { adjustment, balances, cashAccountOf, cashTotal, earliestOpening, statement } from '../cash'
import type { AccountMove, PaymentMethod, Transaction } from '../types'

const acc = (id: string, opening: number, date = '2026-11-01', archived = false): PaymentMethod =>
  ({ id, name: id, archived, type: 'account', opening_balance: opening, opening_date: date })
const card: PaymentMethod = { id: 'card', name: 'Cartão', archived: false, type: 'credit_card', closing_day: 3, due_day: 10 }
const pix: PaymentMethod = { id: 'pix', name: 'Pix', archived: false, type: 'other' }
const methods = [acc('nu', 1000), acc('itau', -50.5), acc('velha', 300, '2026-11-01', true), card, pix]
const tx = (p: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(), kind: 'expense', amount: 10, date: '2026-11-05', description: 'x', category_id: null, payment_method_id: null,
  paid: true, paid_at: null, notes: null, installment_plan_id: null, installment_number: null, recurring_bill_id: null,
  recurring_month: null, receipt_path: null, ...p,
})
const move = (p: Partial<AccountMove>): AccountMove => ({ id: crypto.randomUUID(), kind: 'transfer', from_id: null, to_id: null, amount: 10, date: '2026-11-05', note: null, ...p })

describe('caixa', () => {
  const byId = new Map(methods.map((m) => [m.id, m]))

  it('conta do lançamento: a forma de pagamento se for conta; senão "pago com"', () => {
    expect(cashAccountOf({ payment_method_id: 'nu', paid_from: 'itau' }, byId)).toBe('nu')
    expect(cashAccountOf({ payment_method_id: 'card', paid_from: 'itau' }, byId)).toBe('itau')
    expect(cashAccountOf({ payment_method_id: 'pix', paid_from: null }, byId)).toBeNull()
    expect(cashAccountOf({ payment_method_id: null, paid_from: 'pix' }, byId)).toBeNull() // "pago com" precisa ser conta
  })

  it('saldo: inicial + ganhos − gastos pagos a partir da data; transferências e ajustes', () => {
    const txs = [
      tx({ kind: 'income', amount: 5000, payment_method_id: 'nu', paid_at: '2026-11-05' }),
      tx({ amount: 89.9, payment_method_id: 'nu' }),
      tx({ amount: 200, payment_method_id: 'nu', paid: false }), // não pago: não mexe no caixa
      tx({ amount: 999, payment_method_id: 'nu', date: '2026-10-30', paid_at: '2026-10-30' }), // antes do saldo inicial
      tx({ amount: 345.6, payment_method_id: 'card', date: '2026-11-10', paid_at: '2026-11-08', paid_from: 'itau' }), // fatura paga pelo Itaú
      tx({ amount: 50, payment_method_id: 'pix' }), // forma sem conta
    ]
    const moves = [
      move({ kind: 'transfer', from_id: 'nu', to_id: 'itau', amount: 1000 }),
      move({ kind: 'adjust', to_id: 'itau', amount: 0.5, date: '2026-11-09' }),
      move({ kind: 'transfer', from_id: 'nu', to_id: 'itau', amount: 7, date: '2026-10-01' }), // antes: ignorada
    ]
    const b = balances(methods, txs, moves)
    const get = (id: string) => b.find((x) => x.account.id === id)!
    expect(get('nu').balance).toBe(1000 + 5000 - 89.9 - 1000)
    expect(get('itau').balance).toBe(-50.5 + 1000 + 0.5 - 345.6)
    expect(get('nu').inflow).toBe(5000)
    expect(get('nu').outflow).toBe(1089.9)
    expect(get('velha').balance).toBe(300)
    expect(cashTotal(b)).toBe(Math.round((4910.1 + 604.4) * 100) / 100) // conta arquivada fica fora do total
  })

  it('extrato com saldo após cada movimento (mais recente primeiro)', () => {
    const s = statement(acc('nu', 100), [
      tx({ kind: 'income', amount: 50, payment_method_id: 'nu', date: '2026-11-02', description: 'Pix recebido' }),
      tx({ amount: 30, payment_method_id: 'nu', date: '2026-11-03', description: 'Mercado' }),
    ], [move({ kind: 'transfer', from_id: 'nu', to_id: 'itau', amount: 20, date: '2026-11-04' })], methods)
    expect(s.map((e) => [e.label, e.amount, e.balance])).toEqual([
      ['Transferência para itau', -20, 100], ['Mercado', -30, 120], ['Pix recebido', 50, 150],
    ])
  })

  it('ajuste para bater com o banco e data inicial do caixa', () => {
    expect(adjustment('nu', 100, 130.25, '2026-11-06')).toMatchObject({ kind: 'adjust', to_id: 'nu', from_id: null, amount: 30.25 })
    expect(adjustment('nu', 100, 60, '2026-11-06')).toMatchObject({ kind: 'adjust', from_id: 'nu', to_id: null, amount: 40 })
    expect(adjustment('nu', 100, 100.001, '2026-11-06')).toBeNull()
    expect(earliestOpening([acc('a', 1, '2026-11-03'), acc('b', 1, '2026-10-15'), card])).toBe('2026-10-15')
    expect(earliestOpening([card])).toBeNull()
  })
})
