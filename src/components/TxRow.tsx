import { fmt, today } from '../lib/dates'
import { money } from '../lib/format'
import { togglePaid } from '../lib/services'
import type { Transaction } from '../lib/types'
import { useApp } from '../store'
import { Icon } from './Icon'

export function TxRow({ t, showDate }: { t: Transaction; showDate?: boolean }) {
  const { idx, paymentMethods, openEditor, run } = useApp()
  const cat = idx.get(t.category_id)
  const root = idx.root(t.category_id)
  const pm = paymentMethods.find((p) => p.id === t.payment_method_id)
  const overdue = !t.paid && t.date < today()
  const sign = t.kind === 'expense' ? '−' : '+'

  return (
    <div className="tx-row">
      <button className="tx-main" onClick={() => openEditor(t)}>
        <span className="tx-icon" style={{ background: `${root?.color ?? '#94a3b8'}22`, color: root?.color }}>
          {cat?.icon ?? (t.kind === 'income' ? '💰' : '❔')}
        </span>
        <span className="tx-text">
          <span className="tx-desc">{t.description || idx.label(t.category_id)}</span>
          <span className="tx-meta">
            {showDate && <>{fmt.short(t.date)} · </>}
            {idx.label(t.category_id)}
            {pm && <> · {pm.name}</>}
            {t.recurring_bill_id && <> · 🔁</>}
          </span>
        </span>
        <span className="tx-right">
          <span className={`tx-amount ${t.kind === 'expense' ? 'neg' : 'pos'}`}>{sign} {money(t.amount)}</span>
          {!t.paid && (
            <span className={`chip ${overdue ? 'bad' : 'warn'}`}>
              {overdue ? 'Atrasada' : t.kind === 'expense' ? 'A pagar' : 'A receber'}
            </span>
          )}
        </span>
      </button>
      {!t.paid && (
        <button
          className="icon-btn pay-btn" aria-label={t.kind === 'expense' ? 'Marcar como pago' : 'Marcar como recebido'}
          title={t.kind === 'expense' ? 'Marcar como pago' : 'Marcar como recebido'}
          onClick={() => run(() => togglePaid(t), t.kind === 'expense' ? 'Marcado como pago' : 'Marcado como recebido')}
        >
          <Icon name="check" />
        </button>
      )}
    </div>
  )
}
