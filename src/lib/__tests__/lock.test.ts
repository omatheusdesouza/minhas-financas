import { describe, expect, it } from 'vitest'
import {
  createConfig, hashPin, pinProblem, resetFailures, shouldLock, verifyPin, waitAfter, type LockConfig, type LockStore,
} from '../lock'

function memoryStore(): LockStore & { value: LockConfig | null } {
  return {
    value: null,
    async get() { return this.value },
    async set(c) { this.value = c },
    async clear() { this.value = null },
  }
}

describe('PIN', () => {
  it('nunca guarda o PIN: só o hash com sal aleatório', async () => {
    const c = await createConfig('2580', 4)
    expect(JSON.stringify(c)).not.toContain('2580')
    expect(c.pinHash).toMatch(/^[0-9a-f]{64}$/)
    const c2 = await createConfig('2580', 4)
    expect(c2.salt).not.toBe(c.salt)
    expect(c2.pinHash).not.toBe(c.pinHash) // mesmo PIN, hashes diferentes
    expect(await hashPin('2580', c.salt)).toBe(c.pinHash)
  })

  it('recusa PIN fraco ou com tamanho errado', () => {
    expect(pinProblem('0000', 4)).toMatch(/repetidos/)
    expect(pinProblem('1234', 4)).toMatch(/sequências/)
    expect(pinProblem('9876', 4)).toMatch(/sequências/)
    expect(pinProblem('123', 4)).toMatch(/4 números/)
    expect(pinProblem('12a4', 4)).toMatch(/4 números/)
    expect(pinProblem('258014', 4)).toMatch(/4 números/)
    expect(pinProblem('2580', 4)).toBeNull()
    expect(pinProblem('258014', 6)).toBeNull()
    expect(pinProblem('345678', 6)).toMatch(/sequências/)
  })

  it('PIN certo desbloqueia e zera os erros', async () => {
    const s = memoryStore()
    s.value = { ...(await createConfig('2580', 4)), failed: 3 }
    const r = await verifyPin(s, '2580')
    expect(r.ok).toBe(true)
    expect(s.value!.failed).toBe(0)
  })

  it('erros seguidos: 5 tentativas livres, depois espera crescente', async () => {
    const s = memoryStore()
    s.value = await createConfig('2580', 4)
    let now = 1_000_000
    for (let i = 1; i <= 4; i++) {
      const r = await verifyPin(s, '1111', now)
      expect(r.ok).toBe(false)
      if (!r.ok) { expect(r.waitSeconds).toBe(0); expect(r.attemptsLeft).toBe(5 - i) }
    }
    const fifth = await verifyPin(s, '1111', now)
    expect(!fifth.ok && fifth.waitSeconds).toBe(30)
    // durante a espera, nem o PIN certo é aceito
    const during = await verifyPin(s, '2580', now + 10_000)
    expect(during.ok).toBe(false)
    if (!during.ok) expect(during.waitSeconds).toBe(20)
    now += 31_000
    const sixth = await verifyPin(s, '1111', now)
    expect(!sixth.ok && sixth.waitSeconds).toBe(60)
    expect((await verifyPin(s, '2580', now + 61_000)).ok).toBe(true)
  })

  it('espera máxima de 15 minutos', () => {
    expect([4, 5, 6, 7, 8].map(waitAfter)).toEqual([0, 30, 60, 120, 240])
    expect(waitAfter(30)).toBe(900)
  })

  it('biometria aceita zera os erros', async () => {
    const s = memoryStore()
    s.value = { ...(await createConfig('2580', 4)), failed: 6, lockedUntil: Date.now() + 60_000 }
    await resetFailures(s)
    expect(s.value).toMatchObject({ failed: 0, lockedUntil: 0 })
  })
})

describe('quando bloquear', () => {
  it('ao abrir o app (sem registro de saída) e conforme o tempo fora', async () => {
    const c = await createConfig('2580', 4)
    expect(shouldLock(c, null, 0)).toBe(true)
    expect(shouldLock({ ...c, timeout: 0 }, 1000, 1000)).toBe(true)
    expect(shouldLock({ ...c, timeout: 60 }, 0, 59_000)).toBe(false)
    expect(shouldLock({ ...c, timeout: 60 }, 0, 60_000)).toBe(true)
    expect(shouldLock({ ...c, timeout: 300 }, 0, 120_000)).toBe(false)
    expect(shouldLock({ ...c, enabled: false }, null, 0)).toBe(false)
    expect(shouldLock(null, null, 0)).toBe(false)
  })
})
