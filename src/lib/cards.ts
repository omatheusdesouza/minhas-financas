import { addMonths, dayInMonth, startOfMonth } from './dates'
import type { PaymentMethod, Transaction } from './types'

/**
 * Cartão de crédito (migration 0007). Uma compra no cartão é um lançamento com:
 *  - date = vencimento da fatura em que ela cai (por isso conta no mês da fatura);
 *  - purchase_date = dia em que a compra foi feita.
 * A fatura é o conjunto das compras do cartão com o mesmo vencimento.
 */
export type Card = PaymentMethod & { type: 'credit_card'; closing_day: number; due_day: number }

export const isCard = (pm: PaymentMethod | null | undefined): pm is Card =>
  !!pm && pm.type === 'credit_card' && !!pm.closing_day && !!pm.due_day

/** Vencimento da fatura que fecha no mês de `closingMonth`. */
function dueAfterClosing(card: Pick<Card, 'closing_day' | 'due_day'>, closing: string) {
  const m = startOfMonth(closing)
  return card.due_day > card.closing_day ? dayInMonth(m, card.due_day) : dayInMonth(addMonths(m, 1), card.due_day)
}

/** Em qual fatura cai uma compra: antes do fechamento = fatura atual; no dia do fechamento ou depois = próxima. */
export function invoiceFor(card: Pick<Card, 'closing_day' | 'due_day'>, purchase: string): { closing: string; due: string } {
  const m = startOfMonth(purchase)
  let closing = dayInMonth(m, card.closing_day)
  if (purchase >= closing) closing = dayInMonth(addMonths(m, 1), card.closing_day)
  return { closing, due: dueAfterClosing(card, closing) }
}

/** Data de fechamento da fatura que vence em `due`. */
export function closingFor(card: Pick<Card, 'closing_day' | 'due_day'>, due: string): string {
  const m = startOfMonth(due)
  return card.due_day > card.closing_day ? dayInMonth(m, card.closing_day) : dayInMonth(addMonths(m, -1), card.closing_day)
}

/** Vencimento da fatura `n` meses depois da fatura que vence em `firstDue` (parcelas no cartão). */
export const nextInvoiceDue = (card: Pick<Card, 'due_day'>, firstDue: string, n: number) =>
  dayInMonth(addMonths(startOfMonth(firstDue), n), card.due_day)

/** A compra é de cartão (tem data da compra e a forma de pagamento é um cartão)? */
export function isCardPurchase(t: Pick<Transaction, 'purchase_date' | 'payment_method_id'>, cards: Map<string, Card>) {
  return !!t.purchase_date && !!t.payment_method_id && cards.has(t.payment_method_id)
}

export type InvoiceStatus = 'open' | 'closed' | 'overdue' | 'paid'

export interface Invoice {
  card: Card
  due: string
  closing: string
  total: number
  /** valor ainda não pago */
  pending: number
  items: Transaction[]
  status: InvoiceStatus
}

const round = (v: number) => Math.round(v * 100) / 100

/** Agrupa as compras dos cartões em faturas (mais próximas primeiro). */
export function groupInvoices(txs: Transaction[], cards: Map<string, Card>, today: string): Invoice[] {
  const map = new Map<string, Invoice>()
  for (const t of txs) {
    if (t.kind !== 'expense' || !isCardPurchase(t, cards)) continue
    const card = cards.get(t.payment_method_id!)!
    const key = `${card.id}|${t.date}`
    let inv = map.get(key)
    if (!inv) {
      inv = { card, due: t.date, closing: closingFor(card, t.date), total: 0, pending: 0, items: [], status: 'open' }
      map.set(key, inv)
    }
    inv.items.push(t)
    inv.total = round(inv.total + (t.amount ?? 0))
    if (!t.paid) inv.pending = round(inv.pending + (t.amount ?? 0))
  }
  for (const inv of map.values()) {
    inv.items.sort((a, b) => ((a.purchase_date ?? a.date) < (b.purchase_date ?? b.date) ? 1 : -1))
    inv.status = inv.pending === 0 ? 'paid' : today > inv.due ? 'overdue' : today >= inv.closing ? 'closed' : 'open'
  }
  return [...map.values()].sort((a, b) => (a.due === b.due ? a.card.name.localeCompare(b.card.name) : a.due < b.due ? -1 : 1))
}

/** Quanto do limite está tomado: tudo o que ainda não foi pago (inclui parcelas futuras). */
export function limitUsed(card: Card, txs: Transaction[]): number {
  return round(txs.filter((t) => t.kind === 'expense' && !t.paid && t.payment_method_id === card.id && t.purchase_date)
    .reduce((s, t) => s + (t.amount ?? 0), 0))
}

export const invoiceLabel = (s: InvoiceStatus) =>
  ({ open: 'Aberta', closed: 'Fechada', overdue: 'Vencida', paid: 'Paga' })[s]

/** Cartões entre as formas de pagamento, por id. */
export const cardMap = (methods: PaymentMethod[]) => new Map(methods.filter(isCard).map((c) => [c.id, c]))

/** Separa as compras de cartão (que viram faturas) dos demais lançamentos. */
export function splitCardPurchases(txs: Transaction[], cards: Map<string, Card>, today: string) {
  const rest = txs.filter((t) => !(t.kind === 'expense' && isCardPurchase(t, cards)))
  return { rest, invoices: groupInvoices(txs, cards, today) }
}

/** Faturas em aberto no formato de "conta a pagar" (lembretes): uma por fatura, com o valor que falta. */
export const invoicesAsBills = (invoices: Invoice[]) => invoices.filter((i) => i.pending > 0).map((i) => ({
  id: `fatura:${i.card.id}:${i.due}`, kind: 'expense' as const, date: i.due, paid: false, amount: i.pending,
  description: `Fatura ${i.card.name}`,
}))
