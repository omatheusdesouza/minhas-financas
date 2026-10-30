import { api } from './api'
import { addMonths, dayInMonth, monthsBetween, startOfMonth, today } from './dates'
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS } from './defaults'
import type { Category, Kind, RecurringBill, Transaction } from './types'

/** Na primeira entrada da conta, cria categorias e formas de pagamento iniciais. */
export async function seedIfEmpty(): Promise<boolean> {
  const [cats, pms] = await Promise.all([api.listCategories(), api.listPaymentMethods()])
  let seeded = false
  if (cats.length === 0) {
    let order = 0
    for (const kind of ['expense', 'income'] as Kind[]) {
      for (const seed of DEFAULT_CATEGORIES[kind]) {
        const parent = await api.saveCategory({
          parent_id: null, name: seed.name, kind, nature: seed.nature, icon: seed.icon,
          color: seed.color, monthly_budget: null, sort_order: order++, archived: false,
        })
        for (const [i, child] of (seed.children ?? []).entries()) {
          await api.saveCategory({
            parent_id: parent.id, name: child.name, kind, nature: child.nature ?? seed.nature,
            icon: child.icon, color: seed.color, monthly_budget: null, sort_order: i, archived: false,
          })
        }
      }
    }
    seeded = true
  }
  if (pms.length === 0) {
    for (const name of DEFAULT_PAYMENT_METHODS) await api.savePaymentMethod({ name, archived: false })
    seeded = true
  }
  return seeded
}

/** Lança as contas fixas do mês atual e do próximo, uma única vez por mês. */
export async function generateRecurring(bills: RecurringBill[]): Promise<number> {
  const horizon = addMonths(startOfMonth(today()), 1)
  let created = 0
  for (const bill of bills) {
    if (!bill.active) continue
    const from = bill.generated_until ? addMonths(bill.generated_until, 1) : startOfMonth(bill.start_month)
    const end = bill.end_month && bill.end_month < horizon ? startOfMonth(bill.end_month) : horizon
    if (from > end) continue
    const months = monthsBetween(from, end)
    await api.insertRecurringTransactions(months.map((m) => recurringTx(bill, m)))
    await api.saveRecurring({ ...bill, generated_until: end })
    created += months.length
  }
  return created
}

function recurringTx(bill: RecurringBill, month: string) {
  return {
    kind: bill.kind, amount: bill.amount, date: dayInMonth(month, bill.day_of_month),
    description: bill.description, category_id: bill.category_id,
    payment_method_id: bill.payment_method_id, paid: false, paid_at: null, notes: null,
    installment_plan_id: null, installment_number: null,
    recurring_bill_id: bill.id, recurring_month: month,
  }
}

/** Ao editar uma conta fixa, atualiza também os lançamentos futuros ainda não pagos. */
export async function propagateRecurring(bill: RecurringBill) {
  const pending = (await api.listTransactions(today(), addMonths(today(), 24)))
    .filter((t) => t.recurring_bill_id === bill.id && !t.paid)
  for (const t of pending) {
    await api.saveTransaction({
      ...t, amount: bill.amount, description: bill.description, kind: bill.kind,
      category_id: bill.category_id, payment_method_id: bill.payment_method_id,
      date: dayInMonth(t.recurring_month ?? startOfMonth(t.date), bill.day_of_month),
    })
  }
}

export async function togglePaid(t: Transaction): Promise<Transaction> {
  const paid = !t.paid
  return api.saveTransaction({ ...t, paid, paid_at: paid ? today() : null })
}

/** Helpers de categoria */
export class CategoryIndex {
  readonly byId = new Map<string, Category>()
  constructor(readonly all: Category[]) {
    for (const c of all) this.byId.set(c.id, c)
  }
  get(id: string | null | undefined) {
    return id ? this.byId.get(id) : undefined
  }
  root(id: string | null | undefined): Category | undefined {
    let c = this.get(id)
    while (c?.parent_id) c = this.get(c.parent_id) ?? c
    return c
  }
  roots(kind?: Kind, includeArchived = false) {
    return this.all.filter((c) => !c.parent_id && (!kind || c.kind === kind) && (includeArchived || !c.archived))
  }
  children(id: string, includeArchived = false) {
    return this.all.filter((c) => c.parent_id === id && (includeArchived || !c.archived))
  }
  label(id: string | null | undefined): string {
    const c = this.get(id)
    if (!c) return 'Sem categoria'
    const p = c.parent_id ? this.get(c.parent_id) : undefined
    return p ? `${p.name} › ${c.name}` : c.name
  }
  /** Natureza: a da subcategoria, ou herdada da categoria principal. */
  nature(id: string | null | undefined) {
    return this.get(id)?.nature ?? 'essencial'
  }
}

export interface Slice {
  id: string
  name: string
  icon: string
  color: string
  total: number
}

export function sumBy(txs: Transaction[], kind: Kind) {
  return txs.reduce((s, t) => (t.kind === kind ? s + t.amount : s), 0)
}

/** Total por categoria principal (ou por subcategoria de uma principal). */
export function byCategory(txs: Transaction[], idx: CategoryIndex, kind: Kind, parentId?: string): Slice[] {
  const map = new Map<string, Slice>()
  for (const t of txs) {
    if (t.kind !== kind) continue
    let key: Category | undefined
    if (parentId) {
      if (idx.root(t.category_id)?.id !== parentId) continue
      key = idx.get(t.category_id)
    } else key = idx.root(t.category_id)
    const id = key?.id ?? 'none'
    const s = map.get(id) ?? {
      id, name: key?.name ?? 'Sem categoria', icon: key?.icon ?? '❔', color: key?.color ?? '#94a3b8', total: 0,
    }
    s.total += t.amount
    map.set(id, s)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}
