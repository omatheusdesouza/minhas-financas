import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountSheet, AdjustSheet, TransferSheet, useCash } from '../components/Cash'
import { Icon } from '../components/Icon'
import { PaymentMethodSheet } from '../components/PaymentMethodSheet'
import type { AccountBalance } from '../lib/cash'
import { fmt, today } from '../lib/dates'
import { money } from '../lib/format'
import { useApp } from '../store'

/** Caixa: quanto há em cada conta e no total. */
export function CashScreen() {
  const { canEdit } = useApp()
  const { data } = useCash()
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<AccountBalance | null>(null)
  const [sheet, setSheet] = useState<'transfer' | 'adjust' | null>(null)

  const active = data?.accounts.filter((a) => !a.account.archived) ?? []
  const archived = data?.accounts.filter((a) => a.account.archived && Math.abs(a.balance) >= 0.005) ?? []

  return (
    <div className="screen narrow cash-screen">
      <header className="top">
        <Link to="/" className="icon-btn back-home" aria-label="Voltar"><Icon name="left" /></Link>
        <h1>Caixa</h1>
        {canEdit && data?.ok ? <button className="btn ghost" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> Conta</button> : <span />}
      </header>

      {!data ? <div className="skeleton tall" /> : !data.ok ? (
        <p className="note">Para usar o Caixa, o banco de dados precisa da atualização <b>0009</b> (arquivo <b>supabase/migrations/0009_caixa_contas.sql</b> no SQL Editor do Supabase).</p>
      ) : !active.length ? (
        <section className="card cash-empty">
          <span className="goal-icon">🏦</span>
          <h3>Monte seu caixa</h3>
          <p className="muted">Cadastre cada conta (Nubank, Itaú, Carteira…) com o saldo exato de hoje. Depois, ao lançar um gasto ou um ganho, escolha a conta: o saldo e o total se atualizam sozinhos.</p>
          {canEdit && <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> Adicionar a primeira conta</button>}
        </section>
      ) : (
        <>
          <section className="card hero cash-hero">
            <p className="hero-label">Total em caixa</p>
            <p className={`hero-value ${data.total < 0 ? 'neg' : ''}`}>{money(data.total)}</p>
            <p className="hero-foot muted">{active.length} conta(s) · atualizado em {fmt.day(today())}</p>
          </section>

          {canEdit && (
            <div className="btn-row cash-actions">
              <button className="btn ghost grow" onClick={() => setSheet('transfer')} disabled={active.length < 2} title={active.length < 2 ? 'Cadastre ao menos duas contas' : undefined}>⇄ Transferir</button>
              <button className="btn ghost grow" onClick={() => setSheet('adjust')}>⚖︎ Ajustar saldo</button>
            </div>
          )}

          <section className="card flush">
            {active.map((a) => <AccountRow key={a.account.id} a={a} onOpen={() => setOpen(a)} />)}
          </section>
          {archived.length > 0 && (
            <>
              <p className="muted small">Arquivadas com saldo (fora do total)</p>
              <section className="card flush dim">{archived.map((a) => <AccountRow key={a.account.id} a={a} onOpen={() => setOpen(a)} />)}</section>
            </>
          )}
          <p className="muted small">
            Ao lançar, escolha a conta em <b>Conta ou forma de pagamento</b>. Contas pagas por boleto ou Pix e faturas do cartão perguntam de qual conta saiu na hora de pagar.
          </p>
        </>
      )}

      {creating && <PaymentMethodSheet method={{ type: 'account' }} onClose={() => setCreating(false)} />}
      {open && data && <AccountSheet cash={data} item={data.accounts.find((a) => a.account.id === open.account.id) ?? open} onClose={() => setOpen(null)} />}
      {sheet === 'transfer' && <TransferSheet onClose={() => setSheet(null)} />}
      {sheet === 'adjust' && data && <AdjustSheet cash={data} onClose={() => setSheet(null)} />}
    </div>
  )
}

function AccountRow({ a, onOpen }: { a: AccountBalance; onOpen: () => void }) {
  return (
    <button className="tx-main list-btn" onClick={onOpen}>
      <span className="tx-icon">🏦</span>
      <span className="tx-text">
        <span className="tx-desc">{a.account.name}</span>
        <span className="tx-meta">desde {fmt.short(a.account.opening_date ?? today())}</span>
      </span>
      <span className="tx-right"><span className={`tx-amount ${a.balance < 0 ? 'neg' : ''}`}>{money(a.balance)}</span></span>
      <Icon name="right" size={16} />
    </button>
  )
}
