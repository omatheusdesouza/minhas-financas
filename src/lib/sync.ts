import { keyOf, TABLES, type LocalDb, type OutboxOp, type TableName, type Tables } from './tables'

/**
 * Sincronização com a nuvem:
 *  1. ENVIO: a fila de alterações vai em ordem. Cada linha tem id criado no aparelho, então
 *     reenviar só atualiza (não duplica). Sem internet, a fila espera e nada se perde.
 *  2. BUSCA: traz o que mudou na nuvem desde a última vez (com margem de segurança) e as exclusões.
 *     Linhas com alteração local ainda não enviada não são sobrescritas.
 * Conflito entre aparelhos: vale a edição mais recente (o banco ignora edições mais antigas).
 */

export type ErrorKind = 'network' | 'duplicate' | 'permanent'

export class RemoteError extends Error {
  constructor(message: string, public kind: ErrorKind) {
    super(message)
  }
}

export interface Remote {
  upsert(t: TableName, rows: any[]): Promise<void>
  remove(t: TableName, ids: string[]): Promise<void>
  /** linhas com updated_at > since (todas, se since = null) */
  changedSince(t: TableName, since: string | null): Promise<any[]>
  deletedSince(since: string): Promise<{ table_name: string; row_id: string; deleted_at: string }[]>
  fetchRow(t: TableName, id: string): Promise<any | null>
  /** lançamento de uma conta fixa num mês (para juntar duplicatas) */
  findRecurring(billId: string, month: string): Promise<any | null>
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncStatus {
  state: SyncState
  pending: number
  lastSync: string | null
  /** alterações recusadas pela nuvem (descartadas; a versão da nuvem foi restaurada) */
  failed: { table: TableName; id: string; message: string }[]
}

/** Margem ao buscar mudanças: cobre gravações que terminaram fora de ordem na nuvem. */
export const OVERLAP_MS = 5 * 60 * 1000

export class SyncEngine {
  private running: Promise<boolean> | null = null
  /** sincronização pedida enquanto outra rodava: roda logo depois, uma vez só */
  private queued: Promise<boolean> | null = null
  status: SyncStatus = { state: 'idle', pending: 0, lastSync: null, failed: [] }
  private listeners = new Set<(s: SyncStatus) => void>()

  constructor(
    private tables: Tables,
    private db: Pick<LocalDb, 'outbox' | 'meta'>,
    private remote: Remote,
    /** chamado quando dados chegaram da nuvem (telas devem recarregar) */
    private onRemoteChange: (tables: Set<TableName>) => void = () => {},
  ) {}

  onStatus(cb: (s: SyncStatus) => void) {
    this.listeners.add(cb)
    cb(this.status)
    return () => this.listeners.delete(cb)
  }

  private setStatus(p: Partial<SyncStatus>) {
    this.status = { ...this.status, ...p }
    this.listeners.forEach((cb) => cb(this.status))
  }

  async refreshPending() {
    this.setStatus({ pending: await this.db.outbox.count() })
  }

  /** Coloca uma alteração na fila (já aplicada na cópia local). */
  async enqueue(table: TableName, kind: 'upsert' | 'delete', rowsOrIds: any[]) {
    const at = new Date().toISOString()
    for (const r of rowsOrIds) {
      if (kind === 'upsert') await this.db.outbox.add({ table, kind, id: keyOf(table, r), row: r, at })
      else await this.db.outbox.add({ table, kind, id: r as string, at })
    }
    await this.refreshPending()
  }

  /** Já baixou os dados pelo menos uma vez neste aparelho? */
  async hasInitialSync() {
    return Boolean(await this.db.meta.get<string>('cursor'))
  }

  /** Envia a fila e busca as novidades. Devolve true se terminou sem falta de internet. */
  /**
   * Envia a fila e busca as novidades. Se já houver uma sincronização em andamento, a nova
   * roda logo depois dela (assim quem pediu só recebe a resposta depois de buscar tudo).
   * Devolve true se terminou sem falta de internet.
   */
  sync(): Promise<boolean> {
    if (this.running) {
      if (!this.queued) {
        this.queued = this.running.then(() => {
          this.queued = null
          return this.sync()
        })
      }
      return this.queued
    }
    this.running = this.runOnce().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async runOnce(): Promise<boolean> {
    this.setStatus({ state: 'syncing' })
    try {
      await this.push()
      await this.pull()
      this.setStatus({ state: 'idle', lastSync: new Date().toISOString() })
      return true
    } catch (e) {
      const offline = e instanceof RemoteError && e.kind === 'network'
      this.setStatus({ state: offline ? 'offline' : 'error' })
      if (!offline) console.warn('sincronização:', e)
      return false
    } finally {
      await this.refreshPending()
    }
  }

  private async push() {
    for (;;) {
      const ops = await this.db.outbox.all()
      if (!ops.length) return
      // várias alterações seguidas da mesma linha: basta enviar a última
      const same = takeWhileSame(ops)
      const last = same[same.length - 1]
      try {
        if (last.kind === 'upsert') await this.remote.upsert(last.table, [last.row])
        else await this.remote.remove(last.table, [last.id])
      } catch (e) {
        if (!(e instanceof RemoteError) || e.kind === 'network') throw e
        await this.reject(last, e)
      }
      await this.db.outbox.remove(same.map((o) => o.seq))
      await this.refreshPending()
    }
  }

  /** A nuvem recusou a alteração: descarta e restaura a versão da nuvem. */
  private async reject(op: OutboxOp, e: RemoteError) {
    if (e.kind === 'duplicate' && op.table === 'transactions' && op.row?.recurring_bill_id) {
      // A mesma conta do mês já existe na nuvem com outro id (criada por outro aparelho).
      // Junta: as alterações feitas aqui (ex.: pagar, informar valor) vão para a linha da nuvem.
      const server = await this.remote.findRecurring(op.row.recurring_bill_id, op.row.recurring_month)
      await this.tables.del('transactions', [op.id])
      if (server) {
        const merged = { ...server, ...op.row, id: server.id }
        await this.tables.put('transactions', [merged])
        await this.remote.upsert('transactions', [merged])
      }
      this.onRemoteChange(new Set(['transactions']))
      return
    }
    const server = await this.remote.fetchRow(op.table, op.id)
    if (server) await this.tables.put(op.table, [server])
    else await this.tables.del(op.table, [op.id])
    this.setStatus({ failed: [...this.status.failed, { table: op.table, id: op.id, message: e.message }] })
    this.onRemoteChange(new Set([op.table]))
  }

  private async pull() {
    const cursor = await this.db.meta.get<string>('cursor')
    const since = cursor ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString() : null
    const pending = new Set((await this.db.outbox.all()).map((o) => `${o.table}|${o.id}`))
    const changed = new Set<TableName>()
    let max = cursor ?? ''

    for (const t of TABLES) {
      const rows = await this.remote.changedSince(t, since)
      const fresh: any[] = []
      for (const r of rows) {
        if (r.updated_at > max) max = r.updated_at
        if (pending.has(`${t}|${keyOf(t, r)}`)) continue // alteração local ainda não enviada vence
        const local = this.tables.get(t, keyOf(t, r))
        if (local && local.updated_at === r.updated_at && local.client_updated_at === r.client_updated_at) continue
        fresh.push(r)
      }
      if (fresh.length) {
        await this.tables.put(t, fresh)
        changed.add(t)
      }
    }

    if (since) {
      for (const d of await this.remote.deletedSince(since)) {
        if (d.deleted_at > max) max = d.deleted_at
        const t = d.table_name as TableName
        if (!TABLES.includes(t) || !this.tables.has(t, d.row_id)) continue
        if (pending.has(`${t}|${d.row_id}`)) continue
        await this.tables.del(t, [d.row_id])
        changed.add(t)
      }
    }

    if (max) await this.db.meta.set('cursor', max)
    else if (!cursor) await this.db.meta.set('cursor', new Date(0).toISOString())
    if (changed.size) this.onRemoteChange(changed)
  }
}

function takeWhileSame(ops: OutboxOp[]): OutboxOp[] {
  const first = ops[0]
  const out = [first]
  for (let i = 1; i < ops.length; i++) {
    if (ops[i].table === first.table && ops[i].id === first.id) out.push(ops[i])
    else break
  }
  return out
}
