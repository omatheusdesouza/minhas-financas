import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './lib/api'
import type { User } from './lib/backend'
import { CategoryIndex, generateRecurring, seedIfEmpty } from './lib/services'
import type { Category, PaymentMethod, Transaction } from './lib/types'

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
}

const Ctx = createContext<AppState | null>(null)

/** Preparação da conta (categorias iniciais + contas fixas do mês), uma vez por usuário. */
const prepared = new Map<string, Promise<void>>()
function prepare(userId: string) {
  if (!prepared.has(userId)) {
    const p = (async () => {
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

export function AppProvider({ user, children }: { user: User; children: ReactNode }) {
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
        await prepare(user.id)
        await reloadMeta()
      } catch (e: any) {
        toast(e?.message ?? String(e), 'error')
      } finally {
        setReady(true)
      }
    })()
  }, [user.id, reloadMeta, toast])

  const idx = useMemo(() => new CategoryIndex(categories), [categories])

  const value: AppState = {
    user, categories, idx, paymentMethods, version, bump, reloadMeta, toast, run,
    editor,
    openEditor: (tx, mode) => setEditor({ tx, mode }),
    closeEditor: () => setEditor(null),
  }

  return (
    <Ctx.Provider value={value}>
      {ready ? children : <div className="splash"><div className="spinner" /></div>}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
