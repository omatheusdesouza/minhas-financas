import type { Backend, FamilyApi, User } from './backend'
import { FirstSyncOfflineError, SchemaOutdatedError } from './backend'
import { createLocalData, type DataApi } from './localData'
import { createSupabase, supabaseAuthAndFiles, supabaseRemote } from './supabaseBackend'
import { SyncEngine, type SyncStatus } from './sync'
import { openLocalDb, Tables, type LocalDb } from './tables'
import type { FamilyInvite, FamilyRole, Profile, Space } from './types'

/**
 * Modo nuvem com funcionamento offline: os dados ficam numa cópia no aparelho (IndexedDB),
 * cada alteração entra numa fila e é enviada ao Supabase quando houver internet.
 */
interface Session {
  userId: string
  db: LocalDb
  tables: Tables
  engine: SyncEngine
  data: DataApi
}

const SYNC_DEBOUNCE = 1200
const SYNC_INTERVAL = 60_000

export function createCloudBackend(url: string, key: string): Backend {
  const sb = createSupabase(url, key)
  const auth = supabaseAuthAndFiles(sb)
  const remote = supabaseRemote(sb)
  const statusListeners = new Set<(s: SyncStatus) => void>()
  const changeListeners = new Set<() => void>()
  let session: Promise<Session> | null = null
  let sessionUser: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let unsubStatus: (() => void) | null = null
  // Modo família: espaço sendo visto (começa sempre no próprio) e espaços compartilhados conhecidos
  let space: string | null = null
  let familyOk = false
  let shared: Space[] = []

  async function open(user: User): Promise<Session> {
    const db = await openLocalDb(`fynvault-${user.id}`)
    const tables = new Tables(db.persistence)
    await tables.load()
    const engine = new SyncEngine(tables, db, remote, () => changeListeners.forEach((cb) => cb()))
    const data = createLocalData(tables, {
      changed: async (t, rows) => { await engine.enqueue(t, 'upsert', rows); schedule() },
      removed: async (t, ids) => { await engine.enqueue(t, 'delete', ids); schedule() },
    }, () => user.id, () => space ?? user.id)
    space = user.id
    shared = loadShared(user.id)
    unsubStatus?.()
    unsubStatus = engine.onStatus((s) => statusListeners.forEach((cb) => cb(s)))
    await engine.refreshPending()
    return { userId: user.id, db, tables, engine, data }
  }

  async function current(): Promise<Session> {
    const user = await auth.getUser()
    if (!user) throw new Error('Faça login novamente.')
    if (!session || sessionUser !== user.id) {
      sessionUser = user.id
      session = open(user)
      session.catch(() => { session = null })
    }
    return session
  }

  function schedule() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { void syncNow() }, SYNC_DEBOUNCE)
  }

  async function syncNow() {
    if (!(await auth.getUser())) return false
    const ok = await (await current()).engine.sync()
    if (ok && familyOk) await refreshFamily().catch(() => {})
    return ok
  }

  // ---------------- Modo família ----------------
  const sharedKey = (uid: string) => `fv-shared-${uid}`
  function loadShared(uid: string): Space[] {
    try { return JSON.parse(localStorage.getItem(sharedKey(uid)) ?? '[]') } catch { return [] }
  }
  function saveShared(uid: string, list: Space[]) {
    try { localStorage.setItem(sharedKey(uid), JSON.stringify(list)) } catch { /* sem armazenamento */ }
  }
  const must = <T,>(res: { data: T; error: any }): T => {
    if (res.error) throw new Error(res.error.message)
    return res.data
  }
  async function profilesOf(ids: string[]): Promise<Map<string, Pick<Profile, 'display_name' | 'avatar_emoji'>>> {
    if (!ids.length) return new Map()
    const rows = must(await sb.from('profiles').select('user_id,display_name,avatar_emoji').in('user_id', ids)) as any[]
    return new Map(rows.map((r) => [r.user_id, r]))
  }

  /** Quem compartilha comigo: baixa espaços novos e apaga do aparelho os que deixaram de ser compartilhados. */
  async function refreshFamily(): Promise<Space[]> {
    const s = await current()
    const rows = must(await sb.from('family_members').select('owner_id,role').eq('member_id', s.userId)) as any[]
    const names = await profilesOf(rows.map((r) => r.owner_id))
    const next: Space[] = rows.map((r) => ({
      ownerId: r.owner_id, role: r.role, name: names.get(r.owner_id)?.display_name ?? 'Família',
      avatarEmoji: names.get(r.owner_id)?.avatar_emoji ?? null,
    }))
    const before = new Set(shared.map((x) => x.ownerId))
    const after = new Set(next.map((x) => x.ownerId))
    for (const o of after) if (!before.has(o)) await s.engine.importOwner(o)
    for (const o of before) if (!after.has(o)) await s.engine.purgeOwner(o)
    shared = next
    saveShared(s.userId, next)
    if (space && space !== s.userId && !after.has(space)) space = s.userId
    return familyApi.spaces()
  }

  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem O, I, 0 e 1 (fáceis de confundir)
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
  const online = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Sem internet. O modo família precisa de conexão.')
  }

  const familyApi: FamilyApi = {
    available: () => familyOk,
    spaces() {
      const me: Space = { ownerId: sessionUser ?? '', name: 'Minhas finanças', avatarEmoji: null, role: null }
      return [me, ...shared]
    },
    current: () => space ?? sessionUser ?? '',
    setCurrent(ownerId) {
      if (ownerId === sessionUser || shared.some((x) => x.ownerId === ownerId)) space = ownerId
    },
    refresh: refreshFamily,
    async members() {
      online()
      const s = await current()
      const rows = must(await sb.from('family_members').select('member_id,role').eq('owner_id', s.userId)) as any[]
      const names = await profilesOf(rows.map((r) => r.member_id))
      const invites = must(await sb.from('family_invites').select('code,role,expires_at,used_by')
        .is('used_by', null).gt('expires_at', new Date().toISOString())) as any[]
      return {
        members: rows.map((r) => ({
          memberId: r.member_id, role: r.role, name: names.get(r.member_id)?.display_name ?? 'Convidado',
          avatarEmoji: names.get(r.member_id)?.avatar_emoji ?? null,
        })),
        invites: invites.map((i): FamilyInvite => ({ code: i.code, role: i.role, expiresAt: i.expires_at })),
      }
    },
    async invite(role: FamilyRole) {
      online()
      for (let i = 0; i < 5; i++) {
        const code = newCode()
        const { data, error } = await sb.from('family_invites').insert({ code, role }).select('code,role,expires_at').single()
        if (!error) return { code: data.code, role: data.role, expiresAt: data.expires_at }
        if (error.code !== '23505') throw new Error(error.message)
      }
      throw new Error('Não foi possível gerar o convite. Tente de novo.')
    },
    async cancelInvite(code) {
      online()
      must(await sb.from('family_invites').delete().eq('code', code))
    },
    async accept(code) {
      online()
      const { error } = await sb.rpc('accept_family_invite', { p_code: code.trim().toUpperCase() })
      if (error) throw new Error(error.message.replace(/^.*?:\s*/, ''))
      const list = await refreshFamily()
      return list[list.length - 1]
    },
    async setRole(memberId, role) {
      online()
      must(await sb.from('family_members').update({ role }).eq('member_id', memberId).eq('owner_id', sessionUser!))
    },
    async remove(memberId) {
      online()
      must(await sb.from('family_members').delete().eq('member_id', memberId).eq('owner_id', sessionUser!))
    },
    async leave(ownerId) {
      online()
      must(await sb.from('family_members').delete().eq('owner_id', ownerId).eq('member_id', sessionUser!))
      await refreshFamily()
    },
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { void syncNow() })
    setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow()
    }, SYNC_INTERVAL)
  }

  // Cada operação de dados espera a cópia local do usuário estar aberta
  const data = new Proxy({} as DataApi, {
    get: (_, name: string) => async (...args: unknown[]) => {
      const s = await current()
      return (s.data as any)[name](...args)
    },
  })

  return {
    mode: 'cloud',
    ...auth,
    ...pickData(data),

    async signOut() {
      // apaga a cópia local deste aparelho (privacidade) antes de sair
      if (session) {
        const s = await session.catch(() => null)
        unsubStatus?.()
        await s?.db.destroy().catch(() => {})
      }
      if (sessionUser) saveShared(sessionUser, [])
      session = null
      sessionUser = null
      space = null
      shared = []
      await auth.signOut()
    },

    async prepare() {
      // Segurança: esta versão precisa da migration 0003 (sincronização). Sem ela, não sincroniza.
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        const { error, status } = await sb.from('deleted_rows').select('row_id').limit(1)
        const missing = error && (error.code === '42P01' || error.code === 'PGRST205' || status === 404
          || /deleted_rows|does not exist|schema cache/i.test(error.message ?? ''))
        if (missing) throw new SchemaOutdatedError('0003')
      }
      const s = await current()
      space = s.userId
      // Modo família só com a migration 0004 (sem ela, o resto do app funciona normalmente)
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        const fam = await sb.from('family_members').select('owner_id').limit(1)
        familyOk = !fam.error
      } else {
        familyOk = shared.length > 0
      }
      if (!(await s.engine.hasInitialSync())) {
        const ok = await s.engine.sync()
        if (!ok && !(await s.engine.hasInitialSync())) throw new FirstSyncOfflineError()
      } else {
        void syncNow()
      }
      if (familyOk) await refreshFamily().catch(() => {})
    },
    sync: syncNow,
    family: familyApi,
    onSyncStatus(cb) {
      statusListeners.add(cb)
      if (session) session.then((s) => cb(s.engine.status)).catch(() => {})
      return () => statusListeners.delete(cb)
    },
    onRemoteChange(cb) {
      changeListeners.add(cb)
      return () => changeListeners.delete(cb)
    },
  }
}

/** Repassa todas as operações de dados para a cópia local. */
function pickData(d: DataApi): DataApi {
  const names: (keyof DataApi)[] = [
    'listCategories', 'saveCategory', 'deleteCategory', 'listPaymentMethods', 'savePaymentMethod', 'deletePaymentMethod',
    'listTransactions', 'listUnpaid', 'listPlanTransactions', 'saveTransaction', 'updateTransactions', 'deleteTransaction',
    'insertRecurringTransactions', 'listPlans', 'createPlan', 'updatePlan', 'deletePlan', 'listRecurring', 'saveRecurring',
    'deleteRecurring', 'getProfile', 'saveProfile', 'listGoals', 'saveGoal', 'deleteGoal', 'listContributions',
    'saveContribution', 'deleteContribution',
  ]
  return Object.fromEntries(names.map((n) => [n, (d as any)[n]])) as DataApi
}
