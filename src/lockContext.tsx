import { App as CapApp } from '@capacitor/app'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { LockScreen } from './components/LockScreen'
import { authenticateBiometric, checkBiometry, secureLockStore, type Biometry } from './lib/deviceLock'
import { createConfig, resetFailures, shouldLock, verifyPin, type LockConfig, type LockTimeout, type VerifyResult } from './lib/lock'

interface LockState {
  cfg: LockConfig | null
  biometry: Biometry
  unlockPin: (pin: string) => Promise<VerifyResult>
  unlockBiometric: () => Promise<boolean>
  enable: (pin: string, length: 4 | 6) => Promise<void>
  disable: () => Promise<void>
  setBiometric: (on: boolean) => Promise<boolean>
  setTimeoutSec: (t: LockTimeout) => Promise<void>
  /** confere o PIN atual sem mexer no estado de bloqueio (para trocar/desativar) */
  checkPin: (pin: string) => Promise<VerifyResult>
  clear: () => Promise<void>
}

const Ctx = createContext<LockState | null>(null)
export const useLock = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLock fora do LockProvider')
  return v
}

/**
 * Bloqueia o app ao abrir e ao voltar depois do tempo escolhido.
 * Enquanto bloqueado, o conteúdo fica inacessível (inert) por baixo da tela de PIN.
 */
export function LockProvider({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<LockConfig | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [locked, setLocked] = useState(false)
  const [biometry, setBiometry] = useState<Biometry>({ available: false, label: 'biometria' })
  const leftAt = useRef<number | null>(null)
  const host = useRef<HTMLDivElement>(null)
  const cfgRef = useRef<LockConfig | null>(null)
  cfgRef.current = cfg

  useEffect(() => {
    ;(async () => {
      const [c, b] = await Promise.all([secureLockStore.get(), checkBiometry()])
      setCfg(c)
      setBiometry(b)
      setLocked(shouldLock(c, null, Date.now()))
      setLoaded(true)
    })()
  }, [])

  // Saiu do app: guarda a hora (e bloqueia já, se for "imediatamente", para a miniatura de apps recentes não mostrar dados)
  // O sistema e a página avisam a saída/volta (podem chegar os dois): vale o primeiro aviso de saída,
  // e a volta só conta se houve uma saída registrada (a abertura do app é tratada ao carregar).
  const onLeave = useCallback(() => {
    if (leftAt.current == null) leftAt.current = Date.now()
    if (cfgRef.current?.enabled && cfgRef.current.timeout === 0) setLocked(true)
  }, [])
  const onBack = useCallback(() => {
    if (leftAt.current == null) return
    if (shouldLock(cfgRef.current, leftAt.current, Date.now())) setLocked(true)
    leftAt.current = null
  }, [])

  useEffect(() => {
    const p = CapApp.addListener('pause', onLeave)
    const r = CapApp.addListener('resume', onBack)
    const vis = () => (document.visibilityState === 'hidden' ? onLeave() : onBack())
    document.addEventListener('visibilitychange', vis)
    return () => {
      p.then((h) => h.remove()).catch(() => {})
      r.then((h) => h.remove()).catch(() => {})
      document.removeEventListener('visibilitychange', vis)
    }
  }, [onLeave, onBack])

  const save = async (c: LockConfig) => {
    await secureLockStore.set(c)
    setCfg(c)
  }

  const value: LockState = {
    cfg, biometry,
    async unlockPin(pin) {
      const r = await verifyPin(secureLockStore, pin)
      setCfg(r.cfg)
      if (r.ok) setLocked(false)
      return r
    },
    async unlockBiometric() {
      if (!cfg?.biometric || !biometry.available) return false
      const ok = await authenticateBiometric()
      if (ok) {
        await resetFailures(secureLockStore)
        setCfg(await secureLockStore.get())
        setLocked(false)
      }
      return ok
    },
    async checkPin(pin) {
      const r = await verifyPin(secureLockStore, pin)
      setCfg(r.cfg)
      return r
    },
    async enable(pin, length) {
      await save(await createConfig(pin, length, cfg))
    },
    async disable() {
      await secureLockStore.clear()
      setCfg(null)
      setLocked(false)
    },
    async setBiometric(on) {
      if (!cfg) return false
      if (on && !(await authenticateBiometric(`Ativar ${biometry.label} no Fynvault`))) return false
      await save({ ...cfg, biometric: on })
      return true
    },
    async setTimeoutSec(t) {
      if (cfg) await save({ ...cfg, timeout: t })
    },
    async clear() {
      await secureLockStore.clear()
      setCfg(null)
      setLocked(false)
    },
  }

  // Conteúdo por baixo da tela de bloqueio fica inacessível (toque, teclado e leitor de tela)
  useEffect(() => {
    host.current?.toggleAttribute('inert', locked)
  }, [locked, loaded])

  if (!loaded) return <div className="splash"><div className="spinner" /></div>
  return (
    <Ctx.Provider value={value}>
      <div ref={host} className="lock-host" aria-hidden={locked || undefined}>{children}</div>
      {locked && cfg && <LockScreen />}
    </Ctx.Provider>
  )
}
