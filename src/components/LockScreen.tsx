import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useLock } from '../lockContext'
import { useApp } from '../store'
import { MyAvatar } from './Avatar'
import { PinPad } from './PinPad'

export function LockScreen() {
  const { cfg, biometry, unlockPin, unlockBiometric, clear } = useLock()
  const { profile } = useApp()
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState(false)
  const [wait, setWait] = useState(() => Math.max(0, Math.ceil(((cfg?.lockedUntil ?? 0) - Date.now()) / 1000)))
  const [busy, setBusy] = useState(false)
  const asked = useRef(false)
  const useBio = Boolean(cfg?.biometric && biometry.available)

  // Ao aparecer, já pede a biometria (se ativada)
  useEffect(() => {
    if (useBio && !asked.current && wait === 0) {
      asked.current = true
      unlockBiometric()
    }
  }, [useBio, unlockBiometric, wait])

  useEffect(() => {
    if (wait <= 0) return
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000)
    return () => clearInterval(t)
  }, [wait])

  async function submit(v: string) {
    setBusy(true)
    const r = await unlockPin(v)
    setBusy(false)
    if (r.ok) return
    setPin('')
    setError(true)
    setTimeout(() => setError(false), 450)
    if (r.waitSeconds > 0) {
      setWait(r.waitSeconds)
      setMsg('Muitas tentativas erradas.')
    } else {
      setMsg(r.attemptsLeft > 0 ? `PIN incorreto. ${r.attemptsLeft} tentativa(s) antes de uma pausa.` : 'PIN incorreto.')
    }
  }

  async function forgot() {
    if (!confirm('Para criar um novo PIN, você vai sair da conta e entrar de novo com seu e-mail e senha. Seus dados continuam salvos na nuvem. Continuar?')) return
    await clear()
    await api.signOut()
  }

  const mm = Math.floor(wait / 60)
  const ss = String(wait % 60).padStart(2, '0')

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-label="App bloqueado">
      <img className="lock-logo logo-light" src="./brand/logo-horizontal.svg" alt="Fynvault" />
      <img className="lock-logo logo-dark" src="./brand/logo-horizontal-dark.svg" alt="Fynvault" />
      <div className="lock-user">
        <MyAvatar size={64} />
        <p>Olá, <b>{profile?.display_name}</b></p>
        <p className="muted small">{wait > 0 ? `Tente de novo em ${mm ? `${mm}:${ss}` : `${wait}s`}` : 'Digite seu PIN para entrar'}</p>
      </div>
      <PinPad
        value={pin} length={cfg?.pinLength ?? 4} onChange={(v) => { setPin(v); if (v) setMsg('') }}
        onComplete={submit} disabled={busy || wait > 0} error={error}
        extra={useBio && (
          <button type="button" className="pin-bio" onClick={() => unlockBiometric()} disabled={wait > 0}
            aria-label={`Usar ${biometry.label}`}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M12 11v3M8.5 8.5a5 5 0 0 1 8.5 3.5c0 2-.5 4-1.5 5.5M7 12c0 1.5-.3 3-1 4.3M12 6a6 6 0 0 0-6 6M18.5 15c.3-1 .5-2 .5-3a7 7 0 0 0-14 0M10 20c1.2-1.8 2-4 2-6.5" />
            </svg>
          </button>
        )}
      />
      <p className={`lock-msg ${msg ? 'show' : ''}`} role="alert">{msg}</p>
      <button type="button" className="link" onClick={forgot}>Esqueci o PIN</button>
    </div>
  )
}
