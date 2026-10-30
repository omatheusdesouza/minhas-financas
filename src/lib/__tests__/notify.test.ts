import { beforeEach, describe, expect, it, vi } from 'vitest'

// Celular Android simulado
const ln = vi.hoisted(() => ({
  pending: [] as { id: number }[],
  scheduled: [] as any[],
  permission: 'granted',
  cancel: vi.fn(async ({ notifications }: any) => {
    const ids = new Set(notifications.map((n: any) => n.id))
    ln.pending = ln.pending.filter((n) => !ids.has(n.id))
  }),
  schedule: vi.fn(async ({ notifications }: any) => {
    ln.scheduled = notifications
    ln.pending.push(...notifications.map((n: any) => ({ id: n.id })))
  }),
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }))
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    getPending: async () => ({ notifications: [...ln.pending] }),
    cancel: ln.cancel,
    schedule: ln.schedule,
    checkPermissions: async () => ({ display: ln.permission }),
  },
}))
const data = vi.hoisted(() => ({ unpaid: [] as any[] }))
vi.mock('../api', () => ({
  api: {
    listUnpaid: async () => data.unpaid,
    listGoals: async () => [],
    getProfile: async () => ({ reminder_time: '09:00' }),
  },
}))

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})

import { CHANNEL_CRITICAL, CHANNEL_NORMAL, setRemindersEnabled, syncReminders } from '../notify'

const future = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

beforeEach(() => {
  ln.pending = [{ id: 111 }, { id: 222 }] // lembretes antigos
  ln.scheduled = []
  ln.permission = 'granted'
  ln.cancel.mockClear()
  ln.schedule.mockClear()
  store.clear()
  data.unpaid = [{ id: 'a', kind: 'expense', date: future(15), paid: false, amount: null, description: 'Água' }]
})

describe('agenda no celular', () => {
  it('cancela os lembretes antigos e agenda os novos, nos canais certos', async () => {
    const n = await syncReminders()
    expect(ln.cancel).toHaveBeenCalledWith({ notifications: [{ id: 111 }, { id: 222 }] })
    expect(n).toBeGreaterThan(0)
    const channels = new Set(ln.scheduled.map((x) => x.channelId))
    expect(channels).toEqual(new Set([CHANNEL_NORMAL, CHANNEL_CRITICAL]))
    expect(ln.scheduled.every((x) => x.schedule.allowWhileIdle && x.smallIcon === 'ic_stat_fynvault')).toBe(true)
  })

  it('ao pagar a conta, todos os lembretes dela somem', async () => {
    await syncReminders()
    expect(ln.pending.length).toBeGreaterThan(0)
    data.unpaid = [] // conta paga ou excluída
    const n = await syncReminders()
    expect(n).toBe(0)
    expect(ln.pending).toEqual([])
  })

  it('ao informar o valor, param os lembretes de "informar valor"', async () => {
    await syncReminders()
    expect(ln.scheduled.some((x) => x.title.startsWith('Informe o valor'))).toBe(true)
    data.unpaid = [{ ...data.unpaid[0], amount: 87.4 }]
    await syncReminders()
    expect(ln.scheduled.some((x) => x.title.startsWith('Informe o valor'))).toBe(false)
    expect(ln.scheduled.length).toBeGreaterThan(0)
  })

  it('lembretes desligados ou sem permissão: cancela tudo e não agenda', async () => {
    setRemindersEnabled(false)
    expect(await syncReminders()).toBe(0)
    expect(ln.pending).toEqual([])
    setRemindersEnabled(true)
    ln.pending = [{ id: 1 }]
    ln.permission = 'denied'
    expect(await syncReminders()).toBe(0)
    expect(ln.schedule).not.toHaveBeenCalled()
  })
})
