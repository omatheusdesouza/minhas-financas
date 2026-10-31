import { describe, expect, it } from 'vitest'
import { ago, device, filterUsers, topBy, when } from '../admin'
import type { AdminUser, SecurityEvent } from '../backend'

const NOW = Date.parse('2026-10-31T12:00:00Z')
const user = (p: Partial<AdminUser>): AdminUser => ({
  id: 'x', email: 'a@x.com', name: null, created_at: '2026-10-01T00:00:00Z', last_sign_in_at: '2026-10-30T00:00:00Z',
  confirmed: true, blocked: false, admin: false, shares: 0, member_of: 0, failed24: 0, ...p,
})
const ev = (p: Partial<SecurityEvent>): SecurityEvent => ({
  id: 1, created_at: '2026-10-31T00:00:00Z', kind: 'login_failed', email: null, user_id: null, ip: null, user_agent: null, detail: null, ...p,
})

describe('painel do gestor', () => {
  it('filtra pessoas por busca e situação', () => {
    const list = [
      user({ id: '1', email: 'ana@x.com', name: 'Ana' }),
      user({ id: '2', email: 'bob@x.com', blocked: true }),
      user({ id: '3', email: 'cid@x.com', confirmed: false, last_sign_in_at: null }),
      user({ id: '4', email: 'dan@x.com', last_sign_in_at: '2026-09-01T00:00:00Z', failed24: 4 }),
    ]
    const ids = (f: Parameters<typeof filterUsers>[2], q = '') => filterUsers(list, q, f, NOW).map((u) => u.id)
    expect(ids('todos', 'ANA')).toEqual(['1'])
    expect(ids('bloqueados')).toEqual(['2'])
    expect(ids('sem-confirmar')).toEqual(['3'])
    expect(ids('inativos')).toEqual(['3', '4'])
    expect(ids('suspeitos')).toEqual(['4'])
  })

  it('quem mais erra a senha, por e-mail e por IP', () => {
    const evs = [ev({ email: 'a', ip: '1' }), ev({ email: 'a', ip: '2' }), ev({ email: 'b', ip: '1' }), ev({ kind: 'login_ok', email: 'b', ip: '1' })]
    expect(topBy(evs, 'login_failed', 'email')).toEqual([{ value: 'a', n: 2 }, { value: 'b', n: 1 }])
    expect(topBy(evs, 'login_failed', 'ip')).toEqual([{ value: '1', n: 2 }, { value: '2', n: 1 }])
  })

  it('datas, tempo decorrido e aparelho', () => {
    expect(when('2026-10-31T23:15:00Z')).toBe('31/10/26 20:15')
    expect(when(null)).toBe('—')
    expect(ago('2026-10-31T11:55:00Z', NOW)).toBe('há 5 min')
    expect(ago('2026-10-31T09:00:00Z', NOW)).toBe('há 3 h')
    expect(ago('2026-10-25T12:00:00Z', NOW)).toBe('há 6 dias')
    expect(ago(null, NOW)).toBe('nunca')
    expect(device('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1')).toBe('Safari · iPhone/iPad')
    expect(device('Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36')).toBe('Chrome · Windows')
    expect(device('curl/8.4.0')).toBe('robô/script')
  })
})
