import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Backend, User } from './backend'
import { RemoteError, type Remote } from './sync'
import type { TableName } from './tables'

/**
 * Supabase: login, arquivos (fotos e comprovantes) e o envio/busca usados pela sincronização.
 * Os dados em si são lidos e gravados na cópia local (ver cloudBackend.ts).
 */

const num = (v: unknown) => (v == null ? null : Number(v))

/** Colunas numeric chegam como texto em alguns casos: normaliza para número. */
const NUMERIC: Partial<Record<TableName, string[]>> = {
  transactions: ['amount'],
  recurring_bills: ['amount'],
  installment_plans: ['total_amount'],
  categories: ['monthly_budget'],
  savings_goals: ['target_amount', 'monthly_contribution'],
  goal_contributions: ['amount'],
}
/** Colunas de data (sem hora): sempre "AAAA-MM-DD". */
const DATES = ['date', 'paid_at', 'first_due', 'start_month', 'end_month', 'generated_until', 'recurring_month', 'target_date']
function normalize(t: TableName, r: any) {
  const out = { ...r }
  for (const c of NUMERIC[t] ?? []) out[c] = num(r[c])
  for (const c of DATES) if (typeof out[c] === 'string' && out[c].length > 10) out[c] = out[c].slice(0, 10)
  return out
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
}

/** Mensagens de erro do Supabase traduzidas para o usuário. */
export function translate(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
  if (m.includes('user already registered')) return 'Já existe uma conta com este e-mail.'
  if (m.includes('password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (m.includes('token has expired') || m.includes('otp')) return 'Código inválido ou expirado. Peça um novo.'
  if (m.includes('payload too large') || m.includes('exceeded the maximum allowed size')) return 'Arquivo grande demais.'
  if (m.includes('mime type') || m.includes('invalid_mime')) return 'Tipo de arquivo não permitido. Use foto (JPG/PNG) ou PDF.'
  if (m.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  if (isNetworkMessage(m)) return 'Sem conexão com a internet.'
  return message
}

const isNetworkMessage = (m: string) =>
  /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout/i.test(m)

function check(res: { data: any; error: { message: string } | null }): any {
  if (res.error) throw new Error(translate(res.error.message))
  return res.data
}

/** Classifica um erro do Supabase para a sincronização decidir: tentar de novo ou descartar. */
export function classify(res: { error: any; status?: number }): RemoteError {
  const e = res.error ?? {}
  const msg = String(e.message ?? e)
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  if (offline || isNetworkMessage(msg) || !res.status || res.status >= 500 || res.status === 401 || res.status === 408 || res.status === 429) {
    return new RemoteError(msg, 'network') // tenta de novo depois
  }
  if (e.code === '23505') return new RemoteError(msg, 'duplicate')
  return new RemoteError(translate(msg), 'permanent')
}

function toUser(u: { id: string; email?: string; user_metadata?: Record<string, any> } | null | undefined): User | null {
  return u ? {
    id: u.id, email: u.email ?? '',
    termsVersion: u.user_metadata?.terms_version ?? null, termsAcceptedAt: u.user_metadata?.terms_accepted_at ?? null,
  } : null
}

/** Remove campos que o banco preenche sozinho antes de gravar. */
function forUpload(o: any) {
  const c = { ...o }
  // user_id vai junto (no modo família o dono do espaço pode ser outra pessoa); sem ele, o banco usa o usuário logado
  if (!c.user_id) delete c.user_id
  delete c.created_at
  delete c.updated_at
  return c
}

export function createSupabase(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
}

export type AuthAndFiles = Pick<Backend,
  | 'getUser' | 'onAuthChange' | 'signIn' | 'signUp' | 'resetPassword' | 'verifyRecovery' | 'updatePassword' | 'signOut'
  | 'acceptTerms' | 'deleteAccount'
  | 'uploadFile' | 'fileUrl' | 'removeFile'>

export function supabaseAuthAndFiles(sb: SupabaseClient): AuthAndFiles {
  const needOnline = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('Sem internet. Anexe o arquivo quando a conexão voltar.')
    }
  }
  return {
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
    async signUp(email, password, termsVersion) {
      const data = check(await sb.auth.signUp({
        email, password,
        options: { data: { terms_version: termsVersion, terms_accepted_at: new Date().toISOString() } },
      }))
      return { needsConfirmation: !data.session }
    },
    async acceptTerms(version) {
      check(await sb.auth.updateUser({ data: { terms_version: version, terms_accepted_at: new Date().toISOString() } }))
    },
    async deleteAccount() {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('Conecte-se à internet para excluir a conta.')
      }
      const { data } = await sb.auth.getSession()
      const uid = data.session?.user.id
      if (!uid) throw new Error('Faça login novamente.')
      // 1) confere se o banco tem a função (migration 0005) antes de apagar qualquer coisa
      const probe = await sb.rpc('delete_my_account', { confirm: false })
      if (probe.error) {
        if (probe.error.code === 'PGRST202' || /delete_my_account|schema cache/i.test(probe.error.message ?? '')) {
          throw new Error('Para excluir contas, o banco de dados precisa da atualização 0005. Avise o responsável pelo app.')
        }
        throw new Error(probe.error.message)
      }
      // 2) arquivos (foto e comprovantes): a API de Storage é o único jeito de apagá-los
      for (const bucket of ['avatars', 'receipts'] as const) {
        for (;;) {
          const files = check(await sb.storage.from(bucket).list(uid, { limit: 100 })) as { name: string }[]
          if (!files.length) break
          check(await sb.storage.from(bucket).remove(files.map((f) => `${uid}/${f.name}`)))
          if (files.length < 100) break
        }
      }
      // 3) a conta e, em cascata, todos os dados do banco
      check(await sb.rpc('delete_my_account', { confirm: true }))
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

    async uploadFile(bucket, name, file) {
      needOnline()
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

/** Envio e busca para a sincronização. */
export function supabaseRemote(sb: SupabaseClient): Remote {
  const PAGE = 1000
  const run = async <T,>(p: PromiseLike<{ data: T; error: any; status: number }>): Promise<T> => {
    let res: { data: T; error: any; status: number }
    try {
      res = await p
    } catch (e) {
      throw new RemoteError(String(e), 'network')
    }
    if (res.error) throw classify(res)
    return res.data
  }
  return {
    async upsert(t, rows) {
      await run(sb.from(t).upsert(rows.map(forUpload), { onConflict: t === 'profiles' ? 'user_id' : 'id' }))
    },
    async remove(t, ids) {
      await run(sb.from(t).delete().in(t === 'profiles' ? 'user_id' : 'id', ids))
    },
    async changedSince(t, since) {
      const out: any[] = []
      for (let from = 0; ; from += PAGE) {
        let q = sb.from(t).select('*').order('updated_at').range(from, from + PAGE - 1)
        if (since) q = q.gt('updated_at', since)
        const page = (await run(q)) as any[]
        out.push(...page.map((r) => normalize(t, r)))
        if (page.length < PAGE) return out
      }
    },
    async deletedSince(since) {
      return (await run(sb.from('deleted_rows').select('table_name,row_id,deleted_at').gt('deleted_at', since).order('deleted_at').limit(5000))) as any[]
    },
    async fetchRow(t, id) {
      const r = await run(sb.from(t).select('*').eq(t === 'profiles' ? 'user_id' : 'id', id).maybeSingle())
      return r ? normalize(t, r) : null
    },
    async rowsOf(t, ownerId) {
      const out: any[] = []
      for (let from = 0; ; from += PAGE) {
        const page = (await run(sb.from(t).select('*').eq('user_id', ownerId).order('updated_at').range(from, from + PAGE - 1))) as any[]
        out.push(...page.map((r) => normalize(t, r)))
        if (page.length < PAGE) return out
      }
    },
    async findRecurring(billId, month) {
      const r = await run(sb.from('transactions').select('*').eq('recurring_bill_id', billId).eq('recurring_month', month).maybeSingle())
      return r ? normalize('transactions', r) : null
    },
  }
}
