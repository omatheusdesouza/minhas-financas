import { useState } from 'react'
import { api } from '../lib/api'
import { invoiceFor } from '../lib/cards'
import { fmt, today } from '../lib/dates'
import { isAccount as isCashAccount } from '../lib/cash'
import { cardsAvailable, cashAvailable, linkAvailable } from '../lib/features'
import { moneyInput, parseMoney } from '../lib/format'
import type { PaymentMethod } from '../lib/types'
import { useApp, useLoad } from '../store'
import { AccountSelect, Field, MoneyInput, Segmented, Toggle } from './Fields'
import { Sheet } from './Sheet'

type Kind = 'other' | 'account' | 'credit_card'

/**
 * Criar ou editar uma forma de pagamento. Com a migration 0007 pode ser um cartão de crédito com fatura;
 * com a 0009, uma conta do caixa (Nubank, Itaú, Carteira...) com o saldo exato de uma data.
 */
export function PaymentMethodSheet({ method, onClose }: { method: Partial<PaymentMethod>; onClose: () => void }) {
  const { run, reloadMeta, bump } = useApp()
  const { data: cardsOk } = useLoad(cardsAvailable, [])
  const { data: cashOk } = useLoad(cashAvailable, [])
  const { data: linkOk } = useLoad(linkAvailable, [])
  const { paymentMethods } = useApp()
  const [accountId, setAccountId] = useState<string | null>(method.account_id ?? null)
  const hasAccounts = paymentMethods.some((p) => isCashAccount(p) && !p.archived)
  const [name, setName] = useState(method.name ?? '')
  const [kind, setKind] = useState<Kind>(method.type ?? 'other')
  const isCard = kind === 'credit_card'
  const isAccount = kind === 'account'
  const [opening, setOpening] = useState(moneyInput(method.opening_balance == null ? null : Math.abs(method.opening_balance)))
  const [negative, setNegative] = useState((method.opening_balance ?? 0) < 0)
  const [openingDate, setOpeningDate] = useState(method.opening_date ?? today())
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
    isAccount && !opening.trim() && 'Informe o saldo da conta (pode ser 0).',
    isAccount && opening.trim() && Number.isNaN(parseMoney(opening)) && 'Saldo inválido.',
    isAccount && (!openingDate || openingDate > today()) && 'A data do saldo não pode ser no futuro.',
  ].filter(Boolean) as string[]
  const openingValue = (negative ? -1 : 1) * Math.abs(parseMoney(opening) || 0)
  const example = isCard && c && d ? invoiceFor({ closing_day: c, due_day: d }, today()) : null

  async function save() {
    setShowErrors(true)
    if (errors.length) return
    // ligar agora a uma conta: avisa quantos lançamentos já pagos passam a descontar dela
    if (linkOk && !isAccount && accountId && accountId !== (method.account_id ?? null) && method.id) {
      const acc = paymentMethods.find((p) => p.id === accountId)
      const since = acc?.opening_date ?? today()
      const old = (await api.listTransactions('0000-01-01', '9999-12-31')).filter((t) => t.payment_method_id === method.id && t.paid && (t.paid_at ?? t.date) >= since && !t.paid_from)
      if (old.length && !confirm(`${old.length} lançamento(s) já pago(s) com "${method.name}" desde ${fmt.day(since)} vão passar a descontar de ${acc?.name}. Se você já tinha ajustado o saldo por causa deles, ajuste de novo depois. Continuar?`)) return
    }
    const ok = await run(async () => {
      await api.savePaymentMethod({
        ...(method as PaymentMethod), name: name.trim(), archived,
        ...(cardsOk ? {
          type: kind === 'account' && !cashOk ? 'other' : kind,
          closing_day: isCard ? c : null, due_day: isCard ? d : null, credit_limit: isCard ? lim : null,
        } : {}),
        // colunas da 0009: só são enviadas quando o banco já as tem
        ...(cashOk ? { opening_balance: isAccount ? openingValue : null, opening_date: isAccount ? openingDate : null } : {}),
        ...(linkOk ? { account_id: isAccount ? null : accountId } : {}),
      })
      await reloadMeta()
      return true
    }, isCard ? 'Cartão salvo 💳' : isAccount ? 'Conta salva 🏦' : 'Forma de pagamento salva')
    if (ok) { bump(); onClose() }
  }

  async function remove() {
    if (!method.id || !confirm(`Excluir "${method.name}"? Os lançamentos continuam, sem forma de pagamento.`)) return
    if (await run(async () => { await api.deletePaymentMethod(method.id!); await reloadMeta(); return true }, 'Excluída')) onClose()
  }

  return (
    <Sheet title={method.id ? (isAccount ? 'Editar conta' : isCard ? 'Editar cartão' : 'Editar forma de pagamento') : isAccount ? 'Nova conta' : isCard ? 'Novo cartão' : 'Nova forma de pagamento'} onClose={onClose} footer={<>
      {method.id && <button className="btn danger ghost" onClick={remove}>Excluir</button>}
      <button className="btn primary grow" onClick={save}>Salvar</button>
    </>}>
      {cardsOk && (
        <Segmented value={kind} onChange={setKind} options={[
          ...(cashOk || kind === 'account' ? [{ value: 'account' as Kind, label: 'Conta' }] : []),
          { value: 'credit_card' as Kind, label: 'Cartão' },
          { value: 'other' as Kind, label: 'Outra forma' },
        ]} />
      )}
      <p className="muted small">
        {isAccount ? 'Conta bancária ou carteira com saldo: entra no Caixa. Ex.: Nubank, Itaú, Carteira.'
          : isCard ? 'Cartão de crédito: as compras entram na fatura e saem do caixa quando a fatura é paga.'
            : 'Forma de pagamento sem saldo próprio. Ex.: Vale-refeição, Promissória da loja X.'}
      </p>
      <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!method.id} maxLength={40} placeholder={isAccount ? 'Ex.: Nubank, Itaú, Carteira' : isCard ? 'Ex.: Cartão Nubank' : 'Ex.: Vale-refeição'} /></Field>
      {!isAccount && linkOk && hasAccounts && (
        <Field label={isCard ? 'A fatura é paga por qual conta?' : 'Desconta de qual conta?'}
          hint={isCard ? 'Ao pagar a fatura, esta conta já vem escolhida (dá para trocar).' : 'Cartão de débito, Pix…: o que for pago com esta forma sai desta conta no Caixa.'}>
          <AccountSelect value={accountId} onChange={setAccountId} none="Nenhuma" />
        </Field>
      )}
      {isAccount && cashOk && (
        <>
          <Field label="Saldo exato da conta" hint="Olhe no app do banco e digite o valor de agora. Lançamentos de antes desta data não mudam o saldo.">
            <MoneyInput value={opening} onChange={setOpening} big />
          </Field>
          <Toggle checked={negative} onChange={setNegative} label="Saldo negativo (cheque especial)" />
          <Field label="Saldo do dia"><input type="date" value={openingDate} max={today()} onChange={(e) => setOpeningDate(e.target.value)} /></Field>
        </>
      )}
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
