import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../store'

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '')

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

/** Faixa discreta: só aparece sem internet ou com alterações aguardando envio. */
export function SyncBanner() {
  const { sync } = useApp()
  const online = useOnline()
  if (!sync) return null
  const offline = !online || sync.state === 'offline'
  if (!offline && sync.pending === 0) return null
  return (
    <div className={`sync-banner ${offline ? 'off' : ''}`} role="status">
      <span className="sync-dot" />
      {offline
        ? <>Sem internet{sync.pending ? ` · ${sync.pending} alteração(ões) aguardando` : ' · seus dados estão salvos no aparelho'}</>
        : <>Enviando {sync.pending} alteração(ões)…</>}
    </div>
  )
}

/** Seção em Ajustes com o estado da sincronização. */
export function SyncSettings() {
  const { sync, toast } = useApp()
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  if (!sync) return null
  const offline = !online || sync.state === 'offline'
  const text = offline ? 'Sem internet. As alterações ficam salvas no aparelho e são enviadas quando a conexão voltar.'
    : sync.state === 'syncing' ? 'Sincronizando…'
      : sync.pending ? `${sync.pending} alteração(ões) aguardando envio.`
        : sync.lastSync ? `Tudo sincronizado ✓ (às ${hhmm(sync.lastSync)})` : 'Tudo sincronizado ✓'
  return (
    <section className="card">
      <div className="card-title"><h3>Sincronização</h3></div>
      <p className="small"><span className={`sync-dot inline ${offline ? 'off' : sync.pending ? 'wait' : 'ok'}`} /> {text}</p>
      <button className="btn ghost" disabled={busy || offline} onClick={async () => {
        setBusy(true)
        const ok = await api.sync?.()
        setBusy(false)
        toast(ok ? 'Sincronizado ✓' : 'Não foi possível sincronizar agora.', ok ? 'ok' : 'error')
      }}>{busy ? 'Sincronizando…' : 'Sincronizar agora'}</button>
    </section>
  )
}
