import type { Backend, User } from './backend'
import { splitInstallments } from './installments'
import type {
  Category, Draft, GoalContribution, InstallmentPlan, PaymentMethod, Profile, RecurringBill, SavingsGoal, Transaction,
} from './types'

/** Modo demonstração: guarda tudo no próprio aparelho, sem conta e sem nuvem. */

type Tables = {
  categories: Category
  payment_methods: PaymentMethod
  transactions: Transaction
  installment_plans: InstallmentPlan
  recurring_bills: RecurringBill
  savings_goals: SavingsGoal
  goal_contributions: GoalContribution
}

const PREFIX = 'mf-demo:'
const DEMO_USER: User = { id: 'demo', email: 'demonstracao@aparelho' }

function load<K extends keyof Tables>(t: K): Tables[K][] {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + t) ?? '[]')
  } catch {
    return []
  }
}
function store<K extends keyof Tables>(t: K, rows: Tables[K][]) {
  localStorage.setItem(PREFIX + t, JSON.stringify(rows))
}
function uid() {
  return crypto.randomUUID()
}
function upsert<K extends keyof Tables>(t: K, row: Draft<Tables[K]>): Tables[K] {
  const rows = load(t)
  const full = { ...row, id: row.id ?? uid() } as Tables[K]
  const i = rows.findIndex((r) => r.id === full.id)
  if (i >= 0) rows[i] = { ...rows[i], ...full }
  else rows.push(full)
  store(t, rows)
  return i >= 0 ? rows[i] : full
}
function remove<K extends keyof Tables>(t: K, id: string) {
  store(t, load(t).filter((r) => r.id !== id))
}

const byDateDesc = (a: Transaction, b: Transaction) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)

export function createLocalBackend(): Backend {
  const listeners = new Set<(u: User | null, e?: string) => void>()
  const signedIn = () => localStorage.getItem(PREFIX + 'session') === '1'
  const setSigned = (v: boolean) => {
    if (v) localStorage.setItem(PREFIX + 'session', '1')
    else localStorage.removeItem(PREFIX + 'session')
    listeners.forEach((cb) => cb(v ? DEMO_USER : null, v ? 'SIGNED_IN' : 'SIGNED_OUT'))
  }

  return {
    mode: 'demo',
    async getUser() {
      return signedIn() ? DEMO_USER : null
    },
    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async signIn() {
      setSigned(true)
    },
    async signUp() {
      setSigned(true)
      return { needsConfirmation: false }
    },
    async resetPassword() {},
    async verifyRecovery() {
      setSigned(true)
    },
    async updatePassword() {},
    async signOut() {
      setSigned(false)
    },

    async listCategories() {
      return load('categories').sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    },
    async saveCategory(c) {
      return upsert('categories', c)
    },
    async deleteCategory(id) {
      const children = load('categories').filter((c) => c.parent_id === id).map((c) => c.id)
      const gone = new Set([id, ...children])
      store('categories', load('categories').filter((c) => !gone.has(c.id)))
      const clear = <T extends { category_id: string | null }>(rows: T[]) =>
        rows.map((r) => (r.category_id && gone.has(r.category_id) ? { ...r, category_id: null } : r))
      store('transactions', clear(load('transactions')))
      store('installment_plans', clear(load('installment_plans')))
      store('recurring_bills', clear(load('recurring_bills')))
    },

    async listPaymentMethods() {
      return load('payment_methods').sort((a, b) => a.name.localeCompare(b.name))
    },
    async savePaymentMethod(p) {
      return upsert('payment_methods', p)
    },
    async deletePaymentMethod(id) {
      remove('payment_methods', id)
      store('transactions', load('transactions').map((t) => (t.payment_method_id === id ? { ...t, payment_method_id: null } : t)))
    },

    async listTransactions(from, to) {
      return load('transactions').filter((t) => t.date >= from && t.date <= to).sort(byDateDesc)
    },
    async listUnpaid(until) {
      return load('transactions').filter((t) => !t.paid && t.date <= until).sort((a, b) => -byDateDesc(a, b))
    },
    async listPlanTransactions() {
      return load('transactions')
        .filter((t) => t.installment_plan_id)
        .sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0))
    },
    async saveTransaction(t) {
      return upsert('transactions', t)
    },
    async updateTransactions(ids, patch) {
      const set = new Set(ids)
      store('transactions', load('transactions').map((t) => (set.has(t.id) ? { ...t, ...patch, id: t.id } : t)))
    },
    async deleteTransaction(id) {
      remove('transactions', id)
    },
    async insertRecurringTransactions(ts) {
      const rows = load('transactions')
      const seen = new Set(rows.filter((r) => r.recurring_bill_id).map((r) => `${r.recurring_bill_id}|${r.recurring_month}`))
      for (const t of ts) {
        const key = `${t.recurring_bill_id}|${t.recurring_month}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push({ ...t, id: uid() } as Transaction)
      }
      store('transactions', rows)
    },

    async listPlans() {
      return load('installment_plans').sort((a, b) => (a.first_due < b.first_due ? 1 : -1))
    },
    async createPlan(p) {
      const { first_paid, ...meta } = p
      const plan = upsert('installment_plans', meta)
      const rows = load('transactions')
      for (const part of splitInstallments(p.total_amount, p.installments, p.first_due)) {
        const paid = part.number === 1 && first_paid
        rows.push({
          id: uid(), kind: 'expense', amount: part.amount, date: part.date,
          description: `${p.description} (${part.number}/${p.installments})`,
          category_id: p.category_id, payment_method_id: p.payment_method_id,
          paid, paid_at: paid ? part.date : null, notes: null,
          installment_plan_id: plan.id, installment_number: part.number,
          recurring_bill_id: null, recurring_month: null, receipt_path: null,
        })
      }
      store('transactions', rows)
      return plan.id
    },
    async updatePlan(id, patch) {
      upsert('installment_plans', { ...(load('installment_plans').find((p) => p.id === id) as InstallmentPlan), ...patch, id })
    },
    async deletePlan(id) {
      remove('installment_plans', id)
      store('transactions', load('transactions').filter((t) => t.installment_plan_id !== id))
    },

    async listRecurring() {
      // contas criadas antes da 0002 não têm amount_type: equivalem a "fixo"
      return load('recurring_bills')
        .map((r) => ({ ...r, amount_type: r.amount_type ?? 'fixed', income_source: r.income_source ?? null }))
        .sort((a, b) => a.day_of_month - b.day_of_month)
    },
    async saveRecurring(r) {
      return upsert('recurring_bills', r)
    },
    async deleteRecurring(id) {
      remove('recurring_bills', id)
      store('transactions', load('transactions').map((t) => (t.recurring_bill_id === id ? { ...t, recurring_bill_id: null } : t)))
    },

    async getProfile() {
      try {
        return JSON.parse(localStorage.getItem(PREFIX + 'profile') ?? 'null')
      } catch {
        return null
      }
    },
    async saveProfile(p) {
      const full: Profile = { ...p, user_id: DEMO_USER.id }
      localStorage.setItem(PREFIX + 'profile', JSON.stringify(full))
      return full
    },

    async listGoals() {
      return load('savings_goals')
    },
    async saveGoal(g) {
      return upsert('savings_goals', g)
    },
    async deleteGoal(id) {
      remove('savings_goals', id)
      store('goal_contributions', load('goal_contributions').filter((c) => c.goal_id !== id))
    },
    async listContributions() {
      return load('goal_contributions').sort((a, b) => (a.date < b.date ? 1 : -1))
    },
    async saveContribution(c) {
      return upsert('goal_contributions', c)
    },
    async deleteContribution(id) {
      remove('goal_contributions', id)
    },

    // Arquivos do modo demonstração ficam no próprio aparelho, como data URL
    async uploadFile(bucket, name, file) {
      const data = await new Promise<string>((ok, fail) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result))
        r.onerror = () => fail(new Error('Não foi possível ler o arquivo.'))
        r.readAsDataURL(file)
      })
      const path = `${DEMO_USER.id}/${name}-${uid()}`
      localStorage.setItem(`${PREFIX}file:${bucket}/${path}`, data)
      return path
    },
    async fileUrl(bucket, path) {
      return localStorage.getItem(`${PREFIX}file:${bucket}/${path}`) ?? ''
    },
    async removeFile(bucket, path) {
      localStorage.removeItem(`${PREFIX}file:${bucket}/${path}`)
    },
  }
}
