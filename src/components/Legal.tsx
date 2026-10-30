import { useState } from 'react'
import { api } from '../lib/api'
import type { User } from '../lib/backend'
import { CONTROLLER, LEGAL_DATE, LEGAL_VERSION, PRIVACY, TERMS, type LegalSection } from '../lib/legal'
import { Sheet } from './Sheet'

export type LegalDoc = 'privacy' | 'terms'

/** Política de Privacidade ou Termos de Uso, em painel. */
export function LegalSheet({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const sections: LegalSection[] = doc === 'privacy' ? PRIVACY : TERMS
  return (
    <Sheet title={doc === 'privacy' ? 'Política de Privacidade' : 'Termos de Uso'} onClose={onClose}>
      <p className="muted small">Versão de {LEGAL_DATE} · Responsável: {CONTROLLER.name} · {CONTROLLER.email}</p>
      <div className="legal">
        {sections.map((s) => (
          <section key={s.title}>
            <h3>{s.title}</h3>
            {s.body.map((b, i) => Array.isArray(b)
              ? <ul key={i}>{b.map((li) => <li key={li}>{li}</li>)}</ul>
              : <p key={i}>{b}</p>)}
          </section>
        ))}
      </div>
    </Sheet>
  )
}

/** Links "Termos de Uso · Política de Privacidade" que abrem os textos. */
export function LegalLinks({ prefix }: { prefix?: string }) {
  const [doc, setDoc] = useState<LegalDoc | null>(null)
  return (
    <>
      <span>
        {prefix}
        <button type="button" className="link" onClick={() => setDoc('terms')}>Termos de Uso</button>
        {' e a '}
        <button type="button" className="link" onClick={() => setDoc('privacy')}>Política de Privacidade</button>
      </span>
      {doc && <LegalSheet doc={doc} onClose={() => setDoc(null)} />}
    </>
  )
}

/** Caixa obrigatória de aceite. */
export function AcceptBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="accept-box">
      <input id="accept-terms" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor="accept-terms" className="small"><LegalLinks prefix="Li e aceito os " /></label>
    </div>
  )
}

/** Pede o aceite quando a pessoa ainda não aceitou a versão atual (contas antigas ou textos atualizados). */
export function TermsGate({ user, onSkip }: { user: User; onSkip: () => void }) {
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const updated = !!user.termsVersion

  async function accept() {
    setBusy(true)
    setError('')
    try {
      await api.acceptTerms(LEGAL_VERSION)
    } catch (e: any) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) onSkip()
      else setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <img className="logo-light" src="./brand/logo-horizontal.svg" alt="Fynvault · Personal finance" />
        <img className="logo-dark" src="./brand/logo-horizontal-dark.svg" alt="Fynvault · Personal finance" />
      </div>
      <div className="card auth-card">
        <h2>{updated ? 'Atualizamos nossos termos' : 'Sua privacidade'}</h2>
        <p className="small">
          {updated
            ? 'Os Termos de Uso e a Política de Privacidade mudaram. Leia e aceite a nova versão para continuar.'
            : 'Explicamos quais dados o Fynvault guarda, para quê, onde ficam e como você pode baixá-los ou apagá-los a qualquer momento, como garante a LGPD.'}
        </p>
        <AcceptBox checked={ok} onChange={setOk} />
        {error && <p className="alert">{error}</p>}
        <button className="btn primary block" disabled={!ok || busy} onClick={accept}>{busy ? 'Aguarde…' : 'Aceitar e continuar'}</button>
        <button className="link center" onClick={() => api.signOut()}>Sair da conta</button>
      </div>
    </div>
  )
}
