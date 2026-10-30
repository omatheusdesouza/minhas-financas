import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { fmt, today } from '../lib/dates'
import { money, moneyInput, parseMoney } from '../lib/format'
import { prepareUpload } from '../lib/images'
import { markPaid, needsAmount, setAmount } from '../lib/services'
import type { Transaction } from '../lib/types'
import { useApp } from '../store'
import { Field, MoneyInput, Toggle } from './Fields'
import { Icon } from './Icon'
import { ReserveSplit, emptySplit, sendToReserve, splitError, type SplitValue } from './ReserveSheets'
import { Sheet } from './Sheet'

/**
 * Pagamento de uma conta: confirma o valor (obrigatório nas variáveis), a data e,
 * se quiser, anexa o comprovante (foto ou PDF).
 */
export function PaySheet({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { run, idx } = useApp()
  const variable = needsAmount(tx)
  const [amount, setAmountStr] = useState(moneyInput(tx.amount))
  const [payNow, setPayNow] = useState(!variable)
  const [paidAt, setPaidAt] = useState(today())
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const value = parseMoney(amount)
  const income = tx.kind === 'income'
  const [split, setSplit] = useState<SplitValue>(emptySplit)
  // Ao receber um ganho (ex.: salário), pode mandar uma parte direto para uma reserva
  const splitErr = income && payNow ? splitError(split, value) : null
  const valid = value > 0 && paidAt <= today() && !splitErr

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    const ok = await run(async () => {
      if (!payNow) {
        await setAmount(tx, value)
        return true
      }
      let receiptPath: string | null | undefined
      if (file) receiptPath = await api.uploadFile('receipts', 'comprovante', await prepareUpload(file, 1800, 0.8))
      await markPaid(tx, { amount: value, paidAt, receiptPath })
      if (income) await sendToReserve(split, paidAt, tx.description || idx.label(tx.category_id))
      return true
    }, payNow ? (income ? 'Marcado como recebido' : 'Conta paga ✓') : 'Valor informado')
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Sheet
      title={variable ? 'Informar valor' : income ? 'Confirmar recebimento' : 'Marcar como paga'}
      onClose={onClose}
      footer={<button className="btn primary grow" disabled={!valid || busy} onClick={save}>
        {busy ? 'Salvando…' : payNow ? (income ? 'Confirmar recebimento' : 'Confirmar pagamento') : 'Salvar valor'}
      </button>}
    >
      <div className="pay-head">
        <span className="tx-icon">{idx.get(tx.category_id)?.icon ?? '🧾'}</span>
        <div>
          <strong>{tx.description || idx.label(tx.category_id)}</strong>
          <p className="muted small">Vencimento {fmt.day(tx.date)}{tx.amount != null && ` · ${money(tx.amount)}`}</p>
        </div>
      </div>

      <Field label={variable ? 'Valor deste mês' : 'Valor pago'} hint={variable ? 'Veja o valor na conta que chegou (água, energia…).' : undefined}>
        <MoneyInput value={amount} onChange={setAmountStr} autoFocus big />
      </Field>

      {variable && <Toggle checked={payNow} onChange={setPayNow} label="Já paguei esta conta" />}

      {payNow && (
        <>
          <Field label={income ? 'Recebido em' : 'Pago em'}>
            <input type="date" value={paidAt} max={today()} onChange={(e) => e.target.value && setPaidAt(e.target.value)} />
          </Field>
          {income && <ReserveSplit value={split} onChange={setSplit} total={value} />}
          {income && split.on && splitErr && <p className="bad-text small">{splitErr}</p>}
          <Field label="Comprovante (opcional)">
            <input ref={input} type="file" accept="image/*,application/pdf" hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file ? (
              <div className="file-chip">
                <Icon name="check" size={16} /> <span>{file.name}</span>
                <button type="button" className="link" onClick={() => { setFile(null); if (input.current) input.current.value = '' }}>Remover</button>
              </div>
            ) : (
              <button type="button" className="btn ghost" onClick={() => input.current?.click()}>
                <Icon name="download" size={16} /> Anexar foto ou PDF
              </button>
            )}
          </Field>
        </>
      )}
    </Sheet>
  )
}
