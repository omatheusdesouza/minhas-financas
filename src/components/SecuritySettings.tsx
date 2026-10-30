import { useState } from 'react'
import { pinProblem, TIMEOUT_OPTIONS, type LockTimeout } from '../lib/lock'
import { useLock } from '../lockContext'
import { useApp } from '../store'
import { Field, Segmented, Toggle } from './Fields'
import { PinPad } from './PinPad'
import { Sheet } from './Sheet'

type Flow = null | 'create' | 'change' | 'disable'

export function SecuritySettings() {
  const { cfg, biometry, setBiometric, setTimeoutSec } = useLock()
  const { toast } = useApp()
  const [flow, setFlow] = useState<Flow>(null)
  const on = Boolean(cfg?.enabled)

  return (
    <section className="card">
      <div className="card-title"><h3>Segurança</h3></div>
      <Toggle checked={on} onChange={(v) => setFlow(v ? 'create' : 'disable')} label="Bloquear o Fynvault com PIN" />
      <p className="muted small">O app pede o PIN ao abrir. O PIN fica só neste celular, no armazenamento seguro do sistema.</p>
      {on && cfg && (
        <>
          {biometry.available ? (
            <Toggle checked={cfg.biometric} label={`Desbloquear com ${biometry.label}`} onChange={async (v) => {
              const ok = await setBiometric(v)
              if (!ok && v) toast(`Não foi possível confirmar a ${biometry.label}.`, 'error')
              else toast(v ? `${biometry.label} ativada` : `${biometry.label} desativada`)
            }} />
          ) : (
            <p className="note small">Para desbloquear com digital ou rosto, cadastre a biometria nas configurações do celular.</p>
          )}
          <Field label="Pedir o PIN de novo ao voltar para o app">
            <Segmented value={String(cfg.timeout) as `${LockTimeout}`} onChange={async (v) => {
              await setTimeoutSec(Number(v) as LockTimeout)
              toast('Preferência salva')
            }} options={TIMEOUT_OPTIONS.map((o) => ({ value: String(o.value) as `${LockTimeout}`, label: o.label }))} />
          </Field>
          <button className="btn ghost" onClick={() => setFlow('change')}>Trocar PIN</button>
        </>
      )}
      {flow && <PinFlow flow={flow} onClose={() => setFlow(null)} />}
    </section>
  )
}

/** Criar, trocar ou desativar o PIN (trocar e desativar pedem o PIN atual). */
function PinFlow({ flow, onClose }: { flow: Exclude<Flow, null>; onClose: () => void }) {
  const { cfg, enable, disable, checkPin } = useLock()
  const { toast } = useApp()
  const needsCurrent = flow !== 'create'
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>(needsCurrent ? 'current' : 'new')
  const [length, setLength] = useState<4 | 6>(cfg?.pinLength ?? 4)
  const [pin, setPin] = useState('')
  const [first, setFirst] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState(false)

  const fail = (m: string) => {
    setMsg(m)
    setPin('')
    setError(true)
    setTimeout(() => setError(false), 450)
  }

  async function complete(v: string) {
    if (step === 'current') {
      const r = await checkPin(v)
      if (!r.ok) return fail(r.waitSeconds ? `Muitas tentativas. Aguarde ${r.waitSeconds}s.` : 'PIN atual incorreto.')
      if (flow === 'disable') {
        await disable()
        toast('Bloqueio desativado')
        return onClose()
      }
      setPin(''); setMsg(''); setStep('new')
    } else if (step === 'new') {
      const p = pinProblem(v, length)
      if (p) return fail(p)
      setFirst(v); setPin(''); setMsg(''); setStep('confirm')
    } else {
      if (v !== first) {
        setStep('new'); setFirst('')
        return fail('Os PINs não conferem. Digite o novo PIN de novo.')
      }
      await enable(v, length)
      toast(flow === 'create' ? 'Bloqueio ativado 🔒' : 'PIN alterado')
      onClose()
    }
  }

  const title = flow === 'create' ? 'Criar PIN' : flow === 'change' ? 'Trocar PIN' : 'Desativar bloqueio'
  const prompt = step === 'current' ? 'Digite seu PIN atual' : step === 'new' ? `Escolha um PIN de ${length} números` : 'Digite o PIN de novo para confirmar'
  const len = step === 'current' ? cfg?.pinLength ?? 4 : length

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="center pin-prompt">{prompt}</p>
      {step === 'new' && (
        <Segmented value={String(length) as '4' | '6'} onChange={(v) => { setLength(Number(v) as 4 | 6); setPin('') }}
          options={[{ value: '4', label: '4 números' }, { value: '6', label: '6 números' }]} />
      )}
      <PinPad value={pin} length={len} onChange={(v) => { setPin(v); if (v) setMsg('') }} onComplete={complete} error={error} />
      <p className={`lock-msg ${msg ? 'show' : ''}`} role="alert">{msg}</p>
      {step !== 'current' && <p className="muted small center">Evite datas de aniversário, 0000 ou 1234.</p>}
    </Sheet>
  )
}
