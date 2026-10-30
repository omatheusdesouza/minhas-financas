import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { startOfMonth, today } from '../lib/dates'
import { money, moneyInput, parseMoney } from '../lib/format'
import { prepareUpload } from '../lib/images'
import { splitInstallments } from '../lib/installments'
import { generateRecurring } from '../lib/services'
import type { AmountType, Kind, Transaction } from '../lib/types'
import { useApp, type EditorMode } from '../store'
import { CategorySelect, Field, MoneyInput, PaymentSelect, Segmented, Toggle } from './Fields'
import { Icon } from './Icon'
import { ReserveSplit, emptySplit, sendToReserve, splitError, type SplitValue } from './ReserveSheets'
import { Sheet } from './Sheet'

type Mode = EditorMode

/** Formulário de lançamento: gasto ou ganho, à vista, parcelado ou fixo mensal. */
export function TxEditor({ initial, initialMode = 'single', onClose }: {
  initial?: Partial<Transaction>
  initialMode?: Mode
  onClose: () => void
}) {
  const { run, idx, canEdit } = useApp()
  const editing = Boolean(initial?.id)
  const [kind, setKind] = useState<Kind>(initial?.kind ?? 'expense')
  const [amount, setAmount] = useState(moneyInput(initial?.amount))
  const [description, setDescription] = useState(initial?.description ?? '')
  const [date, setDate] = useState(initial?.date ?? today())
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category_id ?? null)
  const [paymentId, setPaymentId] = useState<string | null>(initial?.payment_method_id ?? null)
  const [paid, setPaid] = useState(initial?.paid ?? initialMode === 'single')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [mode, setMode] = useState<Mode>(initialMode)
  const [count, setCount] = useState('2')
  const [creditor, setCreditor] = useState('')
  const [amountType, setAmountType] = useState<AmountType>('fixed')
  const [receipt, setReceipt] = useState<string | null>(initial?.receipt_path ?? null)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [split, setSplit] = useState<SplitValue>(emptySplit)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (receipt) api.fileUrl('receipts', receipt).then(setReceiptUrl).catch(() => setReceiptUrl(null))
    else setReceiptUrl(null)
  }, [receipt])

  const value = parseMoney(amount)
  const n = Math.max(1, Math.min(120, parseInt(count) || 1))
  // Sem valor só é permitido em conta variável (todo mês) ou lançamento ainda não pago
  const amountOk = value > 0 || (!amount.trim() && ((mode === 'recurring' && amountType === 'variable') || (editing && !paid)))
  // Ganho recebido agora (ex.: salário): pode mandar uma parte direto para uma reserva
  const canSplit = kind === 'income' && mode === 'single' && paid && !initial?.paid && value > 0
  const splitErr = canSplit ? splitError(split, value) : null
  const valid = amountOk && (description.trim() || categoryId) && !splitErr

  function changeKind(k: Kind) {
    setKind(k)
    if (categoryId && idx.get(categoryId)?.kind !== k) setCategoryId(null)
    if (k === 'income' && mode === 'installments') setMode('single')
  }

  async function save() {
    if (!valid || saving) return
    setSaving(true)
    const desc = description.trim() || idx.get(categoryId)?.name || ''
    const ok = await run(async () => {
      if (mode === 'installments') {
        await api.createPlan({
          description: desc, creditor: creditor.trim() || null, category_id: categoryId,
          payment_method_id: paymentId, total_amount: value, installments: n, first_due: date,
          notes: notes.trim() || null, first_paid: paid,
        })
      } else if (mode === 'recurring') {
        const bill = await api.saveRecurring({
          description: desc, kind, amount: value > 0 ? value : null, day_of_month: Number(date.slice(8)),
          amount_type: kind === 'expense' ? amountType : 'fixed', income_source: null,
          category_id: categoryId, payment_method_id: paymentId, start_month: startOfMonth(date),
          end_month: null, active: true, generated_until: null, notes: notes.trim() || null,
        })
        await generateRecurring([bill])
      } else {
        await api.saveTransaction({
          ...(initial as Transaction | undefined),
          kind, amount: value > 0 ? value : null, description: desc, date, category_id: categoryId,
          payment_method_id: paymentId, paid,
          paid_at: paid ? (initial?.paid_at ?? date) : null,
          notes: notes.trim() || null,
          installment_plan_id: initial?.installment_plan_id ?? null,
          installment_number: initial?.installment_number ?? null,
          recurring_bill_id: initial?.recurring_bill_id ?? null,
          recurring_month: initial?.recurring_month ?? null,
          receipt_path: receipt,
        })
        // comprovante removido ou trocado: apaga o arquivo antigo
        const old = initial?.receipt_path
        if (old && old !== receipt) await api.removeFile('receipts', old).catch(() => {})
        if (canSplit) await sendToReserve(split, date, desc)
      }
      return true
    }, editing ? 'Lançamento atualizado' : mode === 'installments' ? `${n} parcelas criadas` : 'Lançamento salvo')
    setSaving(false)
    if (ok) onClose()
  }

  async function remove() {
    if (!initial?.id) return
    const msg = initial.installment_plan_id
      ? 'Excluir somente esta parcela? (Para excluir a compra inteira, use a tela Contas › Parcelas.)'
      : 'Excluir este lançamento?'
    if (!confirm(msg)) return
    const ok = await run(async () => {
      await api.deleteTransaction(initial.id!)
      if (initial.receipt_path) await api.removeFile('receipts', initial.receipt_path).catch(() => {})
      return true
    }, 'Lançamento excluído')
    if (ok) onClose()
  }

  const future = date > today()
  const paidLabel = kind === 'expense' ? (future ? 'Já está pago' : 'Pago') : future ? 'Já recebido' : 'Recebido'
  const preview = mode === 'installments' && value > 0 ? splitInstallments(value, n, date) : []

  return (
    <Sheet
      title={!canEdit ? 'Detalhes do lançamento' : editing ? 'Editar lançamento' : 'Novo lançamento'}
      onClose={onClose}
      footer={!canEdit ? undefined :
        <>
          {editing && <button className="btn danger ghost" onClick={remove}>Excluir</button>}
          <button className="btn primary grow" disabled={!valid || saving} onClick={save}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      {!canEdit && <p className="note small">Você só pode visualizar estas finanças.</p>}
      <fieldset className="plain-fieldset" disabled={!canEdit}>
      <Segmented
        value={kind} onChange={changeKind}
        options={[
          { value: 'expense', label: 'Gasto', className: 'neg' },
          { value: 'income', label: 'Ganho', className: 'pos' },
        ]}
      />

      {editing && initial?.installment_plan_id && (
        <p className="note">🧾 Parcela {initial.installment_number} de uma compra parcelada. As mudanças valem só para esta parcela.</p>
      )}
      {editing && initial?.recurring_bill_id && (
        <p className="note">🔁 Lançamento de uma conta fixa. Para mudar todos os meses, edite em Contas › Fixas.</p>
      )}

      <Field
        label={mode === 'installments' ? 'Valor total da compra' : mode === 'recurring' && amountType === 'variable' ? 'Valor estimado (opcional)' : 'Valor'}
        hint={editing && !amount.trim() && !paid ? 'Conta variável: informe o valor quando a conta chegar.' : undefined}
      >
        <MoneyInput value={amount} onChange={setAmount} autoFocus={!editing} big />
      </Field>

      <Field label="Descrição">
        <input
          value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder={kind === 'expense' ? 'Ex.: Gasolina, Mercado, Lanche…' : 'Ex.: Salário, Venda…'}
          maxLength={120}
        />
      </Field>

      <div className="row2">
        <Field label={mode === 'installments' ? '1º vencimento' : mode === 'recurring' ? 'Primeiro mês / dia' : 'Data'}>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
        <Field label="Forma de pagamento">
          <PaymentSelect value={paymentId} onChange={setPaymentId} />
        </Field>
      </div>

      <Field label="Categoria">
        <CategorySelect kind={kind} value={categoryId} onChange={setCategoryId} includeId={initial?.category_id} />
      </Field>

      {!editing && (
        <Field label="Tipo de lançamento">
          <Segmented
            value={mode} onChange={setMode}
            options={[
              { value: 'single', label: 'Única vez' },
              ...(kind === 'expense' ? [{ value: 'installments' as Mode, label: 'Parcelado' }] : []),
              { value: 'recurring', label: 'Todo mês' },
            ]}
          />
        </Field>
      )}

      {mode === 'installments' && (
        <div className="card inset">
          <div className="row2">
            <Field label="Nº de parcelas">
              <input type="number" inputMode="numeric" min={1} max={120} value={count} onChange={(e) => setCount(e.target.value)} />
            </Field>
            <Field label="Credor / loja">
              <input value={creditor} onChange={(e) => setCreditor(e.target.value)} placeholder="Ex.: Loja do João" />
            </Field>
          </div>
          {preview.length > 0 && (
            <p className="muted small">
              {n}x de {money(preview[n - 1].amount)}
              {preview[0].amount !== preview[n - 1].amount && ` (1ª de ${money(preview[0].amount)})`}
              {' · '}última em {preview[n - 1].date.split('-').reverse().join('/')}
            </p>
          )}
        </div>
      )}
      {mode === 'recurring' && kind === 'expense' && (
        <Field label="O valor muda todo mês?">
          <Segmented value={amountType} onChange={setAmountType} options={[
            { value: 'fixed', label: 'Valor fixo' }, { value: 'variable', label: 'Variável (água, luz…)' },
          ]} />
        </Field>
      )}
      {mode === 'recurring' && (
        <p className="note">🔁 Será lançado automaticamente todo dia {Number(date.slice(8))} de cada mês, como conta a {kind === 'expense' ? 'pagar' : 'receber'}.
          {amountType === 'variable' && kind === 'expense' && ' Você informa o valor de cada mês quando a conta chegar.'}</p>
      )}

      {mode !== 'recurring' && (
        <Toggle
          checked={paid} onChange={setPaid}
          label={mode === 'installments' ? '1ª parcela já paga' : paidLabel}
        />
      )}

      {canSplit && <ReserveSplit value={split} onChange={setSplit} total={value} />}
      {canSplit && split.on && splitErr && <p className="bad-text small">{splitErr}</p>}

      <Field label="Observações">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </Field>

      {mode === 'single' && (
        <Field label="Comprovante">
          <input ref={fileInput} type="file" accept="image/*,application/pdf" hidden onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            const path = await run(async () => api.uploadFile('receipts', 'comprovante', await prepareUpload(f, 1800, 0.8)), 'Comprovante anexado')
            if (path) setReceipt(path)
          }} />
          {receipt ? (
            <div className="file-chip">
              <Icon name="check" size={16} />
              {receiptUrl ? <a href={receiptUrl} target="_blank" rel="noreferrer">Ver comprovante</a> : <span>Comprovante anexado</span>}
              <button type="button" className="link" onClick={() => setReceipt(null)}>Remover</button>
            </div>
          ) : (
            <button type="button" className="btn ghost" onClick={() => fileInput.current?.click()}>
              <Icon name="download" size={16} /> Anexar foto ou PDF
            </button>
          )}
          {receipt !== (initial?.receipt_path ?? null) && <span className="field-hint">Toque em Salvar para guardar a mudança.</span>}
        </Field>
      )}
      </fieldset>
    </Sheet>
  )
}
