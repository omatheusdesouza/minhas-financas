import { dueStatus } from '../lib/due'
import { fmt } from '../lib/dates'
import { money } from '../lib/format'
import { needsAmount } from '../lib/services'
import type { Transaction } from '../lib/types'
import { useApp } from '../store'
import { Icon } from './Icon'

export function TxRow({ t, showDate }: { t: Transaction; showDate?: boolean }) {
  const { idx, paymentMethods, openEditor, openPay, canEdit } = useApp()
  const cat = idx.get(t.category_id)
  const root = idx.root(t.category_id)
  const pm = paymentMethods.find((p) => p.id === t.payment_method_id)
  const sign = t.kind === 'expense' ? '−' : '+'
  // compra no cartão: mostra o dia da compra e a fatura; é paga junto com a fatura
  const onCard = Boolean(t.purchase_date && pm?.type === 'credit_card')
  const due = t.paid || onCard ? null : dueStatus(t)
  const missing = needsAmount(t)

  return (
    <div className={`tx-row ${due ? `due-${due.tone}` : ''}`}>
      <button className="tx-main" onClick={() => openEditor(t)}>
        <span className="tx-icon" style={{ background: `${root?.color ?? '#94a3b8'}22`, color: root?.color }}>
          {cat?.icon ?? (t.kind === 'income' ? '💰' : '❔')}
        </span>
        <span className="tx-text">
          <span className="tx-desc">{t.description || idx.short(t.category_id)}</span>
          <span className="tx-meta" title={idx.label(t.category_id)}>
            {[
              showDate && fmt.short(onCard ? t.purchase_date! : t.date),
              // com descrição, mostra a subcategoria; sem descrição (o título já é a subcategoria), a categoria principal
              t.description
                ? (t.description.trim().toLowerCase() === idx.short(t.category_id).toLowerCase() ? null : idx.short(t.category_id))
                : idx.get(t.category_id)?.parent_id ? idx.short(idx.get(t.category_id)!.parent_id) : null,
              pm && `${onCard ? '💳 ' : ''}${pm.name}`,
              t.recurring_bill_id && '🔁',
              t.receipt_path && '📎',
            ].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="tx-right">
          {missing
            ? <span className="tx-amount muted">valor a informar</span>
            : <span className={`tx-amount ${t.kind === 'expense' ? 'neg' : 'pos'}`}>{sign} {money(t.amount ?? 0)}</span>}
          {onCard && <span className={`chip ${t.paid ? 'good' : ''}`}>{t.paid ? 'Fatura paga' : `Fatura ${fmt.short(t.date)}`}</span>}
          {due && (
            <span className={`chip ${due.tone}`}>
              {t.kind === 'income' ? (due.days < 0 ? 'Atrasado' : 'A receber') : due.label}
            </span>
          )}
        </span>
      </button>
      {!t.paid && canEdit && !onCard && (
        missing ? (
          <button className="btn ghost sm-btn" onClick={() => openPay(t)}>Informar</button>
        ) : (
          <button
            className="icon-btn pay-btn" aria-label={t.kind === 'expense' ? 'Marcar como paga' : 'Marcar como recebido'}
            onClick={() => openPay(t)}
          >
            <Icon name="check" />
          </button>
        )
      )}
    </div>
  )
}
