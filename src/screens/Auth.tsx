import { useState, type FormEvent } from 'react'
import { Field, Segmented } from '../components/Fields'
import { api } from '../lib/api'

type Mode = 'login' | 'signup' | 'forgot' | 'code' | 'newpass'

export function Auth({ recovering, onRecoveryStart, onRecovered }: {
  recovering?: boolean
  onRecoveryStart?: () => void
  onRecovered?: () => void
}) {
  const [mode, setMode] = useState<Mode>(recovering ? 'newpass' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    if ((mode === 'signup' || mode === 'newpass') && password !== password2) return setError('As senhas não conferem.')
    if ((mode === 'signup' || mode === 'newpass') && password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.')
    setBusy(true)
    try {
      if (mode === 'login') await api.signIn(email.trim(), password)
      else if (mode === 'signup') {
        const r = await api.signUp(email.trim(), password)
        if (r.needsConfirmation) {
          setInfo('Conta criada! Abra o e-mail que enviamos e confirme o endereço. Depois é só entrar aqui.')
          setMode('login')
        }
      } else if (mode === 'forgot') {
        await api.resetPassword(email.trim())
        setInfo('Enviamos um código para o seu e-mail. Digite-o abaixo.')
        setMode('code')
      } else if (mode === 'code') {
        onRecoveryStart?.()
        await api.verifyRecovery(email.trim(), code)
        setMode('newpass')
        setPassword('')
        setPassword2('')
      } else if (mode === 'newpass') {
        await api.updatePassword(password)
        onRecovered?.()
      }
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const title = { login: 'Entrar', signup: 'Criar conta', forgot: 'Recuperar senha', code: 'Digite o código', newpass: 'Nova senha' }[mode]

  return (
    <div className="auth">
      <div className="auth-brand">
        <img src="./icon.svg" alt="" width={72} height={72} />
        <h1>Minhas Finanças</h1>
        <p className="muted">Seus gastos, ganhos e contas sob controle, todos os dias.</p>
      </div>

      <form className="card auth-card" onSubmit={submit}>
        {(mode === 'login' || mode === 'signup') ? (
          <Segmented value={mode} onChange={(m) => { setMode(m); setError(''); setInfo('') }} options={[
            { value: 'login', label: 'Entrar' }, { value: 'signup', label: 'Criar conta' },
          ]} />
        ) : <h2>{title}</h2>}

        {api.mode === 'demo' && (
          <p className="note">
            📱 <b>Modo demonstração:</b> o app ainda não foi ligado à nuvem, então os dados ficam só neste aparelho.
            Digite qualquer e-mail para testar.
          </p>
        )}

        {mode !== 'newpass' && (
          <Field label="E-mail">
            <input type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={mode === 'code'} />
          </Field>
        )}
        {mode === 'code' && (
          <Field label="Código recebido por e-mail">
            <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} maxLength={10} autoFocus />
          </Field>
        )}
        {(mode === 'login' || mode === 'signup' || mode === 'newpass') && (
          <Field label={mode === 'newpass' ? 'Nova senha' : 'Senha'}>
            <input type="password" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        {(mode === 'signup' || mode === 'newpass') && (
          <Field label="Repita a senha">
            <input type="password" required autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </Field>
        )}

        {error && <p className="alert">{error}</p>}
        {info && <p className="note">{info}</p>}

        <button className="btn primary block" disabled={busy}>{busy ? 'Aguarde…' : title}</button>

        {mode === 'login' && api.mode === 'cloud' && (
          <button type="button" className="link center" onClick={() => { setMode('forgot'); setError('') }}>Esqueci minha senha</button>
        )}
        {(mode === 'forgot' || mode === 'code') && (
          <button type="button" className="link center" onClick={() => setMode('login')}>Voltar para o login</button>
        )}
      </form>
    </div>
  )
}
