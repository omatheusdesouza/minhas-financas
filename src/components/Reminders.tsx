import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import {
  permissionState, remindersEnabled, remindersSupported, requestPermission, setRemindersEnabled, syncReminders,
  testNotification, type PermissionState,
} from '../lib/notify'
import { useApp } from '../store'
import { Field, Toggle } from './Fields'

export const REMINDER_RULES = [
  ['📝', '10 dias antes', 'lembrete diário para informar o valor das contas variáveis (água, energia…), até você preencher'],
  ['⚠️', '2 dias antes', 'alerta crítico de que a conta está perto de vencer'],
  ['📅', 'No dia', 'aviso de que a conta vence hoje'],
  ['🔴', 'Depois do vencimento', 'alerta diário de conta vencida, até você marcar como paga'],
  ['💰', 'Todo mês', 'lembrete do aporte na sua meta de economia'],
] as const

export function ReminderRules() {
  return (
    <ul className="rules">
      {REMINDER_RULES.map(([icon, when, what]) => (
        <li key={when}><span>{icon}</span><div><b>{when}</b><p className="muted small">{what}</p></div></li>
      ))}
    </ul>
  )
}

export function BatteryTip() {
  if (Capacitor.getPlatform() !== 'android') return null
  return (
    <p className="note small">
      🔋 Alguns celulares (Xiaomi, Samsung, Motorola…) atrasam notificações para economizar bateria. Se os lembretes
      não chegarem, abra <b>Configurações › Apps › Fynvault › Bateria</b> e escolha <b>Sem restrições</b>.
    </p>
  )
}

/** Pede a permissão de notificações. Devolve o estado final. */
export function useReminderPermission() {
  const [state, setState] = useState<PermissionState | null>(null)
  useEffect(() => {
    permissionState().then(setState).catch(() => setState('unsupported'))
  }, [])
  async function ask() {
    const s = await requestPermission().catch(() => 'denied' as const)
    setState(s)
    if (s === 'granted') {
      setRemindersEnabled(true)
      await syncReminders().catch(() => 0)
    }
    return s
  }
  return { state, ask }
}

export function PermissionHelp({ state }: { state: PermissionState | null }) {
  if (state === 'denied') {
    return (
      <p className="alert small">
        As notificações estão bloqueadas. Para ativar: <b>Configurações do celular › Apps › Fynvault › Notificações</b> e ligue.
      </p>
    )
  }
  if (state === 'unsupported') {
    return <p className="note small">Os lembretes funcionam no app instalado no celular (Android ou iPhone).</p>
  }
  return null
}

/** Seção "Lembretes" em Ajustes. */
export function ReminderSettings() {
  const { profile, run, reloadProfile, toast } = useApp()
  const { state, ask } = useReminderPermission()
  const [enabled, setEnabled] = useState(remindersEnabled())
  const [time, setTime] = useState((profile?.reminder_time ?? '09:00').slice(0, 5))
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (state === 'granted' && enabled) syncReminders().then(setCount).catch(() => setCount(null))
  }, [state, enabled])

  async function saveTime(v: string) {
    setTime(v)
    if (!/^\d{2}:\d{2}$/.test(v) || !profile) return
    await run(async () => {
      await api.saveProfile({ ...profile, reminder_time: v })
      await reloadProfile()
      setCount(await syncReminders())
    }, 'Horário dos lembretes atualizado')
  }

  return (
    <section className="card">
      <div className="card-title"><h3>Lembretes</h3></div>
      {remindersSupported() && state !== 'granted' ? (
        <>
          <p className="muted small">Ative para receber avisos das contas mesmo com o app fechado.</p>
          <button className="btn primary block" onClick={ask}>🔔 Permitir notificações</button>
          <PermissionHelp state={state} />
        </>
      ) : (
        <>
          <Toggle checked={enabled} onChange={async (v) => {
            setEnabled(v)
            setRemindersEnabled(v)
            const n = await syncReminders().catch(() => 0)
            setCount(n)
            toast(v ? 'Lembretes ativados' : 'Lembretes desativados')
          }} label="Receber lembretes de contas e metas" />
          {!remindersSupported() && <PermissionHelp state="unsupported" />}
        </>
      )}
      <Field label="Horário dos lembretes" hint="Todos os avisos chegam neste horário.">
        <input type="time" value={time} onChange={(e) => saveTime(e.target.value)} />
      </Field>
      <details className="rules-box">
        <summary>Quando os lembretes chegam</summary>
        <ReminderRules />
      </details>
      {state === 'granted' && enabled && (
        <div className="btn-row">
          <button className="btn ghost" onClick={async () => {
            await testNotification().catch((e) => toast(String(e?.message ?? e), 'error'))
            toast('Notificação de teste em 5 segundos. Pode fechar o app.')
          }}>Enviar notificação de teste</button>
          {count != null && <span className="muted small">{count} lembrete(s) agendado(s) para os próximos 30 dias</span>}
        </div>
      )}
      <BatteryTip />
    </section>
  )
}
