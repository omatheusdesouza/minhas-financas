import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Backend, User } from './backend'
import type { Category, GoalContribution, InstallmentPlan, Profile, RecurringBill, SavingsGoal, Transaction } from './types'

const num = (v: unknown) => (v == null ? v : Number(v))

function normTx(r: any): Transaction {
  return { ...r, amount: num(r.amount) as number | null }
}
function normCat(r: any): Category {
  return { ...r, monthly_budget: num(r.monthly_budget) }
}
function normPlan(r: any): InstallmentPlan {
  return { ...r, total_amount: Number(r.total_amount) }
}
function normRec(r: any): RecurringBill {
  return { ...r, amount: num(r.amount) as number | null }
}
function normGoal(r: any): SavingsGoal {
  return { ...r, target_amount: Number(r.target_amount), monthly_contribution: num(r.monthly_contribution) as number | null }
}
function normContrib(r: any): GoalContribution {
  return { ...r, amount: Number(r.amount) }
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
}

/** Mensagens de erro do Supabase traduzidas para o usuário. */
function translate(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
  if (m.includes('user already registered')) return 'Já existe uma conta com este e-mail.'
  if (m.includes('password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (m.includes('token has expired') || m.includes('otp')) return 'Código inválido ou expirado. Peça um novo.'
  if (m.includes('payload too large') || m.includes('exceeded the maximum allowed size')) return 'Arquivo grande demais.'
  if (m.includes('mime type') || m.includes('invalid_mime')) return 'Tipo de arquivo não permitido. Use foto (JPG/PNG) ou PDF.'
  if (m.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão com a internet.'
  return message
}

function check(res: { data: any; error: { message: string } | null }): any {
  if (res.error) throw new Error(translate(res.error.message))
  return res.data
}

function toUser(u: { id: string; email?: string } | null | undefined): User | null {
  return u ? { id: u.id, email: u.email ?? '' } : null
}

/** Remove campos que o banco preenche sozinho antes de gravar. */
function clean<T extends object>(o: T): T {
  const c: any = { ...o }
  if (!c.id) delete c.id
  delete c.user_id
  delete c.created_at
  delete c.updated_at
  return c
}

export function createSupabaseBackend(url: string, key: string): Backend {
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })

  return {
    mode: 'cloud',

    async getUser() {
      const { data } = await sb.auth.getSession()
      return toUser(data.session?.user)
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event, session) => cb(toUser(session?.user), event))
      return () => data.subscription.unsubscribe()
    },
    async signIn(email, password) {
      check(await sb.auth.signInWithPassword({ email, password }))
    },
    async signUp(email, password) {
      const data = check(await sb.auth.signUp({ email, password }))
      return { needsConfirmation: !data.session }
    },
    async resetPassword(email) {
      check(await sb.auth.resetPasswordForEmail(email))
    },
    async verifyRecovery(email, code) {
      check(await sb.auth.verifyOtp({ email, token: code.trim(), type: 'recovery' }))
    },
    async updatePassword(password) {
      check(await sb.auth.updateUser({ password }))
    },
    async signOut() {
      await sb.auth.signOut()
    },

    async listCategories() {
      const data = check(await sb.from('categories').select('*').order('sort_order').order('name'))
      return (data ?? []).map(normCat)
    },
    async saveCategory(c) {
      return normCat(check(await sb.from('categories').upsert(clean(c)).select().single()))
    },
    async deleteCategory(id) {
      check(await sb.from('categories').delete().eq('id', id))
    },

    async listPaymentMethods() {
      return check(await sb.from('payment_methods').select('*').order('name')) ?? []
    },
    async savePaymentMethod(p) {
      return check(await sb.from('payment_methods').upsert(clean(p)).select().single())
    },
    async deletePaymentMethod(id) {
      check(await sb.from('payment_methods').delete().eq('id', id))
    },

    async listTransactions(from, to) {
      const data = check(
        await sb.from('transactions').select('*').gte('date', from).lte('date', to)
          .order('date', { ascending: false }).order('created_at', { ascending: false }).limit(10000),
      )
      return (data ?? []).map(normTx)
    },
    async listUnpaid(until) {
      const data = check(
        await sb.from('transactions').select('*').eq('paid', false).lte('date', until).order('date').limit(5000),
      )
      return (data ?? []).map(normTx)
    },
    async listPlanTransactions() {
      const data = check(
        await sb.from('transactions').select('*').not('installment_plan_id', 'is', null)
          .order('installment_number').limit(10000),
      )
      return (data ?? []).map(normTx)
    },
    async saveTransaction(t) {
      return normTx(check(await sb.from('transactions').upsert(clean(t)).select().single()))
    },
    async updateTransactions(ids, patch) {
      if (!ids.length) return
      check(await sb.from('transactions').update(clean(patch)).in('id', ids))
    },
    async deleteTransaction(id) {
      check(await sb.from('transactions').delete().eq('id', id))
    },
    async insertRecurringTransactions(ts) {
      if (!ts.length) return
      check(
        await sb.from('transactions')
          .upsert(ts.map(clean), { onConflict: 'recurring_bill_id,recurring_month', ignoreDuplicates: true }),
      )
    },

    async listPlans() {
      const data = check(await sb.from('installment_plans').select('*').order('first_due', { ascending: false }))
      return (data ?? []).map(normPlan)
    },
    async createPlan(p) {
      return check(
        await sb.rpc('create_installment_plan', {
          p_description: p.description,
          p_creditor: p.creditor,
          p_category_id: p.category_id,
          p_payment_method_id: p.payment_method_id,
          p_total_amount: p.total_amount,
          p_installments: p.installments,
          p_first_due: p.first_due,
          p_notes: p.notes,
          p_first_paid: p.first_paid,
        }),
      ) as string
    },
    async updatePlan(id, patch) {
      check(await sb.from('installment_plans').update(clean(patch)).eq('id', id))
    },
    async deletePlan(id) {
      check(await sb.from('installment_plans').delete().eq('id', id))
    },

    async listRecurring() {
      const data = check(await sb.from('recurring_bills').select('*').order('day_of_month'))
      return (data ?? []).map(normRec)
    },
    async saveRecurring(r) {
      return normRec(check(await sb.from('recurring_bills').upsert(clean(r)).select().single()))
    },
    async deleteRecurring(id) {
      check(await sb.from('recurring_bills').delete().eq('id', id))
    },

    async getProfile() {
      return check(await sb.from('profiles').select('*').maybeSingle()) as Profile | null
    },
    async saveProfile(p) {
      return check(await sb.from('profiles').upsert(clean(p)).select().single()) as Profile
    },

    async listGoals() {
      const data = check(await sb.from('savings_goals').select('*').order('created_at'))
      return (data ?? []).map(normGoal)
    },
    async saveGoal(g) {
      return normGoal(check(await sb.from('savings_goals').upsert(clean(g)).select().single()))
    },
    async deleteGoal(id) {
      check(await sb.from('savings_goals').delete().eq('id', id))
    },
    async listContributions() {
      const data = check(await sb.from('goal_contributions').select('*').order('date', { ascending: false }).limit(5000))
      return (data ?? []).map(normContrib)
    },
    async saveContribution(c) {
      return normContrib(check(await sb.from('goal_contributions').upsert(clean(c)).select().single()))
    },
    async deleteContribution(id) {
      check(await sb.from('goal_contributions').delete().eq('id', id))
    },

    async uploadFile(bucket, name, file) {
      const { data } = await sb.auth.getSession()
      const uid = data.session?.user.id
      if (!uid) throw new Error('Faça login novamente.')
      const ext = EXT[file.type] ?? 'bin'
      const path = `${uid}/${name}-${crypto.randomUUID()}.${ext}`
      check(await sb.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false }))
      return path
    },
    async fileUrl(bucket, path) {
      const data = check(await sb.storage.from(bucket).createSignedUrl(path, 3600))
      return data.signedUrl as string
    },
    async removeFile(bucket, path) {
      check(await sb.storage.from(bucket).remove([path]))
    },
  }
}
