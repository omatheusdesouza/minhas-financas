import { openDB, type IDBPDatabase } from 'idb'

/**
 * Cópia local dos dados: todas as tabelas ficam em memória (são poucos dados) e cada
 * gravação é persistida no aparelho antes de continuar. As telas leem só daqui, por isso
 * o app funciona sem internet.
 */

export const TABLES = [
  'categories', 'payment_methods', 'savings_goals', 'installment_plans', 'recurring_bills',
  'transactions', 'goal_contributions', 'profiles',
] as const
export type TableName = (typeof TABLES)[number]

/** Chave de cada linha (o perfil usa o id do usuário). */
export const keyOf = (t: TableName, row: any): string => (t === 'profiles' ? row.user_id : row.id)

export interface Persistence {
  loadAll(): Promise<Partial<Record<TableName, any[]>>>
  put(t: TableName, rows: any[]): Promise<void>
  del(t: TableName, ids: string[]): Promise<void>
  clear(): Promise<void>
}

export class Tables {
  private data = new Map<TableName, Map<string, any>>()
  constructor(private p: Persistence) {
    for (const t of TABLES) this.data.set(t, new Map())
  }

  async load() {
    const all = await this.p.loadAll()
    for (const t of TABLES) this.data.set(t, new Map((all[t] ?? []).map((r) => [keyOf(t, r), r])))
  }

  all<T = any>(t: TableName): T[] {
    return [...this.data.get(t)!.values()]
  }

  get<T = any>(t: TableName, id: string): T | undefined {
    return this.data.get(t)!.get(id)
  }

  has(t: TableName, id: string) {
    return this.data.get(t)!.has(id)
  }

  async put(t: TableName, rows: any[]) {
    if (!rows.length) return
    const m = this.data.get(t)!
    for (const r of rows) m.set(keyOf(t, r), r)
    await this.p.put(t, rows)
  }

  async del(t: TableName, ids: string[]) {
    if (!ids.length) return
    const m = this.data.get(t)!
    for (const id of ids) m.delete(id)
    await this.p.del(t, ids)
  }

  async clear() {
    for (const t of TABLES) this.data.get(t)!.clear()
    await this.p.clear()
  }

  isEmpty() {
    return TABLES.every((t) => this.data.get(t)!.size === 0)
  }
}

/** Memória pura (testes). */
export function memoryPersistence(): Persistence {
  return { async loadAll() { return {} }, async put() {}, async del() {}, async clear() {} }
}

/**
 * localStorage (modo demonstração). Mantém o formato antigo: uma lista por tabela
 * em "mf-demo:<tabela>" e o perfil em "mf-demo:profile".
 */
export function localStoragePersistence(prefix: string): Persistence {
  const key = (t: TableName) => prefix + (t === 'profiles' ? 'profile' : t)
  const read = (t: TableName): any[] => {
    try {
      const v = JSON.parse(localStorage.getItem(key(t)) ?? (t === 'profiles' ? 'null' : '[]'))
      return t === 'profiles' ? (v ? [v] : []) : v
    } catch {
      return []
    }
  }
  const write = (t: TableName, rows: any[]) =>
    localStorage.setItem(key(t), JSON.stringify(t === 'profiles' ? rows[0] ?? null : rows))
  return {
    async loadAll() {
      return Object.fromEntries(TABLES.map((t) => [t, read(t)]))
    },
    async put(t, rows) {
      const m = new Map(read(t).map((r) => [keyOf(t, r), r]))
      for (const r of rows) m.set(keyOf(t, r), r)
      write(t, [...m.values()])
    },
    async del(t, ids) {
      const gone = new Set(ids)
      write(t, read(t).filter((r) => !gone.has(keyOf(t, r))))
    },
    async clear() {
      for (const t of TABLES) localStorage.removeItem(key(t))
    },
  }
}

/** Banco do aparelho para o modo nuvem: tabelas + fila de envio + controle da sincronização. */
export interface LocalDb {
  persistence: Persistence
  outbox: {
    all(): Promise<OutboxOp[]>
    add(op: Omit<OutboxOp, 'seq'>): Promise<void>
    remove(seqs: number[]): Promise<void>
    count(): Promise<number>
  }
  meta: {
    get<T>(k: string): Promise<T | undefined>
    set(k: string, v: unknown): Promise<void>
  }
  destroy(): Promise<void>
}

export interface OutboxOp {
  seq: number
  table: TableName
  kind: 'upsert' | 'delete'
  id: string
  row?: any
  /** horário da alteração no aparelho */
  at: string
}

export async function openLocalDb(name: string): Promise<LocalDb> {
  const db: IDBPDatabase = await openDB(name, 1, {
    upgrade(d) {
      for (const t of TABLES) d.createObjectStore(t)
      d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
      d.createObjectStore('meta')
    },
  })
  return {
    persistence: {
      async loadAll() {
        const out: Partial<Record<TableName, any[]>> = {}
        for (const t of TABLES) out[t] = await db.getAll(t)
        return out
      },
      async put(t, rows) {
        const tx = db.transaction(t, 'readwrite')
        await Promise.all([...rows.map((r) => tx.store.put(r, keyOf(t, r))), tx.done])
      },
      async del(t, ids) {
        const tx = db.transaction(t, 'readwrite')
        await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
      },
      async clear() {
        const tx = db.transaction([...TABLES], 'readwrite')
        await Promise.all([...TABLES.map((t) => tx.objectStore(t).clear()), tx.done])
      },
    },
    outbox: {
      all: () => db.getAll('outbox'),
      async add(op) {
        await db.add('outbox', op)
      },
      async remove(seqs) {
        const tx = db.transaction('outbox', 'readwrite')
        await Promise.all([...seqs.map((s) => tx.store.delete(s)), tx.done])
      },
      count: () => db.count('outbox'),
    },
    meta: {
      get: (k) => db.get('meta', k),
      async set(k, v) {
        await db.put('meta', v, k)
      },
    },
    async destroy() {
      db.close()
      await new Promise<void>((ok) => {
        const r = indexedDB.deleteDatabase(name)
        r.onsuccess = r.onerror = r.onblocked = () => ok()
      })
    },
  }
}
