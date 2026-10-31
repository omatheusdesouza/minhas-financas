import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { cardMap, groupInvoices, limitUsed, type Card } from '../lib/cards'
import { addMonths, parse, today } from '../lib/dates'
import { cardsAvailable } from '../lib/features'
import { money, pct } from '../lib/format'
import type { RecurringBill, Transaction } from '../lib/types'
import { useApp, useLoad } from '../store'
import { Icon } from './Icon'
import { InvoiceRow, InvoiceSheet } from './Invoice'
import { PaymentMethodSheet } from './PaymentMethodSheet'

/** Contas › Cartões: cada cartão com limite, fatura atual, próximas faturas (parcelas) e histórico. */
export function CardsTab() {
  const { paymentMethods, canEdit, run } = useApp()
  const [creating, setCreating] = useState(false)
  const { data } = useLoad(async () => {
    const ok = await cardsAvailable()
    if (!ok) return { ok, txs: [] as Transaction[], recurring: [] as RecurringBill[] }
    const [txs, recurring] = await Promise.all([api.listTransactions(addMonths(today(), -6), addMonths(today(), 36)), api.listRecurring()])
    return { ok, txs, recurring }
  }, [])
  if (!data) return <div className="skeleton tall" />
  if (!data.ok) {
    return (
      <p className="note">
        Para usar cartões com fatura, o banco de dados precisa da atualização <b>0007</b>: no Supabase, abra o SQL Editor e rode
        o arquivo <code>supabase/migrations/0007_cartao_credito.sql</code>. Depois, feche e abra o app.
      </p>
    )
  }
  const cards = [...cardMap(paymentMethods).values()].filter((c) => !c.archived)
  // conta fixa "Cartão de crédito" do primeiro acesso contaria a fatura duas vezes
  const oldBill = cards.length ? data.recurring.find((r) => r.active && r.kind === 'expense' && /cart[aã]o/i.test(r.description)) : undefined

  return (
    <>
      {canEdit && <button className="btn primary block" onClick={() => setCreating(true)}><Icon name="plus" /> Novo cartão de crédito</button>}
      {oldBill && canEdit && (
        <div className="note small">
          Você tem a conta fixa <b>{oldBill.description}</b>. Agora que as compras no cartão formam a fatura sozinhas, ela contaria a
          fatura duas vezes.{' '}
          <button className="link" onClick={() => {
            if (!confirm(`Desativar a conta fixa "${oldBill.description}"? Os meses que já foram lançados continuam.`)) return
            run(() => api.saveRecurring({ ...oldBill, active: false }), 'Conta fixa desativada')
          }}>Desativar</button>
        </div>
      )}
      {cards.length === 0 && (
        <p className="empty">Cadastre seu cartão com o dia de fechamento e de vencimento. As compras feitas nele entram sozinhas na
          fatura certa e você paga a fatura de uma vez. Dá também para transformar uma forma de pagamento que já existe em
          <Link to="/ajustes/pagamentos" className="link"> Ajustes › Formas de pagamento</Link>.</p>
      )}
      {cards.map((c) => <CardBlock key={c.id} card={c} txs={data.txs} />)}
      {creating && <PaymentMethodSheet method={{ type: 'credit_card' }} onClose={() => setCreating(false)} />}
    </>
  )
}

const monthName = (d: string) => parse(d).toLocaleDateString('pt-BR', { month: 'long' })

function CardBlock({ card, txs }: { card: Card; txs: Transaction[] }) {
  const { openEditor, canEdit } = useApp()
  const [editing, setEditing] = useState(false)
  const [showPaid, setShowPaid] = useState(false)
  const [paying, setPaying] = useState(false)
  const t = today()
  const invoices = groupInvoices(txs.filter((x) => x.payment_method_id === card.id), new Map([[card.id, card]]), t)
  const pending = invoices.filter((i) => i.pending > 0)
  const paid = invoices.filter((i) => i.pending === 0).reverse()
  const current = pending[0]
  const used = limitUsed(card, txs)
  const limit = card.credit_limit ?? 0

  return (
    <section className="card card-block">
      <div className="card-title">
        <div className="goal-top">
          <span className="goal-icon">💳</span>
          <div>
            <strong>{card.name}</strong>
            <span className="muted small"> · fecha dia {card.closing_day} · vence dia {card.due_day}</span>
          </div>
        </div>
        {canEdit && <button className="icon-btn" aria-label="Editar cartão" onClick={() => setEditing(true)}><Icon name="edit" /></button>}
      </div>

      {limit > 0 && (
        <div className="limit">
          <div className="factor-top"><span>Limite usado</span><span>{money(used)} de {money(limit)}</span></div>
          <span className="bar"><span style={{ width: `${Math.min(100, (used / limit) * 100)}%`, background: used > limit * 0.9 ? 'var(--bad)' : used > limit * 0.7 ? 'var(--warn)' : 'var(--good)' }} /></span>
          <span className="muted small">Disponível: <b>{money(Math.max(0, limit - used))}</b> ({pct(Math.max(0, limit - used) / limit)}) · conta as parcelas futuras</span>
        </div>
      )}

      {current ? (
        <>
          <div className="card flush"><InvoiceRow inv={current} title={`Fatura de ${monthName(current.due)}`} hidePay /></div>
          {canEdit && <button className="btn primary" onClick={() => setPaying(true)}>Pagar fatura · {money(current.pending)}</button>}
        </>
      ) : <p className="muted small">Nenhuma fatura em aberto.</p>}

      {pending.length > 1 && (
        <details className="rules-box">
          <summary>Próximas faturas ({pending.length - 1}) · {money(pending.slice(1).reduce((s, i) => s + i.pending, 0))}</summary>
          <div className="card flush">{pending.slice(1).map((inv) => <InvoiceRow key={inv.due} inv={inv} title={`Fatura de ${monthName(inv.due)}`} hidePay />)}</div>
        </details>
      )}
      {paid.length > 0 && (
        <button className="link" onClick={() => setShowPaid((v) => !v)}>{showPaid ? 'Esconder faturas pagas' : `Faturas pagas (${paid.length})`}</button>
      )}
      {showPaid && <div className="card flush">{paid.map((inv) => <InvoiceRow key={inv.due} inv={inv} title={`Fatura de ${monthName(inv.due)}`} />)}</div>}

      {canEdit && (
        <button className="btn ghost" onClick={() => openEditor({ kind: 'expense', payment_method_id: card.id, paid: false })}>
          <Icon name="plus" size={18} /> Compra neste cartão
        </button>
      )}
      {editing && <PaymentMethodSheet method={card} onClose={() => setEditing(false)} />}
      {paying && current && <InvoiceSheet inv={current} startPaying onClose={() => setPaying(false)} />}
    </section>
  )
}
