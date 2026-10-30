import type { Backend } from './backend'
import { splitInstallments } from './installments'
import type { TableName, Tables } from './tables'
import type {
  Category, GoalContribution, InstallmentPlan, PaymentMethod, Profile, RecurringBill, SavingsGoal, Transaction,
} from './types'

/**
 * Regras dos dados sobre a cópia local (usadas no modo demonstração e no modo nuvem).
 * Cada alteração principal é avisada em `changed`/`removed` (no modo nuvem, isso entra
 * na fila de envio). Efeitos em cascata (ex.: lançamentos que ficam sem categoria) são
 * só locais: o banco na nuvem faz o mesmo sozinho.
 */
export interface DataHooks {
  changed(t: TableName, rows: any[]): void | Promise<void>
  removed(t: TableName, ids: string[]): void | Promise<void>
}

export type DataApi = Pick<Backend,
  | 'listCategories' | 'saveCategory' | 'deleteCategory'
  | 'listPaymentMethods' | 'savePaymentMethod' | 'deletePaymentMethod'
  | 'listTransactions' | 'listUnpaid' | 'listPlanTransactions' | 'saveTransaction' | 'updateTransactions'
  | 'deleteTransaction' | 'insertRecurringTransactions'
  | 'listPlans' | 'createPlan' | 'updatePlan' | 'deletePlan'
  | 'listRecurring' | 'saveRecurring' | 'deleteRecurring'
  | 'getProfile' | 'saveProfile'
  | 'listGoals' | 'saveGoal' | 'deleteGoal' | 'listContributions' | 'saveContribution' | 'deleteContribution'>

const byDateDesc = (a: Transaction, b: Transaction) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
const uid = () => crypto.randomUUID()

/** Id fixo calculado a partir de um texto (mesma conta do mês = mesmo id em qualquer aparelho). */
export async function stableId(key: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))).slice(0, 16)
  h[6] = (h[6] & 0x0f) | 0x50 // versão 5 (baseado em nome)
  h[8] = (h[8] & 0x3f) | 0x80
  const x = [...h].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

export function createLocalData(tables: Tables, hooks: DataHooks, userId: () => string): DataApi {
  const stamp = <T,>(row: T): T => ({ ...row, client_updated_at: new Date().toISOString() })

  async function upsert(t: TableName, row: object & { id?: string }): Promise<any> {
    const id = row.id ?? uid()
    const full = stamp({ ...(tables.get(t, id) ?? {}), ...row, id })
    await tables.put(t, [full])
    await hooks.changed(t, [full])
    return full
  }
  async function remove(t: TableName, id: string) {
    await tables.del(t, [id])
    await hooks.removed(t, [id])
  }
  /** Altera linhas só localmente (efeito em cascata que a nuvem também faz). */
  async function localPatch<T extends { id: string }>(t: TableName, match: (r: T) => boolean, patch: Partial<T>) {
    const rows = tables.all<T>(t).filter(match).map((r) => ({ ...r, ...patch }))
    await tables.put(t, rows)
  }

  return {
    async listCategories() {
      return tables.all<Category>('categories').sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    },
    saveCategory: (c) => upsert('categories', c),
    async deleteCategory(id) {
      const gone = new Set([id, ...tables.all<Category>('categories').filter((c) => c.parent_id === id).map((c) => c.id)])
      await tables.del('categories', [...gone].filter((x) => x !== id))
      await remove('categories', id)
      const inGone = (r: { category_id: string | null }) => Boolean(r.category_id && gone.has(r.category_id))
      await localPatch<Transaction>('transactions', inGone, { category_id: null })
      await localPatch<InstallmentPlan>('installment_plans', inGone, { category_id: null })
      await localPatch<RecurringBill>('recurring_bills', inGone, { category_id: null })
    },

    async listPaymentMethods() {
      return tables.all<PaymentMethod>('payment_methods').sort((a, b) => a.name.localeCompare(b.name))
    },
    savePaymentMethod: (p) => upsert('payment_methods', p),
    async deletePaymentMethod(id) {
      await remove('payment_methods', id)
      const uses = (r: { payment_method_id: string | null }) => r.payment_method_id === id
      await localPatch<Transaction>('transactions', uses, { payment_method_id: null })
      await localPatch<InstallmentPlan>('installment_plans', uses, { payment_method_id: null })
      await localPatch<RecurringBill>('recurring_bills', uses, { payment_method_id: null })
    },

    async listTransactions(from, to) {
      return tables.all<Transaction>('transactions').filter((t) => t.date >= from && t.date <= to).sort(byDateDesc)
    },
    async listUnpaid(until) {
      return tables.all<Transaction>('transactions').filter((t) => !t.paid && t.date <= until).sort((a, b) => -byDateDesc(a, b))
    },
    async listPlanTransactions() {
      return tables.all<Transaction>('transactions')
        .filter((t) => t.installment_plan_id)
        .sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0))
    },
    saveTransaction: (t) => upsert('transactions', t),
    async updateTransactions(ids, patch) {
      const set = new Set(ids)
      const rows = tables.all<Transaction>('transactions').filter((t) => set.has(t.id)).map((t) => stamp({ ...t, ...patch, id: t.id }))
      await tables.put('transactions', rows)
      await hooks.changed('transactions', rows)
    },
    deleteTransaction: (id) => remove('transactions', id),
    async insertRecurringTransactions(ts) {
      const existing = tables.all<Transaction>('transactions')
      const seen = new Set(existing.filter((r) => r.recurring_bill_id).map((r) => `${r.recurring_bill_id}|${r.recurring_month}`))
      const rows: Transaction[] = []
      for (const t of ts) {
        const key = `${t.recurring_bill_id}|${t.recurring_month}`
        if (seen.has(key)) continue
        seen.add(key)
        // id fixo: dois aparelhos gerando a mesma conta do mês produzem o mesmo lançamento
        rows.push(stamp({ ...t, id: await stableId(`recurring:${key}`) }) as Transaction)
      }
      await tables.put('transactions', rows)
      await hooks.changed('transactions', rows)
    },

    async listPlans() {
      return tables.all<InstallmentPlan>('installment_plans').sort((a, b) => (a.first_due < b.first_due ? 1 : -1))
    },
    async createPlan(p) {
      const { first_paid, ...meta } = p
      const plan = await upsert('installment_plans', meta)
      const rows: Transaction[] = splitInstallments(p.total_amount, p.installments, p.first_due).map((part) => {
        const paid = part.number === 1 && first_paid
        return stamp({
          id: uid(), kind: 'expense', amount: part.amount, date: part.date,
          description: `${p.description} (${part.number}/${p.installments})`,
          category_id: p.category_id, payment_method_id: p.payment_method_id,
          paid, paid_at: paid ? part.date : null, notes: null,
          installment_plan_id: plan.id, installment_number: part.number,
          recurring_bill_id: null, recurring_month: null, receipt_path: null,
        })
      })
      await tables.put('transactions', rows)
      await hooks.changed('transactions', rows)
      return plan.id
    },
    async updatePlan(id, patch) {
      await upsert('installment_plans', { ...tables.get<InstallmentPlan>('installment_plans', id), ...patch, id })
    },
    async deletePlan(id) {
      await remove('installment_plans', id)
      // na nuvem as parcelas são apagadas em cascata
      const parts = tables.all<Transaction>('transactions').filter((t) => t.installment_plan_id === id).map((t) => t.id)
      await tables.del('transactions', parts)
    },

    async listRecurring() {
      // contas criadas antes da 0002 não têm amount_type: equivalem a "fixo"
      return tables.all<RecurringBill>('recurring_bills')
        .map((r) => ({ ...r, amount_type: r.amount_type ?? 'fixed', income_source: r.income_source ?? null }))
        .sort((a, b) => a.day_of_month - b.day_of_month)
    },
    saveRecurring: (r) => upsert('recurring_bills', r),
    async deleteRecurring(id) {
      await remove('recurring_bills', id)
      await localPatch<Transaction>('transactions', (t) => t.recurring_bill_id === id, { recurring_bill_id: null })
    },

    async getProfile() {
      return tables.get<Profile>('profiles', userId()) ?? null
    },
    async saveProfile(p) {
      const full = stamp({ ...(tables.get<Profile>('profiles', userId()) ?? {}), ...p, user_id: userId() }) as Profile
      await tables.put('profiles', [full])
      await hooks.changed('profiles', [full])
      return full
    },

    async listGoals() {
      return tables.all<SavingsGoal>('savings_goals')
    },
    saveGoal: (g) => upsert('savings_goals', g),
    async deleteGoal(id) {
      await remove('savings_goals', id)
      const cs = tables.all<GoalContribution>('goal_contributions').filter((c) => c.goal_id === id).map((c) => c.id)
      await tables.del('goal_contributions', cs)
    },
    async listContributions() {
      return tables.all<GoalContribution>('goal_contributions').sort((a, b) => (a.date < b.date ? 1 : -1))
    },
    saveContribution: (c) => upsert('goal_contributions', c),
    deleteContribution: (id) => remove('goal_contributions', id),
  }
}
