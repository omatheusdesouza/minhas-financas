import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalData } from '../localData'
import { RemoteError, SyncEngine, type Remote } from '../sync'
import { keyOf, memoryPersistence, Tables, type LocalDb, type OutboxOp, type TableName } from '../tables'
import type { Transaction } from '../types'

/** Servidor simulado com as mesmas regras do banco (migrations 0001-0003). */
class FakeServer implements Remote {
  rows = new Map<string, Map<string, any>>()
  deleted: { table_name: string; row_id: string; deleted_at: string }[] = []
  online = true
  clock = Date.parse('2026-10-30T12:00:00Z')
  calls = { upsert: 0 }
  rejectTable: TableName | null = null

  private tick() { this.clock += 1000; return new Date(this.clock).toISOString() }
  private table(t: string) { if (!this.rows.has(t)) this.rows.set(t, new Map()); return this.rows.get(t)! }
  private net() { if (!this.online) throw new RemoteError('Failed to fetch', 'network') }

  async upsert(t: TableName, rows: any[]) {
    this.net()
    this.calls.upsert++
    if (t === this.rejectTable) throw new RemoteError('violates check constraint', 'permanent')
    const m = this.table(t)
    for (const r of rows) {
      const id = keyOf(t, r)
      if (t === 'transactions' && r.recurring_bill_id) {
        const dup = [...m.values()].find((x) => x.id !== id && x.recurring_bill_id === r.recurring_bill_id && x.recurring_month === r.recurring_month)
        if (dup) throw new RemoteError('duplicate key value violates unique constraint', 'duplicate')
      }
      const old = m.get(id)
      if (old && r.client_updated_at && old.client_updated_at && r.client_updated_at < old.client_updated_at) continue
      m.set(id, { ...old, ...r, updated_at: this.tick() })
    }
  }
  async remove(t: TableName, ids: string[]) {
    this.net()
    for (const id of ids) if (this.table(t).delete(id)) this.deleted.push({ table_name: t, row_id: id, deleted_at: this.tick() })
  }
  async changedSince(t: TableName, since: string | null) {
    this.net()
    return [...this.table(t).values()].filter((r) => !since || r.updated_at > since).map((r) => ({ ...r }))
  }
  async deletedSince(since: string) { this.net(); return this.deleted.filter((d) => d.deleted_at > since) }
  async fetchRow(t: TableName, id: string) { this.net(); return this.table(t).get(id) ?? null }
  async findRecurring(billId: string, month: string) {
    this.net()
    return [...this.table('transactions').values()].find((x) => x.recurring_bill_id === billId && x.recurring_month === month) ?? null
  }
  list(t: string) { return [...this.table(t).values()] }
}

function memoryDb(): Pick<LocalDb, 'outbox' | 'meta'> & { ops: OutboxOp[] } {
  let seq = 0
  const meta = new Map<string, unknown>()
  const db = {
    ops: [] as OutboxOp[],
    outbox: {
      async all() { return [...db.ops] },
      async add(op: Omit<OutboxOp, 'seq'>) { db.ops.push({ ...structuredClone(op), seq: ++seq }) },
      async remove(seqs: number[]) { db.ops = db.ops.filter((o) => !seqs.includes(o.seq)) },
      async count() { return db.ops.length },
    },
    meta: { async get(k: string) { return meta.get(k) as any }, async set(k: string, v: unknown) { meta.set(k, v) } },
  }
  return db
}

/** Um aparelho: cópia local + fila + motor de sincronização. */
function device(server: FakeServer, name = 'A') {
  const tables = new Tables(memoryPersistence())
  const db = memoryDb()
  const changes: string[] = []
  const engine = new SyncEngine(tables, db, server, (ts) => changes.push(...ts))
  const data = createLocalData(tables, {
    changed: (t, rows) => engine.enqueue(t, 'upsert', rows),
    removed: (t, ids) => engine.enqueue(t, 'delete', ids),
  }, () => 'user-1')
  return { name, tables, db, engine, data, changes }
}

const tx = (over: Partial<Transaction> = {}) => ({
  kind: 'expense' as const, amount: 50, date: '2026-10-30', description: 'Mercado', category_id: null,
  payment_method_id: null, paid: true, paid_at: '2026-10-30', notes: null, installment_plan_id: null,
  installment_number: null, recurring_bill_id: null, recurring_month: null, receipt_path: null, ...over,
})

let server: FakeServer
beforeEach(() => { server = new FakeServer() })

describe('offline e fila de envio', () => {
  it('sem internet: grava na hora no aparelho e envia quando a conexão volta', async () => {
    const a = device(server)
    server.online = false
    const t = await a.data.saveTransaction(tx())
    expect((await a.data.listTransactions('2026-10-01', '2026-10-31')).map((x) => x.id)).toEqual([t.id])
    expect(await a.engine.sync()).toBe(false)
    expect(a.engine.status).toMatchObject({ state: 'offline', pending: 1 })
    expect(server.list('transactions')).toHaveLength(0)
    server.online = true
    expect(await a.engine.sync()).toBe(true)
    expect(a.engine.status).toMatchObject({ state: 'idle', pending: 0 })
    expect(server.list('transactions').map((x) => x.id)).toEqual([t.id])
  })

  it('reenviar o mesmo item não duplica (id criado no aparelho)', async () => {
    const a = device(server)
    const t = await a.data.saveTransaction(tx())
    const op = (await a.db.outbox.all())[0]
    await server.upsert('transactions', [op.row]) // a 1ª tentativa chegou, mas a resposta se perdeu
    await a.engine.sync() // reenvia
    expect(server.list('transactions')).toHaveLength(1)
    expect(server.list('transactions')[0].id).toBe(t.id)
  })

  it('várias edições da mesma linha offline viram um só envio, com a última versão', async () => {
    const a = device(server)
    server.online = false
    const t = await a.data.saveTransaction(tx({ amount: 10 }))
    await a.data.saveTransaction({ ...t, amount: 20 })
    await a.data.saveTransaction({ ...t, amount: 30 })
    server.online = true
    await a.engine.sync()
    expect(server.calls.upsert).toBe(1)
    expect(server.list('transactions')[0].amount).toBe(30)
  })

  it('a ordem é mantida: categoria criada antes do lançamento que a usa', async () => {
    const a = device(server)
    server.online = false
    const c = await a.data.saveCategory({ parent_id: null, name: 'Pet', kind: 'expense', nature: 'essencial', icon: '🐶', color: '#000', monthly_budget: null, sort_order: 0, archived: false })
    await a.data.saveTransaction(tx({ category_id: c.id }))
    expect((await a.db.outbox.all()).map((o) => o.table)).toEqual(['categories', 'transactions'])
  })

  it('internet cai no meio do envio: o que não foi enviado continua na fila', async () => {
    const a = device(server)
    server.online = false
    await a.data.saveTransaction(tx({ description: '1' }))
    await a.data.saveTransaction(tx({ description: '2' }))
    server.online = true
    const orig = server.upsert.bind(server)
    let n = 0
    server.upsert = async (t, r) => { if (++n === 2) { server.online = false } return orig(t, r) }
    expect(await a.engine.sync()).toBe(false)
    expect(a.engine.status.pending).toBe(1)
    server.online = true
    server.upsert = orig
    await a.engine.sync()
    expect(server.list('transactions').map((x) => x.description).sort()).toEqual(['1', '2'])
  })
})

describe('dois aparelhos', () => {
  it('o que um aparelho cria aparece no outro', async () => {
    const a = device(server, 'A')
    const b = device(server, 'B')
    await a.data.saveTransaction(tx({ description: 'Feito no A' }))
    await a.engine.sync()
    await b.engine.sync()
    expect((await b.data.listTransactions('2026-10-01', '2026-10-31')).map((x) => x.description)).toEqual(['Feito no A'])
    expect(b.changes).toContain('transactions')
  })

  it('conflito: vale a edição mais recente, mesmo chegando antes a mais antiga', async () => {
    const a = device(server, 'A')
    const b = device(server, 'B')
    const t = await a.data.saveTransaction(tx({ amount: 100 }))
    await a.engine.sync(); await b.engine.sync()
    server.online = false
    // B edita primeiro (mais antiga), A edita depois (mais recente)
    await b.data.saveTransaction({ ...(await b.data.listTransactions('2026-10-01', '2026-10-31'))[0], amount: 200 })
    await new Promise((r) => setTimeout(r, 5))
    await a.data.saveTransaction({ ...t, amount: 300 })
    server.online = true
    await a.engine.sync() // a mais recente chega primeiro
    await b.engine.sync() // a mais antiga chega atrasada e é ignorada
    await a.engine.sync()
    expect(server.list('transactions')[0].amount).toBe(300)
    expect((await b.data.listTransactions('2026-10-01', '2026-10-31'))[0].amount).toBe(300)
  })

  it('exclusão em um aparelho apaga no outro', async () => {
    const a = device(server, 'A')
    const b = device(server, 'B')
    const t = await a.data.saveTransaction(tx())
    await a.engine.sync(); await b.engine.sync()
    await a.data.deleteTransaction(t.id)
    await a.engine.sync()
    await b.engine.sync()
    expect(await b.data.listTransactions('2026-10-01', '2026-10-31')).toEqual([])
  })

  it('a mesma conta do mês gerada offline nos dois aparelhos vira uma só', async () => {
    const a = device(server, 'A')
    const b = device(server, 'B')
    server.online = false
    const r = { kind: 'expense' as const, amount: null, date: '2026-11-10', description: 'Energia', category_id: null,
      payment_method_id: null, paid: false, paid_at: null, notes: null, installment_plan_id: null, installment_number: null,
      recurring_bill_id: 'bill-luz', recurring_month: '2026-11-01', receipt_path: null }
    await a.data.insertRecurringTransactions([r])
    await b.data.insertRecurringTransactions([r])
    server.online = true
    await a.engine.sync(); await b.engine.sync(); await a.engine.sync()
    expect(server.list('transactions')).toHaveLength(1)
    expect((await a.data.listUnpaid('2026-12-31')).length).toBe(1)
    expect((await b.data.listUnpaid('2026-12-31')).length).toBe(1)
  })

  it('duplicata de versão antiga do app: o pagamento feito offline não se perde', async () => {
    // a nuvem já tem a conta de novembro com outro id (gerada antes da 3E)
    server.rows.set('transactions', new Map([['old-id', { id: 'old-id', ...tx({ paid: false, amount: null, recurring_bill_id: 'bill-agua', recurring_month: '2026-11-01', description: 'Água' }), client_updated_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' }]]))
    const b = device(server, 'B')
    server.online = false
    await b.data.insertRecurringTransactions([tx({ paid: false, amount: null, recurring_bill_id: 'bill-agua', recurring_month: '2026-11-01', description: 'Água', date: '2026-11-10' })])
    const mine = (await b.data.listUnpaid('2026-12-31'))[0]
    await b.data.saveTransaction({ ...mine, paid: true, amount: 87.4, paid_at: '2026-11-08' })
    server.online = true
    await b.engine.sync()
    const all = server.list('transactions')
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ id: 'old-id', paid: true, amount: 87.4 })
    const local = await b.data.listTransactions('2026-11-01', '2026-11-30')
    expect(local.map((x) => [x.id, x.paid])).toEqual([['old-id', true]])
  })
})

describe('falhas', () => {
  it('alteração recusada pela nuvem: descarta, restaura a versão da nuvem e avisa', async () => {
    const a = device(server)
    const g = await a.data.saveGoal({ name: 'Viagem', icon: '✈️', color: '#000', target_amount: 5000, monthly_contribution: null, contribution_day: null, target_date: null, archived: false })
    await a.engine.sync()
    server.rejectTable = 'savings_goals'
    await a.data.saveGoal({ ...g, name: 'Nome inválido' })
    await a.engine.sync()
    expect(a.engine.status.pending).toBe(0)
    expect(a.engine.status.failed).toHaveLength(1)
    expect((await a.data.listGoals())[0].name).toBe('Viagem')
  })

  it('alteração local ainda não enviada não é sobrescrita pela busca', async () => {
    const a = device(server, 'A')
    const b = device(server, 'B')
    const t = await a.data.saveTransaction(tx({ description: 'original' }))
    await a.engine.sync(); await b.engine.sync()
    server.online = false
    await b.data.saveTransaction({ ...(await b.data.listTransactions('2026-10-01', '2026-10-31'))[0], description: 'editado no B' })
    server.online = true
    // A edita depois e envia; B busca antes de enviar a sua
    await a.data.saveTransaction({ ...t, description: 'editado no A' })
    await a.engine.sync()
    expect((await b.data.listTransactions('2026-10-01', '2026-10-31'))[0].description).toBe('editado no B')
  })
})

describe('sincronizar agora', () => {
  it('pedido durante uma sincronização em andamento só termina depois de buscar as novidades', async () => {
    const a = device(server, 'A')
    const b = device(server, 'B')
    const t = await a.data.saveTransaction(tx({ description: 'vai ser apagada' }))
    await a.engine.sync(); await b.engine.sync()
    // A começa uma sincronização "lenta"; durante ela, B apaga e o usuário do A toca em "Sincronizar agora"
    const orig = server.changedSince.bind(server)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let first = true
    server.changedSince = async (tb, since) => { if (first) { first = false; await gate } return orig(tb, since) }
    const auto = a.engine.sync()
    await b.data.deleteTransaction(t.id); await b.engine.sync().catch(() => {})
    server.changedSince = orig
    const manual = a.engine.sync()
    release()
    await auto
    expect(await manual).toBe(true)
    expect(await a.data.listTransactions('2026-10-01', '2026-10-31')).toEqual([])
  })
})
