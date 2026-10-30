import type { Backend, User } from './backend'
import { createLocalData } from './localData'
import { Tables, localStoragePersistence } from './tables'

/** Modo demonstração: guarda tudo no próprio aparelho, sem conta e sem nuvem. */

const PREFIX = 'mf-demo:'
const DEMO_USER: User = { id: 'demo', email: 'demonstracao@aparelho' }
const demoUser = (): User => {
  try {
    const t = JSON.parse(localStorage.getItem(PREFIX + 'terms') ?? 'null') as { version: string; at: string } | null
    return { ...DEMO_USER, termsVersion: t?.version ?? null, termsAcceptedAt: t?.at ?? null }
  } catch { return DEMO_USER }
}

function uid() {
  return crypto.randomUUID()
}

/** Espera a cópia local carregar antes de cada operação. */
export function whenReady<T extends object>(ready: Promise<unknown>, api: T): T {
  return Object.fromEntries(Object.entries(api).map(([k, fn]) => [k, async (...args: unknown[]) => {
    await ready
    return (fn as (...a: unknown[]) => unknown)(...args)
  }])) as T
}

export function createLocalBackend(): Backend {
  const tables = new Tables(localStoragePersistence(PREFIX))
  const data = whenReady(tables.load(), createLocalData(tables, { changed() {}, removed() {} }, () => DEMO_USER.id))
  const listeners = new Set<(u: User | null, e?: string) => void>()
  const signedIn = () => localStorage.getItem(PREFIX + 'session') === '1'
  const setSigned = (v: boolean) => {
    if (v) localStorage.setItem(PREFIX + 'session', '1')
    else localStorage.removeItem(PREFIX + 'session')
    listeners.forEach((cb) => cb(v ? demoUser() : null, v ? 'SIGNED_IN' : 'SIGNED_OUT'))
  }

  const saveTerms = (version: string) =>
    localStorage.setItem(PREFIX + 'terms', JSON.stringify({ version, at: new Date().toISOString() }))

  return {
    mode: 'demo',
    async getUser() {
      return signedIn() ? demoUser() : null
    },
    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async signIn() {
      setSigned(true)
    },
    async signUp(_email, _password, termsVersion) {
      saveTerms(termsVersion)
      setSigned(true)
      return { needsConfirmation: false }
    },
    // o modo demonstração guarda tudo no aparelho e aceita qualquer recurso
    async schemaVersion() {
      return '9999'
    },
    async acceptTerms(version) {
      saveTerms(version)
      listeners.forEach((cb) => cb(demoUser(), 'USER_UPDATED'))
    },
    async deleteAccount() {
      // apaga tudo o que o modo demonstração guardou neste aparelho
      Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k))
      setSigned(false)
    },
    async resetPassword() {},
    async verifyRecovery() {
      setSigned(true)
    },
    async updatePassword() {},
    async signOut() {
      setSigned(false)
    },

    ...data,

    // Arquivos do modo demonstração ficam no próprio aparelho, como data URL
    async uploadFile(bucket, name, file) {
      const data = await new Promise<string>((ok, fail) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result))
        r.onerror = () => fail(new Error('Não foi possível ler o arquivo.'))
        r.readAsDataURL(file)
      })
      const path = `${DEMO_USER.id}/${name}-${uid()}`
      localStorage.setItem(`${PREFIX}file:${bucket}/${path}`, data)
      return path
    },
    async fileUrl(bucket, path) {
      return localStorage.getItem(`${PREFIX}file:${bucket}/${path}`) ?? ''
    },
    async removeFile(bucket, path) {
      localStorage.removeItem(`${PREFIX}file:${bucket}/${path}`)
    },
  }
}
