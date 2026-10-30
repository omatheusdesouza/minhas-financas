import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { openLocalDb, Tables } from '../tables'

describe('banco do aparelho (IndexedDB)', () => {
  it('dados, fila e controle sobrevivem a fechar e abrir o app', async () => {
    const name = `fynvault-teste-${Date.now()}`
    let db = await openLocalDb(name)
    let tables = new Tables(db.persistence)
    await tables.put('transactions', [{ id: 't1', description: 'Mercado', amount: 50 }])
    await tables.put('profiles', [{ user_id: 'u1', display_name: 'Matheus' }])
    await db.outbox.add({ table: 'transactions', kind: 'upsert', id: 't1', row: { id: 't1' }, at: '2026-10-30T10:00:00Z' })
    await db.meta.set('cursor', '2026-10-30T09:00:00+00:00')

    // "fecha o app" e abre de novo
    db = await openLocalDb(name)
    tables = new Tables(db.persistence)
    await tables.load()
    expect(tables.get('transactions', 't1')).toMatchObject({ description: 'Mercado' })
    expect(tables.get('profiles', 'u1')).toMatchObject({ display_name: 'Matheus' })
    expect(await db.outbox.count()).toBe(1)
    expect(await db.meta.get('cursor')).toBe('2026-10-30T09:00:00+00:00')

    const [op] = await db.outbox.all()
    await db.outbox.remove([op.seq])
    await tables.del('transactions', ['t1'])
    db = await openLocalDb(name)
    tables = new Tables(db.persistence)
    await tables.load()
    expect(tables.isEmpty()).toBe(false)
    expect(tables.get('transactions', 't1')).toBeUndefined()
    expect(await db.outbox.count()).toBe(0)
  })

  it('sair da conta apaga a cópia local do aparelho', async () => {
    const name = `fynvault-sair-${Date.now()}`
    const db = await openLocalDb(name)
    await new Tables(db.persistence).put('transactions', [{ id: 'x' }])
    await db.destroy()
    const again = new Tables((await openLocalDb(name)).persistence)
    await again.load()
    expect(again.isEmpty()).toBe(true)
  })
})
