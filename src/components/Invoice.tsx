import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { cardMap, invoiceLabel, splitCardPurchases, type Invoice } from '../lib/cards'
import { fmt, today } from '../lib/dates'
import { dueStatus } from '../lib/due'
import { money } from '../lib/format'
import { prepareUpload } from '../lib/images'
import { amt, type PaymentMethod, type Transaction } from '../lib/types'
import { useApp } from '../store'
import { Field } from './Fields'
import { Icon } from './Icon'
import { PayAccountField, usePayAccount } from './PayAccount'
import { Sheet } from './Sheet'
import { TxRow } from './TxRow'

/** Linha de uma fatura (no lugar das compras do cartão, uma por uma). title/hidePay: na tela do próprio cartão. */
export function InvoiceRow({ inv, title, hidePay }: { inv: Invoice; title?: string; hidePay?: boolean }) {
  const { canEdit } = useApp()
  const [open, setOpen] = useState<'view' | 'pay' | null>(null)
  const due = inv.pending > 0 ? dueStatus({ date: inv.due, paid: false }) : null
  return (
    <div className={`tx-row invoice-row ${due ? `due-${due.tone}` : ''}`}>
      <button className="tx-main" onClick={() => setOpen('view')}>
        <span className="tx-icon">💳</span>
        <span className="tx-text">
          <span className="tx-desc">{title ?? `Fatura ${inv.card.name}`}</span>
          <span className="tx-meta">
            vence {fmt.short(inv.due)} · {invoiceLabel(inv.status).toLowerCase()} · {inv.items.length} compra{inv.items.length === 1 ? '' : 's'}
          </span>
        </span>
        <span className="tx-right">
          <span className="tx-amount neg">− {money(inv.pending > 0 ? inv.pending : inv.total)}</span>
          {due ? <span className={`chip ${due.tone}`}>{due.label}</span>
            : <span className="chip good">Paga</span>}
        </span>
      </button>
      {canEdit && inv.pending > 0 && !hidePay && (
        <button className="btn ghost sm-btn pay-invoice" onClick={() => setOpen('pay')}>Pagar</button>
      )}
      {open && <InvoiceSheet inv={inv} startPaying={open === 'pay'} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Compras da fatura e o pagamento dela. */
export function InvoiceSheet({ inv, startPaying, onClose }: { inv: Invoice; startPaying?: boolean; onClose: () => void }) {
  const { run, canEdit } = useApp()
  const [paying, setPaying] = useState(Boolean(startPaying))
  const [paidAt, setPaidAt] = useState(today())
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const unpaid = inv.items.filter((t) => !t.paid)
  // a fatura sai do caixa no dia em que é paga, pela conta escolhida
  const account = usePayAccount(inv.card.id, unpaid[0]?.paid_from)

  async function pay() {
    if (busy || !unpaid.length || paidAt > today()) return
    setBusy(true)
    const ok = await run(async () => {
      let receipt_path: string | undefined
      if (file) receipt_path = await api.uploadFile('receipts', 'fatura', await prepareUpload(file, 1800, 0.8))
      await api.updateTransactions(unpaid.map((t) => t.id), { paid: true, paid_at: paidAt, ...(receipt_path ? { receipt_path } : {}), ...account.patch() })
      return true
    }, 'Fatura paga ✓')
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Sheet title={`💳 Fatura ${inv.card.name}`} onClose={onClose} footer={canEdit && inv.pending > 0 ? (
      paying
        ? <button className="btn primary grow" disabled={busy || paidAt > today()} onClick={pay}>{busy ? 'Salvando…' : `Confirmar pagamento de ${money(inv.pending)}`}</button>
        : <button className="btn primary grow" onClick={() => setPaying(true)}>Pagar fatura</button>
    ) : undefined}>
      <div className="invoice-head">
        <div><span className="muted small">Total</span><strong>{money(inv.total)}</strong></div>
        <div><span className="muted small">Fecha</span><strong>{fmt.day(inv.closing)}</strong></div>
        <div><span className="muted small">Vence</span><strong>{fmt.day(inv.due)}</strong></div>
      </div>
      <p className="small"><span className={`chip ${inv.status === 'overdue' ? 'bad' : inv.status === 'paid' ? 'good' : inv.status === 'closed' ? 'warn' : ''}`}>{invoiceLabel(inv.status)}</span>
        {inv.pending > 0 && inv.pending !== inv.total && <span className="muted"> · falta pagar {money(inv.pending)}</span>}</p>

      {paying && inv.pending > 0 && (
        <div className="card inset">
          <Field label="Pago em"><input type="date" value={paidAt} max={today()} onChange={(e) => e.target.value && setPaidAt(e.target.value)} /></Field>
          <PayAccountField income={false} state={account} />
          <Field label="Comprovante (opcional)">
            <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file ? (
              <div className="file-chip"><Icon name="check" size={16} /> <span>{file.name}</span>
                <button type="button" className="link" onClick={() => { setFile(null); if (input.current) input.current.value = '' }}>Remover</button></div>
            ) : <button type="button" className="btn ghost" onClick={() => input.current?.click()}><Icon name="download" size={16} /> Anexar foto ou PDF</button>}
          </Field>
          <p className="muted small">Todas as {unpaid.length} compras em aberto desta fatura serão marcadas como pagas.</p>
        </div>
      )}

      <Field label={`Compras (${inv.items.length})`}>
        <div className="card flush">{inv.items.map((t) => <TxRow key={t.id} t={t} showDate />)}</div>
      </Field>
    </Sheet>
  )
}

export type BillItem = { kind: 'tx'; date: string; amount: number; t: Transaction } | { kind: 'inv'; date: string; amount: number; inv: Invoice }

/** Contas a pagar com as compras de cartão agrupadas em faturas, em ordem de vencimento. */
export function billItems(txs: Transaction[], methods: PaymentMethod[]): BillItem[] {
  const { rest, invoices } = splitCardPurchases(txs, cardMap(methods), today())
  return [
    ...rest.map((t): BillItem => ({ kind: 'tx', date: t.date, amount: t.kind === 'expense' ? amt(t) : -amt(t), t })),
    ...invoices.map((inv): BillItem => ({ kind: 'inv', date: inv.due, amount: inv.pending, inv })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export function BillRow({ item, showDate = true }: { item: BillItem; showDate?: boolean }) {
  return item.kind === 'inv'
    ? <InvoiceRow inv={item.inv} />
    : <TxRow t={item.t} showDate={showDate} />
}
