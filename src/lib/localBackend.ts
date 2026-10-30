import type { Backend, User } from './backend'
import { createLocalData } from './localData'
import { Tables, localStoragePersistence } from './tables'

/** Modo demonstração: guarda tudo no próprio aparelho, sem conta e sem nuvem. */

const PREFIX = 'mf-demo:'
const DEMO_USER: User = { id: 'demo', email: 'demonstracao@aparelho' }

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
    listeners.forEach((cb) => cb(v ? DEMO_USER : null, v ? 'SIGNED_IN' : 'SIGNED_OUT'))
  }

  return {
    mode: 'demo',
    async getUser() {
      return signedIn() ? DEMO_USER : null
    },
    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async signIn() {
      setSigned(true)
    },
    async signUp() {
      setSigned(true)
      return { needsConfirmation: false }
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
