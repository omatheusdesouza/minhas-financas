import { describe, expect, it } from 'vitest'
import { supabaseRemote } from '../supabaseBackend'

/** Cliente falso do Supabase: a tabela account_moves "não existe" (banco antes da migration 0009). */
function fakeClient(missing: string[]) {
  const query = (table: string) => {
    const result = missing.includes(table)
      ? { data: null, error: { message: `Could not find the table 'public.${table}' in the schema cache`, code: 'PGRST205' }, status: 404 }
      : { data: [{ id: '1', updated_at: '2026-11-01T00:00:00Z', amount: '10.50' }], error: null, status: 200 }
    const q: any = {
      select: () => q, order: () => q, range: () => q, gt: () => q, eq: () => q,
      then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve(result).then(ok, fail),
    }
    return q
  }
  return { from: query } as any
}

describe('sincronização com banco sem a migration do caixa', () => {
  it('tabela nova ausente é ignorada; as outras continuam (e erro em tabela antiga não é escondido)', async () => {
    const remote = supabaseRemote(fakeClient(['account_moves']))
    expect(await remote.changedSince('account_moves', null)).toEqual([])
    expect(await remote.rowsOf('account_moves', 'u1')).toEqual([])
    expect((await remote.changedSince('transactions', null))[0].amount).toBe(10.5)
    await expect(supabaseRemote(fakeClient(['transactions'])).changedSince('transactions', null)).rejects.toThrow()
  })
})
