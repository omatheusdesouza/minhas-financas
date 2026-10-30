import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { saveFile } from '../lib/exporter'
import { LEGAL_VERSION } from '../lib/legal'
import { useLock } from '../lockContext'
import { useApp } from '../store'
import { Icon } from './Icon'
import { LegalSheet, type LegalDoc } from './Legal'
import { Sheet } from './Sheet'

/** Ajustes › Privacidade e dados: direitos do titular (LGPD, art. 18) dentro do app. */
export function PrivacySettings() {
  const { user, run, space } = useApp()
  const [doc, setDoc] = useState<LegalDoc | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function exportAll() {
    await run(async () => {
      const [categories, payment_methods, transactions, installment_plans, recurring_bills, profile, savings_goals, goal_contributions] =
        await Promise.all([
          api.listCategories(), api.listPaymentMethods(), api.listTransactions('1900-01-01', '2999-12-31'),
          api.listPlans(), api.listRecurring(), api.getProfile(), api.listGoals('own'), api.listContributions(),
        ])
      let family: unknown = null
      if (api.family?.available()) family = await api.family.members().catch(() => 'indisponível sem internet')
      const data = {
        exported_at: new Date().toISOString(),
        account: {
          id: user.id, email: user.email,
          terms_version: user.termsVersion ?? null, terms_accepted_at: user.termsAcceptedAt ?? null,
        },
        profile, categories, payment_methods, transactions, installment_plans, recurring_bills,
        savings_goals, goal_contributions, family_sharing: family,
      }
      await saveFile(`meus_dados_fynvault_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')
    }, 'Arquivo com seus dados gerado')
  }

  const accepted = user.termsAcceptedAt
    ? new Date(user.termsAcceptedAt).toLocaleDateString('pt-BR')
    : null

  return (
    <>
      <section className="card flush menu privacy-card">
        <div className="menu-head">
          <h3>Privacidade e dados</h3>
          <p className="muted small">
            Seus direitos pela LGPD.{accepted && user.termsVersion === LEGAL_VERSION ? ` Termos aceitos em ${accepted}.` : ''}
          </p>
        </div>
        <button onClick={() => setDoc('privacy')}><Icon name="user" /> Política de Privacidade <Icon name="right" className="end" /></button>
        <button onClick={() => setDoc('terms')}><Icon name="list" /> Termos de Uso <Icon name="right" className="end" /></button>
        {space.role ? (
          <p className="muted small menu-note">Para baixar ou excluir os seus dados, abra "Minhas finanças" no seletor de espaço.</p>
        ) : (
          <>
            <button onClick={exportAll}><Icon name="download" /> Baixar todos os meus dados (JSON) <Icon name="right" className="end" /></button>
            <Link to="/ajustes/familia"><span className="menu-emoji">👥</span> Quem acessa meus dados <Icon name="right" className="end" /></Link>
            <button className="danger-text" onClick={() => setDeleting(true)}><Icon name="trash" /> Excluir minha conta <Icon name="right" className="end" /></button>
          </>
        )}
      </section>
      {/* fora do cartão: os estilos do menu não podem vazar para os painéis */}
      {doc && <LegalSheet doc={doc} onClose={() => setDoc(null)} />}
      {deleting && <DeleteAccountSheet onClose={() => setDeleting(false)} />}
    </>
  )
}

function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const { sync } = useApp()
  const lock = useLock()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ready = typed.trim().toUpperCase() === 'EXCLUIR'

  async function confirmDelete() {
    setBusy(true)
    setError('')
    try {
      await api.deleteAccount()
      await lock.clear().catch(() => {})
      // recomeça o app do zero, sem nada da conta na memória
      location.reload()
    } catch (e: any) {
      setError(e?.message ?? String(e))
      setBusy(false)
    }
  }

  return (
    <Sheet title="Excluir minha conta" onClose={busy ? () => {} : onClose} footer={
      <>
        <button className="btn ghost" disabled={busy} onClick={onClose}>Cancelar</button>
        <button className="btn danger-fill grow" disabled={!ready || busy} onClick={confirmDelete}>
          {busy ? 'Excluindo…' : 'Excluir para sempre'}
        </button>
      </>
    }>
      <p className="alert"><Icon name="alert" size={18} /> Esta ação não pode ser desfeita.</p>
      <p className="small">Serão apagados agora, da nuvem e deste aparelho:</p>
      <ul className="tips">
        <li>sua conta de acesso (e-mail e senha);</li>
        <li>perfil, foto e todos os comprovantes anexados;</li>
        <li>lançamentos, contas fixas, parcelas, categorias, formas de pagamento, metas e aportes;</li>
        <li>os compartilhamentos do modo família: quem via suas finanças perde o acesso, e você sai dos espaços de outras pessoas.</li>
      </ul>
      {(sync?.pending ?? 0) > 0 && (
        <p className="note small">Há {sync!.pending} alteração(ões) ainda não enviadas; elas também serão descartadas.</p>
      )}
      <p className="small">Se quiser guardar uma cópia, use antes "Baixar todos os meus dados".</p>
      <label className="field">
        <span className="field-label">Para confirmar, digite EXCLUIR</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" disabled={busy} />
      </label>
      {error && <p className="alert">{error}</p>}
    </Sheet>
  )
}
