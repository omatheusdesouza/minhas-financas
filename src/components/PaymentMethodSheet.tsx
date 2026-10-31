import { useState } from 'react'
import { api } from '../lib/api'
import { invoiceFor } from '../lib/cards'
import { fmt, today } from '../lib/dates'
import { cardsAvailable } from '../lib/features'
import { moneyInput, parseMoney } from '../lib/format'
import type { PaymentMethod } from '../lib/types'
import { useApp, useLoad } from '../store'
import { Field, MoneyInput, Toggle } from './Fields'
import { Sheet } from './Sheet'

/** Criar ou editar uma forma de pagamento; com a migration 0007, pode ser um cartão de crédito com fatura. */
export function PaymentMethodSheet({ method, onClose }: { method: Partial<PaymentMethod>; onClose: () => void }) {
  const { run, reloadMeta } = useApp()
  const { data: cardsOk } = useLoad(cardsAvailable, [])
  const [name, setName] = useState(method.name ?? '')
  const [isCard, setIsCard] = useState(method.type === 'credit_card')
  const [closing, setClosing] = useState(method.closing_day ? String(method.closing_day) : '')
  const [due, setDue] = useState(method.due_day ? String(method.due_day) : '')
  const [limit, setLimit] = useState(moneyInput(method.credit_limit))
  const [archived, setArchived] = useState(method.archived ?? false)
  const [showErrors, setShowErrors] = useState(false)

  const day = (s: string) => (/^\d{1,2}$/.test(s.trim()) && +s >= 1 && +s <= 31 ? +s : null)
  const c = day(closing)
  const d = day(due)
  const lim = limit.trim() ? parseMoney(limit) : null
  const errors = [
    !name.trim() && 'Informe o nome.',
    isCard && c == null && 'O dia de fechamento precisa ser de 1 a 31.',
    isCard && d == null && 'O dia de vencimento precisa ser de 1 a 31.',
    isCard && lim != null && !(lim > 0) && 'O limite precisa ser maior que zero (ou deixe em branco).',
  ].filter(Boolean) as string[]
  const example = isCard && c && d ? invoiceFor({ closing_day: c, due_day: d }, today()) : null

  async function save() {
    setShowErrors(true)
    if (errors.length) return
    const ok = await run(async () => {
      await api.savePaymentMethod({
        ...(method as PaymentMethod), name: name.trim(), archived,
        ...(cardsOk ? {
          type: isCard ? 'credit_card' : 'other',
          closing_day: isCard ? c : null, due_day: isCard ? d : null, credit_limit: isCard ? lim : null,
        } : {}),
      })
      await reloadMeta()
      return true
    }, isCard ? 'Cartão salvo 💳' : 'Forma de pagamento salva')
    if (ok) onClose()
  }

  async function remove() {
    if (!method.id || !confirm(`Excluir "${method.name}"? Os lançamentos continuam, sem forma de pagamento.`)) return
    if (await run(async () => { await api.deletePaymentMethod(method.id!); await reloadMeta(); return true }, 'Excluída')) onClose()
  }

  return (
    <Sheet title={method.id ? 'Editar forma de pagamento' : 'Nova forma de pagamento'} onClose={onClose} footer={<>
      {method.id && <button className="btn danger ghost" onClick={remove}>Excluir</button>}
      <button className="btn primary grow" onClick={save}>Salvar</button>
    </>}>
      <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!method.id} maxLength={40} placeholder="Ex.: Nubank, Pix, Dinheiro" /></Field>
      {cardsOk && <Toggle checked={isCard} onChange={setIsCard} label="É um cartão de crédito (com fatura)" />}
      {cardsOk && isCard && (
        <>
          <div className="row2">
            <Field label="Fecha no dia"><input type="number" inputMode="numeric" min={1} max={31} value={closing} onChange={(e) => setClosing(e.target.value)} placeholder="Ex.: 3" /></Field>
            <Field label="Vence no dia"><input type="number" inputMode="numeric" min={1} max={31} value={due} onChange={(e) => setDue(e.target.value)} placeholder="Ex.: 10" /></Field>
          </div>
          <Field label="Limite (opcional)"><MoneyInput value={limit} onChange={setLimit} /></Field>
          {example && (
            <p className="note small">
              Compras de hoje entram na fatura que fecha em {fmt.day(example.closing)} e vence em <b>{fmt.day(example.due)}</b>.
              Compras no dia do fechamento ou depois vão para a fatura seguinte.
            </p>
          )}
          {method.id && method.type !== 'credit_card' && (
            <p className="muted small">Os lançamentos que já existem com esta forma continuam como estão; as faturas valem para as compras novas.</p>
          )}
        </>
      )}
      {method.id && <Toggle checked={archived} onChange={setArchived} label="Arquivada" />}
      {showErrors && errors.map((e) => <p key={e} className="bad-text small">{e}</p>)}
    </Sheet>
  )
}
