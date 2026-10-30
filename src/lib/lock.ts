/**
 * Bloqueio do app por PIN e biometria.
 *
 * - O PIN nunca é guardado: só um hash PBKDF2-SHA256 (150 mil iterações) com sal aleatório.
 * - A configuração fica no armazenamento seguro do aparelho (Keychain no iPhone, Keystore no
 *   Android) e não vai para a nuvem: cada celular tem o seu bloqueio.
 * - Erros seguidos geram espera crescente (5 erros: 30 s, depois 1, 2, 4… até 15 min).
 */

export type LockTimeout = 0 | 60 | 300

export interface LockConfig {
  enabled: boolean
  pinHash: string
  salt: string
  pinLength: 4 | 6
  biometric: boolean
  /** segundos fora do app até pedir o desbloqueio de novo (0 = imediatamente) */
  timeout: LockTimeout
  failed: number
  /** timestamp (ms) até quando novas tentativas ficam bloqueadas */
  lockedUntil: number
}

/** Onde a configuração é guardada (armazenamento seguro no celular; substituível nos testes). */
export interface LockStore {
  get(): Promise<LockConfig | null>
  set(c: LockConfig): Promise<void>
  clear(): Promise<void>
}

export const ITERATIONS = 150_000
export const FREE_ATTEMPTS = 5
const MAX_WAIT = 15 * 60

export const TIMEOUT_OPTIONS: { value: LockTimeout; label: string }[] = [
  { value: 0, label: 'Imediatamente' },
  { value: 60, label: 'Após 1 minuto' },
  { value: 300, label: 'Após 5 minutos' },
]

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export function newSalt(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)).buffer)
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: ITERATIONS }, key, 256,
  )
  return hex(bits)
}

/** Comparação em tempo constante (não revela quantos caracteres batem). */
function sameHash(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Valida o PIN escolhido. Devolve a mensagem de erro ou null. */
export function pinProblem(pin: string, length: 4 | 6): string | null {
  if (!new RegExp(`^\\d{${length}}$`).test(pin)) return `O PIN precisa ter ${length} números.`
  if (/^(\d)\1+$/.test(pin)) return 'Evite números repetidos (ex.: 0000). Escolha outro PIN.'
  const asc = '01234567890123456789'
  const desc = '98765432109876543210'
  if (asc.includes(pin) || desc.includes(pin)) return 'Evite sequências (ex.: 1234). Escolha outro PIN.'
  return null
}

/** Segundos de espera depois de `failed` erros seguidos. */
export function waitAfter(failed: number): number {
  if (failed < FREE_ATTEMPTS) return 0
  return Math.min(MAX_WAIT, 30 * 2 ** (failed - FREE_ATTEMPTS))
}

/** O app deve pedir desbloqueio ao voltar? */
export function shouldLock(cfg: LockConfig | null, leftAt: number | null, now: number): boolean {
  if (!cfg?.enabled) return false
  if (leftAt == null) return true
  return now - leftAt >= cfg.timeout * 1000
}

export async function createConfig(pin: string, pinLength: 4 | 6, prev?: LockConfig | null): Promise<LockConfig> {
  const salt = newSalt()
  return {
    enabled: true, pinHash: await hashPin(pin, salt), salt, pinLength,
    biometric: prev?.biometric ?? false, timeout: prev?.timeout ?? 0, failed: 0, lockedUntil: 0,
  }
}

export type VerifyResult =
  | { ok: true; cfg: LockConfig }
  | { ok: false; cfg: LockConfig; waitSeconds: number; attemptsLeft: number }

/** Confere o PIN, registra erros e aplica a espera. Salva o novo estado no store. */
export async function verifyPin(store: LockStore, pin: string, now = Date.now()): Promise<VerifyResult> {
  const cfg = await store.get()
  if (!cfg?.enabled) throw new Error('Bloqueio não configurado.')
  if (cfg.lockedUntil > now) {
    return { ok: false, cfg, waitSeconds: Math.ceil((cfg.lockedUntil - now) / 1000), attemptsLeft: 0 }
  }
  if (sameHash(await hashPin(pin, cfg.salt), cfg.pinHash)) {
    const next = { ...cfg, failed: 0, lockedUntil: 0 }
    await store.set(next)
    return { ok: true, cfg: next }
  }
  const failed = cfg.failed + 1
  const wait = waitAfter(failed)
  const next = { ...cfg, failed, lockedUntil: wait ? now + wait * 1000 : 0 }
  await store.set(next)
  return { ok: false, cfg: next, waitSeconds: wait, attemptsLeft: Math.max(0, FREE_ATTEMPTS - failed) }
}

/** Biometria aceita: zera os erros. */
export async function resetFailures(store: LockStore) {
  const cfg = await store.get()
  if (cfg && (cfg.failed || cfg.lockedUntil)) await store.set({ ...cfg, failed: 0, lockedUntil: 0 })
}
