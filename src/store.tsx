import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './lib/api'
import { FirstSyncOfflineError, SchemaOutdatedError, type User } from './lib/backend'
import { CategoryIndex, generateRecurring, seedIfEmpty } from './lib/services'
import type { SyncStatus } from './lib/sync'
import type { Category, PaymentMethod, Profile, Space, Transaction } from './lib/types'

interface Toast {
  id: number
  text: string
  kind: 'ok' | 'error'
}

export type EditorMode = 'single' | 'installments' | 'recurring'

interface TxEditor {
  tx?: Partial<Transaction>
  mode?: EditorMode
}

interface AppState {
  user: User
  /** modo família: espaços disponíveis (o próprio primeiro) e o que está aberto */
  spaces: Space[]
  space: Space
  setSpace: (ownerId: string) => void
  reloadSpaces: () => Promise<void>
  /** pode alterar dados no espaço aberto? (falso para quem só visualiza) */
  canEdit: boolean
  /** estado da sincronização (null no modo demonstração) */
  sync: SyncStatus | null
  profile: Profile | null
  /** Link temporário da foto de perfil (bucket privado) */
  avatarUrl: string | null
  reloadProfile: () => Promise<void>
  categories: Category[]
  idx: CategoryIndex
  paymentMethods: PaymentMethod[]
  /** Muda sempre que algum dado é alterado; telas usam como dependência para recarregar. */
  version: number
  bump: () => void
  reloadMeta: () => Promise<void>
  toast: (text: string, kind?: Toast['kind']) => void
  run: <T>(fn: () => Promise<T>, ok?: string) => Promise<T | undefined>
  editor: TxEditor | null
  openEditor: (tx?: Partial<Transaction>, mode?: EditorMode) => void
  closeEditor: () => void
  /** Painel "Marcar como paga" / "Informar valor" */
  payTarget: Transaction | null
  openPay: (t: Transaction) => void
  closePay: () => void
}

const Ctx = createContext<AppState | null>(null)

/** Preparação da conta (categorias iniciais + contas fixas do mês), uma vez por usuário. */
const prepared = new Map<string, Promise<void>>()
function prepare(userId: string) {
  if (!prepared.has(userId)) {
    const p = (async () => {
      // modo nuvem: abre a cópia local e, no 1º acesso do aparelho, baixa os dados
      await api.prepare?.()
      await seedIfEmpty()
      await generateRecurring(await api.listRecurring())
    })()
    p.catch(() => prepared.delete(userId))
    prepared.set(userId, p)
  }
  return prepared.get(userId)!
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp fora do AppProvider')
  return v
}

/** Carrega dados que dependem da versão e trata erros. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; loading: boolean } {
  const { version, toast } = useApp()
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    setLoading(true)
    fn()
      .then((d) => alive && setData(d))
      .catch((e) => alive && toast(e.message ?? String(e), 'error'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps])
  return { data, loading }
}

export function AppProvider({ user, children, onboarding }: {
  user: User
  children: ReactNode
  /** Tela mostrada enquanto o onboarding obrigatório não foi concluído */
  onboarding: ReactNode
}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [payTarget, setPayTarget] = useState<Transaction | null>(null)
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const ownSpace: Space = { ownerId: user.id, name: 'Minhas finanças', avatarEmoji: null, role: null }
  const [spaces, setSpaces] = useState<Space[]>([ownSpace])
  const [spaceId, setSpaceId] = useState(user.id)
  const [firstSyncOffline, setFirstSyncOffline] = useState(false)
  const [schemaOutdated, setSchemaOutdated] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [ready, setReady] = useState(false)
  const [version, setVersion] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [editor, setEditor] = useState<TxEditor | null>(null)

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts([{ id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 5000 : 2500)
  }, [])

  const reloadMeta = useCallback(async () => {
    const [c, p] = await Promise.all([api.listCategories(), api.listPaymentMethods()])
    setCategories(c)
    setPaymentMethods(p)
  }, [])

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  const reloadProfile = useCallback(async () => {
    const p = await api.getProfile()
    setProfile(p)
    setAvatarUrl(p?.avatar_path ? await api.fileUrl('avatars', p.avatar_path).catch(() => null) : null)
  }, [])

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string) => {
      try {
        const r = await fn()
        if (ok) toast(ok)
        bump()
        return r
      } catch (e: any) {
        toast(e?.message ?? String(e), 'error')
        return undefined
      }
    },
    [toast, bump],
  )

  useEffect(() => {
    ;(async () => {
      try {
        setFirstSyncOffline(false)
        setSchemaOutdated(null)
        await prepare(user.id)
        await Promise.all([reloadMeta(), reloadProfile()])
        if (api.family?.available()) setSpaces(api.family.spaces())
        setReady(true)
      } catch (e: any) {
        if (e instanceof FirstSyncOfflineError) return setFirstSyncOffline(true)
        if (e instanceof SchemaOutdatedError) return setSchemaOutdated(e.migration)
        toast(e?.message ?? String(e), 'error')
        setReady(true)
      }
    })()
  }, [user.id, reloadMeta, reloadProfile, toast, attempt])

  // Sincronização: status e dados que chegam de outro aparelho
  useEffect(() => {
    const offStatus = api.onSyncStatus?.(setSync)
    const offChange = api.onRemoteChange?.(() => {
      if (api.family?.available()) {
        const list = api.family.spaces()
        setSpaces(list)
        setSpaceId(api.family.current())
      }
      reloadMeta().catch(() => {})
      reloadProfile().catch(() => {})
      bump()
    })
    return () => { offStatus?.(); offChange?.() }
  }, [reloadMeta, reloadProfile, bump])

  // Avisa uma vez quando a nuvem recusar alguma alteração
  const failedCount = sync?.failed.length ?? 0
  useEffect(() => {
    if (failedCount) toast(`${failedCount} alteração(ões) não puderam ser salvas na nuvem e foram desfeitas.`, 'error')
  }, [failedCount, toast])

  const idx = useMemo(() => new CategoryIndex(categories), [categories])

  const space = spaces.find((x) => x.ownerId === spaceId) ?? spaces[0]
  const value: AppState = {
    user, sync, profile, spaces, space,
    canEdit: space.role !== 'viewer',
    setSpace(ownerId) {
      api.family?.setCurrent(ownerId)
      setSpaceId(api.family?.current() ?? user.id)
      reloadMeta().catch(() => {})
      bump()
    },
    async reloadSpaces() {
      if (!api.family?.available()) return
      const list = await api.family.refresh()
      setSpaces(list)
      setSpaceId(api.family.current())
      await reloadMeta()
      bump()
    }, avatarUrl, reloadProfile, categories, idx, paymentMethods, version, bump, reloadMeta, toast, run,
    editor,
    openEditor: (tx, mode) => setEditor({ tx, mode }),
    closeEditor: () => setEditor(null),
    payTarget,
    openPay: (t) => setPayTarget(t),
    closePay: () => setPayTarget(null),
  }
  const onboarded = Boolean(profile?.onboarding_completed_at)

  return (
    <Ctx.Provider value={value}>
      {schemaOutdated ? (
        <div className="splash first-sync">
          <img src="./brand/icon.svg" alt="" width={72} height={72} />
          <h2>Atualização do banco de dados</h2>
          <p className="muted">
            Esta versão do Fynvault precisa que o banco de dados no Supabase seja atualizado. Aplique o arquivo
            <b> supabase/migrations/{schemaOutdated}_*.sql</b> no SQL Editor do Supabase e toque em "Tentar de novo".
            Seus dados estão seguros: nada foi alterado.
          </p>
          <button className="btn primary" onClick={() => { prepared.delete(user.id); setAttempt((a) => a + 1) }}>Tentar de novo</button>
        </div>
      ) : firstSyncOffline ? (
        <div className="splash first-sync">
          <img src="./brand/icon.svg" alt="" width={72} height={72} />
          <h2>Sem internet</h2>
          <p className="muted">Conecte-se à internet para baixar seus dados neste aparelho pela primeira vez. Depois disso, o Fynvault funciona mesmo offline.</p>
          <button className="btn primary" onClick={() => { prepared.delete(user.id); setAttempt((a) => a + 1) }}>Tentar de novo</button>
        </div>
      ) : !ready ? <div className="splash"><div className="spinner" /></div> : onboarded ? children : onboarding}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
