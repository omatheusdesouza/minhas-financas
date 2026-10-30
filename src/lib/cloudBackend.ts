import type { Backend, User } from './backend'
import { FirstSyncOfflineError, SchemaOutdatedError } from './backend'
import { createLocalData, type DataApi } from './localData'
import { createSupabase, supabaseAuthAndFiles, supabaseRemote } from './supabaseBackend'
import { SyncEngine, type SyncStatus } from './sync'
import { openLocalDb, Tables, type LocalDb } from './tables'

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

  async function open(user: User): Promise<Session> {
    const db = await openLocalDb(`fynvault-${user.id}`)
    const tables = new Tables(db.persistence)
    await tables.load()
    const engine = new SyncEngine(tables, db, remote, () => changeListeners.forEach((cb) => cb()))
    const data = createLocalData(tables, {
      changed: async (t, rows) => { await engine.enqueue(t, 'upsert', rows); schedule() },
      removed: async (t, ids) => { await engine.enqueue(t, 'delete', ids); schedule() },
    }, () => user.id)
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
    return (await current()).engine.sync()
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
      session = null
      sessionUser = null
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
      if (!(await s.engine.hasInitialSync())) {
        const ok = await s.engine.sync()
        if (!ok && !(await s.engine.hasInitialSync())) throw new FirstSyncOfflineError()
      } else {
        void s.engine.sync()
      }
    },
    sync: syncNow,
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
