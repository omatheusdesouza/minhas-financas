import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { adjustment, balances, cashTotal, earliestOpening, isAccount, linkedTo, statement, type AccountBalance } from '../lib/cash'
import { addDays, fmt, today } from '../lib/dates'
import { cashAvailable } from '../lib/features'
import { money, parseMoney } from '../lib/format'
import type { AccountMove, PaymentMethod, Transaction } from '../lib/types'
import { useApp, useLoad } from '../store'
import { AccountSelect, Field, MoneyInput, Toggle } from './Fields'
import { Icon } from './Icon'
import { PaymentMethodSheet } from './PaymentMethodSheet'
import { Sheet } from './Sheet'

export interface CashData {
  ok: boolean
  accounts: AccountBalance[]
  total: number
  txs: Transaction[]
  moves: AccountMove[]
}

/** Saldos do caixa (contas, lançamentos pagos desde o saldo inicial, transferências e ajustes). */
export function useCash() {
  const { paymentMethods } = useApp()
  return useLoad<CashData>(async () => {
    const ok = await cashAvailable()
    const accounts = paymentMethods.filter(isAccount)
    const first = earliestOpening(accounts)
    if (!ok || !first) return { ok, accounts: [], total: 0, txs: [], moves: [] }
    // a fatura e as contas pagas com atraso têm a data diferente do pagamento: busca uma janela folgada
    const [txs, moves] = await Promise.all([api.listTransactions(addDays(first, -400), addDays(today(), 400)), api.listMoves()])
    const list = balances(paymentMethods, txs, moves)
    return { ok, accounts: list, total: cashTotal(list), txs, moves }
  }, [paymentMethods])
}

/** Bloco "Caixa" do Início. */
export function CashCard() {
  const { canEdit } = useApp()
  const { data } = useCash()
  if (!data?.ok) return null
  const active = data.accounts.filter((a) => !a.account.archived)
  if (!active.length) {
    return canEdit ? (
      <Link to="/caixa" className="card goal-empty"><span className="goal-icon">🏦</span>
        <span className="grow"><b>Monte seu caixa</b><span className="muted small"> · informe o saldo de cada conta</span></span>
        <Icon name="right" /></Link>
    ) : null
  }
  return (
    <Link to="/caixa" className="card cash-card">
      <div className="card-title"><span className="stat-label">Caixa</span><span className="link">Ver contas</span></div>
      <strong className={`cash-total ${data.total < 0 ? 'neg' : ''}`}>{money(data.total)}</strong>
      <div className="cash-mini">
        {active.slice(0, 4).map((a) => (
          <span key={a.account.id}><span className="muted">{a.account.name}</span><b className={a.balance < 0 ? 'neg' : ''}>{money(a.balance)}</b></span>
        ))}
        {active.length > 4 && <span className="muted small">+{active.length - 4} conta(s)</span>}
      </div>
    </Link>
  )
}

/** Transferência entre duas contas (não é gasto nem ganho). */
export function TransferSheet({ onClose, from: initialFrom }: { onClose: () => void; from?: string | null }) {
  const { run, bump } = useApp()
  const [from, setFrom] = useState<string | null>(initialFrom ?? null)
  const [to, setTo] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const value = parseMoney(amount)
  const errors = [
    !from && 'Escolha a conta de origem.',
    !to && 'Escolha a conta de destino.',
    from && to && from === to && 'As contas precisam ser diferentes.',
    !(value > 0) && 'Informe um valor maior que zero.',
    date > today() && 'A data não pode ser no futuro.',
  ].filter(Boolean) as string[]
  const [showErrors, setShowErrors] = useState(false)

  async function save() {
    setShowErrors(true)
    if (errors.length) return
    const ok = await run(async () => {
      await api.saveMove({ kind: 'transfer', from_id: from, to_id: to, amount: value, date, note: note.trim() || null })
      return true
    }, 'Transferência registrada')
    if (ok) { bump(); onClose() }
  }

  return (
    <Sheet title="Transferir entre contas" onClose={onClose} footer={<button className="btn primary grow" onClick={save}>Transferir</button>}>
      <p className="muted small">Dinheiro que só mudou de lugar (ex.: do Nubank para o Itaú). Não entra como gasto nem como ganho.</p>
      <Field label="Valor"><MoneyInput value={amount} onChange={setAmount} big autoFocus /></Field>
      <div className="row2">
        <Field label="Sai de"><AccountSelect value={from} onChange={setFrom} none={false} /></Field>
        <Field label="Entra em"><AccountSelect value={to} onChange={setTo} none={false} exclude={from} /></Field>
      </div>
      <Field label="Data"><input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
      <Field label="Observação (opcional)"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
      {showErrors && errors.map((e) => <p key={e} className="bad-text small">{e}</p>)}
    </Sheet>
  )
}

/** Corrige o saldo de uma conta para ficar igual ao do banco (a diferença vira um ajuste). */
export function AdjustSheet({ cash, onClose, account: initial }: { cash: CashData; onClose: () => void; account?: string | null }) {
  const { run, bump, toast } = useApp()
  const [accountId, setAccountId] = useState<string | null>(initial ?? cash.accounts.find((a) => !a.account.archived)?.account.id ?? null)
  const [real, setReal] = useState('')
  const [negative, setNegative] = useState(false)
  const current = cash.accounts.find((a) => a.account.id === accountId)?.balance ?? 0
  const value = (negative ? -1 : 1) * Math.abs(parseMoney(real) || 0)
  const valid = Boolean(accountId) && real.trim() !== '' && !Number.isNaN(parseMoney(real))

  async function save() {
    if (!valid || !accountId) return
    const move = adjustment(accountId, current, value, today())
    if (!move) { toast('O saldo já está certo ✓'); onClose(); return }
    const ok = await run(async () => { await api.saveMove(move); return true }, 'Saldo ajustado')
    if (ok) { bump(); onClose() }
  }

  return (
    <Sheet title="Ajustar saldo" onClose={onClose} footer={<button className="btn primary grow" disabled={!valid} onClick={save}>Salvar saldo</button>}>
      <Field label="Conta"><AccountSelect value={accountId} onChange={setAccountId} none={false} /></Field>
      <p className="small">Saldo no app: <b className={current < 0 ? 'neg' : ''}>{money(current)}</b></p>
      <Field label="Saldo certo agora" hint="O valor que o app do banco mostra. A diferença é registrada como ajuste e não conta como gasto ou ganho.">
        <MoneyInput value={real} onChange={setReal} big autoFocus />
      </Field>
      <Toggle checked={negative} onChange={setNegative} label="Saldo negativo (cheque especial)" />
      {valid && Math.abs(value - current) >= 0.005 && (
        <p className="note small">Diferença: <b>{value - current > 0 ? '+' : '−'} {money(Math.abs(value - current))}</b></p>
      )}
    </Sheet>
  )
}

/** Extrato de uma conta: movimentos desde o saldo inicial, com o saldo após cada um. */
export function AccountSheet({ cash, item, onClose }: { cash: CashData; item: AccountBalance; onClose: () => void }) {
  const { paymentMethods, openEditor, canEdit, run, bump, idx } = useApp()
  const [editing, setEditing] = useState<PaymentMethod | null>(null)
  const [adjusting, setAdjusting] = useState(false)
  const [transfer, setTransfer] = useState(false)
  const entries = statement(item.account, cash.txs, cash.moves, paymentMethods, (t) => t.description || idx.label(t.category_id))

  async function removeMove(m: AccountMove) {
    if (!confirm('Excluir este movimento? O saldo será recalculado.')) return
    if (await run(async () => { await api.deleteMove(m.id); return true }, 'Movimento excluído')) bump()
  }

  if (editing) return <PaymentMethodSheet method={editing} onClose={() => { setEditing(null); onClose() }} />
  if (adjusting) return <AdjustSheet cash={cash} account={item.account.id} onClose={() => { setAdjusting(false); onClose() }} />
  if (transfer) return <TransferSheet from={item.account.id} onClose={() => { setTransfer(false); onClose() }} />

  return (
    <Sheet title={`🏦 ${item.account.name}`} onClose={onClose} footer={canEdit ? <>
      <button className="btn ghost" onClick={() => setEditing(item.account)}><Icon name="edit" size={16} /> Editar</button>
      <button className="btn ghost grow" onClick={() => setTransfer(true)}>Transferir</button>
      <button className="btn primary grow" onClick={() => setAdjusting(true)}>Ajustar</button>
    </> : undefined}>
      <div className="cash-sheet-head">
        <span className="stat-label">Saldo atual</span>
        <strong className={`cash-total ${item.balance < 0 ? 'neg' : ''}`}>{money(item.balance)}</strong>
        <span className="muted small">
          Começou com {money(item.account.opening_balance ?? 0)} em {fmt.day(item.account.opening_date ?? today())}
          {' · '}<span className="pos">+{money(item.inflow)}</span> · <span className="neg">−{money(item.outflow)}</span>
        </span>
      </div>
      {linkedTo(item.account.id, paymentMethods).length > 0 && (
        <p className="small cash-linked">
          <span className="muted">Ligados a esta conta: </span>
          {linkedTo(item.account.id, paymentMethods).map((m) => `${m.type === 'credit_card' ? '💳 ' : ''}${m.name}`).join(' · ')}
        </p>
      )}
      {entries.length ? (
        <div className="card flush cash-entries">
          {entries.map((e) => (
            <button key={e.key} className="cash-entry" disabled={!canEdit}
              onClick={() => (e.tx ? (onClose(), openEditor(e.tx)) : e.move && removeMove(e.move))}
              title={e.move ? 'Toque para excluir' : 'Toque para editar'}>
              <span className="grow cash-entry-text">
                <span className="cash-entry-label">{e.kind !== 'tx' && <span className="muted">{e.kind === 'adjust' ? '⚖︎ ' : '⇄ '}</span>}{e.label}</span>
                <span className="muted small">{fmt.short(e.date)} · saldo {money(e.balance)}</span>
              </span>
              <b className={e.amount < 0 ? 'neg' : 'pos'}>{e.amount < 0 ? '−' : '+'} {money(Math.abs(e.amount))}</b>
            </button>
          ))}
        </div>
      ) : <p className="empty">Nenhum movimento desde o saldo inicial.</p>}
      <p className="muted small">Entram aqui os lançamentos <b>pagos</b> com esta conta, as faturas pagas por ela, as transferências e os ajustes.</p>
    </Sheet>
  )
}
