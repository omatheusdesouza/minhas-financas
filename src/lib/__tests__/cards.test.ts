import { describe, expect, it } from 'vitest'
import { closingFor, groupInvoices, invoiceFor, limitUsed, nextInvoiceDue, type Card } from '../cards'
import type { Transaction } from '../types'

const card = (closing_day: number, due_day: number, id = 'nu'): Card =>
  ({ id, name: id, archived: false, type: 'credit_card', closing_day, due_day, credit_limit: 3000 })

const tx = (p: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(), kind: 'expense', amount: 100, date: '2026-12-10', description: '', category_id: null,
  payment_method_id: 'nu', paid: false, paid_at: null, notes: null, installment_plan_id: null, installment_number: null,
  recurring_bill_id: null, recurring_month: null, receipt_path: null, purchase_date: '2026-11-20', ...p,
})

describe('cartão de crédito', () => {
  it('compra antes do fechamento cai na fatura atual; no dia do fechamento ou depois, na próxima', () => {
    const c = card(3, 10) // fecha dia 3, vence dia 10 do mesmo mês
    expect(invoiceFor(c, '2026-11-02')).toEqual({ closing: '2026-11-03', due: '2026-11-10' })
    expect(invoiceFor(c, '2026-11-03')).toEqual({ closing: '2026-12-03', due: '2026-12-10' })
    expect(invoiceFor(c, '2026-11-25')).toEqual({ closing: '2026-12-03', due: '2026-12-10' })
  })

  it('vencimento no mês seguinte ao fechamento e virada de ano', () => {
    const c = card(25, 5) // fecha dia 25, vence dia 5 do mês seguinte
    expect(invoiceFor(c, '2026-12-10')).toEqual({ closing: '2026-12-25', due: '2027-01-05' })
    expect(invoiceFor(c, '2026-12-26')).toEqual({ closing: '2027-01-25', due: '2027-02-05' })
    expect(closingFor(c, '2027-01-05')).toBe('2026-12-25')
  })

  it('dias que não existem no mês usam o último dia', () => {
    const c = card(30, 31)
    expect(invoiceFor(c, '2027-02-10')).toEqual({ closing: '2027-02-28', due: '2027-02-28' })
    expect(nextInvoiceDue(c, '2027-01-31', 1)).toBe('2027-02-28')
    expect(nextInvoiceDue(c, '2027-01-31', 2)).toBe('2027-03-31')
  })

  it('agrupa as compras em faturas e calcula a situação', () => {
    const cards = new Map([['nu', card(3, 10)]])
    const list = [
      tx({ amount: 50.1, date: '2026-11-10', paid: true, purchase_date: '2026-10-20' }),
      tx({ amount: 100, date: '2026-12-10' }),
      tx({ amount: 20.2, date: '2026-12-10', purchase_date: '2026-11-28' }),
      tx({ amount: 999, payment_method_id: null }), // não é do cartão
      tx({ amount: 77, purchase_date: null }), // compra antiga, sem fatura
    ]
    const inv = groupInvoices(list, cards, '2026-12-05')
    expect(inv.map((i) => [i.due, i.total, i.pending, i.status])).toEqual([
      ['2026-11-10', 50.1, 0, 'paid'],
      ['2026-12-10', 120.2, 120.2, 'closed'],
    ])
    expect(groupInvoices(list, cards, '2026-11-25')[1].status).toBe('open')
    expect(groupInvoices(list, cards, '2026-12-11')[1].status).toBe('overdue')
  })

  it('limite usado soma tudo o que ainda não foi pago, inclusive parcelas futuras', () => {
    const c = card(3, 10)
    const list = [tx({ amount: 100 }), tx({ amount: 300, date: '2027-01-10' }), tx({ amount: 50, paid: true }), tx({ amount: 10, payment_method_id: 'outro' })]
    expect(limitUsed(c, list)).toBe(400)
  })
})
