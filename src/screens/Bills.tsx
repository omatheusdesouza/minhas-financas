import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CategorySelect, Field, MoneyInput, PaymentSelect, Segmented, Toggle } from '../components/Fields'
import { Icon } from '../components/Icon'
import { Sheet } from '../components/Sheet'
import { TxRow } from '../components/TxRow'
import { api } from '../lib/api'
import { addDays, addMonths, endOfMonth, fmt, startOfMonth, today } from '../lib/dates'
import { money, moneyInput, parseMoney } from '../lib/format'
import { generateRecurring, propagateRecurring } from '../lib/services'
import { INCOME_SOURCES, incomeSourceLabel, parseDay } from '../lib/templates'
import { amt, type AmountType, type IncomeSource, type InstallmentPlan, type Kind, type RecurringBill, type Transaction } from '../lib/types'
import { useApp, useLoad } from '../store'

type Tab = 'pagar' | 'parcelas' | 'fixas'

export function Bills() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => (['pagar', 'parcelas', 'fixas'].includes(params.get('tab') ?? '') ? params.get('tab') as Tab : 'pagar'))
  return (
    <div className="screen narrow">
      <header className="top"><h1>Contas</h1></header>
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'pagar', label: 'A pagar' },
        { value: 'parcelas', label: 'Parcelas' },
        { value: 'fixas', label: 'Fixas' },
      ]} />
      {tab === 'pagar' && <Upcoming />}
      {tab === 'parcelas' && <Plans />}
      {tab === 'fixas' && <Recurring />}
    </div>
  )
}

function Upcoming() {
  const { data } = useLoad(() => api.listUnpaid(addMonths(today(), 3)), [])
  const groups = useMemo(() => {
    const t = today()
    const weekEnd = addDays(t, 7)
    const monthEnd = endOfMonth(t)
    const g: { title: string; items: Transaction[]; tone?: string }[] = [
      { title: 'Atrasadas', items: [], tone: 'bad' },
      { title: 'Próximos 7 dias', items: [] },
      { title: 'Até o fim do mês', items: [] },
      { title: 'Próximos meses', items: [] },
    ]
    for (const x of data ?? []) {
      if (x.date < t) g[0].items.push(x)
      else if (x.date <= weekEnd) g[1].items.push(x)
      else if (x.date <= monthEnd) g[2].items.push(x)
      else g[3].items.push(x)
    }
    return g.filter((x) => x.items.length)
  }, [data])

  if (!data) return <div className="skeleton tall" />
  const totalOut = data.filter((t) => t.kind === 'expense').reduce((s, t) => s + amt(t), 0)
  const totalIn = data.filter((t) => t.kind === 'income').reduce((s, t) => s + amt(t), 0)
  return (
    <>
      <div className="totals-bar">
        <span>A pagar (3 meses) <b className="neg">{money(totalOut)}</b></span>
        {totalIn > 0 && <span>A receber <b className="pos">{money(totalIn)}</b></span>}
      </div>
      {groups.length === 0 && <p className="empty">Tudo em dia! Nenhuma conta pendente. 🎉</p>}
      {groups.map((g) => (
        <section key={g.title} className="day-group">
          <div className={`day-head ${g.tone ?? ''}`}>
            <span>{g.title}</span>
            <span className="muted small">{money(g.items.reduce((s, t) => s + (t.kind === 'expense' ? amt(t) : -amt(t)), 0))}</span>
          </div>
          <div className="card flush">{g.items.map((t) => <TxRow key={t.id} t={t} showDate />)}</div>
        </section>
      ))}
    </>
  )
}

function Plans() {
  const { openEditor, idx, run, canEdit } = useApp()
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<InstallmentPlan | null>(null)
  const [showDone, setShowDone] = useState(false)
  const { data } = useLoad(async () => {
    const [plans, txs] = await Promise.all([api.listPlans(), api.listPlanTransactions()])
    return plans.map((p) => {
      const parts = txs.filter((t) => t.installment_plan_id === p.id)
      const paid = parts.filter((t) => t.paid)
      const next = parts.find((t) => !t.paid)
      return {
        plan: p, parts, paidCount: paid.length,
        remaining: parts.filter((t) => !t.paid).reduce((s, t) => s + amt(t), 0),
        next,
      }
    })
  }, [])

  if (!data) return <div className="skeleton tall" />
  const active = data.filter((d) => d.next)
  const done = data.filter((d) => !d.next)
  const remainingAll = active.reduce((s, d) => s + d.remaining, 0)
  const list = showDone ? done : active

  return (
    <>
      {canEdit && (
        <button className="btn primary block" onClick={() => openEditor({ kind: 'expense' }, 'installments')}>
          <Icon name="plus" /> Nova compra parcelada / promissória
        </button>
      )}
      <div className="totals-bar">
        <span>Em aberto <b className="neg">{money(remainingAll)}</b></span>
        <span>{active.length} compra(s) ativa(s)</span>
      </div>
      {done.length > 0 && (
        <Segmented value={showDone ? 'done' : 'active'} onChange={(v) => setShowDone(v === 'done')} options={[
          { value: 'active', label: `Em andamento (${active.length})` }, { value: 'done', label: `Quitadas (${done.length})` },
        ]} />
      )}
      {list.length === 0 && <p className="empty">{showDone ? 'Nenhuma compra quitada.' : 'Nenhuma compra parcelada em aberto.'}</p>}
      {list.map(({ plan, parts, paidCount, remaining, next }) => {
        const cat = idx.root(plan.category_id)
        const isOpen = open === plan.id
        return (
          <section key={plan.id} className="card plan">
            <button className="plan-head" onClick={() => setOpen(isOpen ? null : plan.id)}>
              <span className="tx-icon" style={{ background: `${cat?.color ?? '#eab308'}22` }}>{idx.get(plan.category_id)?.icon ?? '🧾'}</span>
              <span className="tx-text">
                <span className="tx-desc">{plan.description}</span>
                <span className="tx-meta">
                  {plan.creditor ? `${plan.creditor} · ` : ''}{paidCount}/{parts.length} pagas
                  {next && <> · próxima {fmt.short(next.date)}</>}
                </span>
              </span>
              <span className="tx-right">
                <span className="tx-amount">{money(plan.total_amount)}</span>
                {remaining > 0 ? <span className="muted small">falta {money(remaining)}</span> : <span className="chip good">Quitada</span>}
              </span>
            </button>
            <span className="bar"><span style={{ width: `${(paidCount / Math.max(1, parts.length)) * 100}%`, background: 'var(--good)' }} /></span>
            {isOpen && (
              <div className="plan-body">
                {plan.notes && <p className="muted small">{plan.notes}</p>}
                {parts.map((t) => <TxRow key={t.id} t={t} showDate />)}
                {canEdit && <div className="btn-row">
                  <button className="btn ghost" onClick={() => setEditing(plan)}><Icon name="edit" size={16} /> Editar</button>
                  {remaining > 0 && (
                    <button className="btn ghost" onClick={() => {
                      if (confirm(`Marcar todas as ${parts.length - paidCount} parcelas restantes como pagas?`))
                        run(() => api.updateTransactions(parts.filter((t) => !t.paid).map((t) => t.id), { paid: true, paid_at: today() }), 'Compra quitada')
                    }}><Icon name="check" size={16} /> Quitar tudo</button>
                  )}
                  <button className="btn danger ghost" onClick={() => {
                    if (confirm(`Excluir "${plan.description}" e todas as ${parts.length} parcelas?`))
                      run(() => api.deletePlan(plan.id), 'Compra excluída')
                  }}><Icon name="trash" size={16} /> Excluir</button>
                </div>}
              </div>
            )}
          </section>
        )
      })}
      {editing && <PlanEditor plan={editing} parts={data.find((d) => d.plan.id === editing.id)?.parts ?? []} onClose={() => setEditing(null)} />}
    </>
  )
}

function PlanEditor({ plan, parts, onClose }: { plan: InstallmentPlan; parts: Transaction[]; onClose: () => void }) {
  const { run } = useApp()
  const [description, setDescription] = useState(plan.description)
  const [creditor, setCreditor] = useState(plan.creditor ?? '')
  const [categoryId, setCategoryId] = useState(plan.category_id)
  const [paymentId, setPaymentId] = useState(plan.payment_method_id)
  const [notes, setNotes] = useState(plan.notes ?? '')

  async function save() {
    const ok = await run(async () => {
      const desc = description.trim() || plan.description
      await api.updatePlan(plan.id, {
        description: desc, creditor: creditor.trim() || null, category_id: categoryId,
        payment_method_id: paymentId, notes: notes.trim() || null,
      })
      for (const t of parts) {
        await api.saveTransaction({
          ...t, category_id: categoryId, payment_method_id: paymentId,
          description: `${desc} (${t.installment_number}/${parts.length})`,
        })
      }
      return true
    }, 'Compra atualizada')
    if (ok) onClose()
  }

  return (
    <Sheet title="Editar compra parcelada" onClose={onClose} footer={<button className="btn primary grow" onClick={save}>Salvar</button>}>
      <Field label="Descrição"><input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Credor / loja"><input value={creditor} onChange={(e) => setCreditor(e.target.value)} /></Field>
      <Field label="Categoria"><CategorySelect kind="expense" value={categoryId} onChange={setCategoryId} includeId={plan.category_id} /></Field>
      <Field label="Forma de pagamento"><PaymentSelect value={paymentId} onChange={setPaymentId} /></Field>
      <Field label="Observações"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <p className="note">Para mudar o valor ou a data de uma parcela específica, toque nela na lista.</p>
    </Sheet>
  )
}

function Recurring() {
  const { idx, canEdit } = useApp()
  const [editing, setEditing] = useState<Partial<RecurringBill> | null>(null)
  const { data } = useLoad(() => api.listRecurring(), [])
  if (!data) return <div className="skeleton tall" />
  const active = data.filter((b) => b.active)
  const monthlyOut = active.filter((b) => b.kind === 'expense').reduce((s, b) => s + (b.amount ?? 0), 0)
  const monthlyIn = active.filter((b) => b.kind === 'income').reduce((s, b) => s + (b.amount ?? 0), 0)

  return (
    <>
      {canEdit && (
        <button className="btn primary block" onClick={() => setEditing({ kind: 'expense', active: true })}>
          <Icon name="plus" /> Nova conta fixa
        </button>
      )}
      <div className="totals-bar">
        <span>Fixas por mês <b className="neg">{money(monthlyOut)}</b></span>
        {monthlyIn > 0 && <span>Ganhos fixos <b className="pos">{money(monthlyIn)}</b></span>}
      </div>
      {data.length === 0 && <p className="empty">Cadastre aluguel, luz, água, internet, salário… e elas serão lançadas sozinhas todo mês.</p>}
      <div className="card flush">
        {data.map((b) => {
          const cat = idx.get(b.category_id)
          return (
            <button key={b.id} className={`tx-main list-btn ${b.active ? '' : 'dim'}`} disabled={!canEdit} onClick={() => setEditing(b)}>
              <span className="tx-icon" style={{ background: `${idx.root(b.category_id)?.color ?? '#94a3b8'}22` }}>{cat?.icon ?? '🔁'}</span>
              <span className="tx-text">
                <span className="tx-desc">{b.description}</span>
                <span className="tx-meta">
                  Todo dia {b.day_of_month} · {b.kind === 'income' && b.income_source ? incomeSourceLabel(b.income_source) : idx.label(b.category_id)}
                  {b.amount_type === 'variable' ? ' · variável' : ''}{b.active ? '' : ' · pausada'}
                </span>
              </span>
              <span className={`tx-amount ${b.kind === 'expense' ? 'neg' : 'pos'}`}>
                {b.amount == null ? <span className="muted">variável</span> : `${b.amount_type === 'variable' ? '≈ ' : ''}${money(b.amount)}`}
              </span>
            </button>
          )
        })}
      </div>
      {editing && <RecurringEditor bill={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function RecurringEditor({ bill, onClose }: { bill: Partial<RecurringBill>; onClose: () => void }) {
  const { run } = useApp()
  const [kind, setKind] = useState<Kind>(bill.kind ?? 'expense')
  const [description, setDescription] = useState(bill.description ?? '')
  const [amount, setAmount] = useState(moneyInput(bill.amount))
  const [day, setDay] = useState(String(bill.day_of_month ?? Number(today().slice(8))))
  const [categoryId, setCategoryId] = useState(bill.category_id ?? null)
  const [paymentId, setPaymentId] = useState(bill.payment_method_id ?? null)
  const [active, setActive] = useState(bill.active ?? true)
  const [startMonth, setStartMonth] = useState((bill.start_month ?? startOfMonth(today())).slice(0, 7))
  const [endMonth, setEndMonth] = useState(bill.end_month?.slice(0, 7) ?? '')
  const [notes, setNotes] = useState(bill.notes ?? '')
  const [amountType, setAmountType] = useState<AmountType>(bill.amount_type ?? 'fixed')
  const [source, setSource] = useState<IncomeSource>(bill.income_source ?? 'trabalho')
  const value = parseMoney(amount)
  const d = parseDay(day)
  const variable = kind === 'expense' && amountType === 'variable'
  const amountOk = value > 0 || (variable && !amount.trim())
  const periodOk = !endMonth || endMonth >= startMonth
  const valid = amountOk && d != null && periodOk && description.trim()

  async function save() {
    if (!valid) return
    const ok = await run(async () => {
      const saved = await api.saveRecurring({
        ...(bill as RecurringBill),
        kind, description: description.trim(), amount: value > 0 ? value : null, day_of_month: d!,
        amount_type: kind === 'expense' ? amountType : 'fixed', income_source: kind === 'income' ? source : null,
        category_id: categoryId, payment_method_id: paymentId, active,
        start_month: `${startMonth}-01`, end_month: endMonth ? `${endMonth}-01` : null,
        generated_until: bill.generated_until ?? null, notes: notes.trim() || null,
      })
      if (bill.id) await propagateRecurring(saved)
      await generateRecurring([saved])
      return true
    }, bill.id ? 'Conta fixa atualizada' : 'Conta fixa criada')
    if (ok) onClose()
  }

  async function remove() {
    if (!bill.id || !confirm('Excluir esta conta fixa? Os lançamentos já feitos continuam no histórico.')) return
    const ok = await run(() => api.deleteRecurring(bill.id!).then(() => true), 'Conta fixa excluída')
    if (ok) onClose()
  }

  return (
    <Sheet
      title={bill.id ? 'Editar conta fixa' : 'Nova conta fixa'} onClose={onClose}
      footer={<>
        {bill.id && <button className="btn danger ghost" onClick={remove}>Excluir</button>}
        <button className="btn primary grow" disabled={!valid} onClick={save}>Salvar</button>
      </>}
    >
      <Segmented value={kind} onChange={(k) => { setKind(k); setCategoryId(null) }} options={[
        { value: 'expense', label: 'Conta a pagar', className: 'neg' }, { value: 'income', label: 'Ganho fixo', className: 'pos' },
      ]} />
      <Field label="Descrição"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel, Luz, Salário" /></Field>
      {kind === 'expense' ? (
        <Field label="O valor muda todo mês?">
          <Segmented value={amountType} onChange={setAmountType} options={[
            { value: 'fixed', label: 'Valor fixo' }, { value: 'variable', label: 'Variável (água, luz…)' },
          ]} />
        </Field>
      ) : (
        <Field label="Origem da renda">
          <select value={source} onChange={(e) => setSource(e.target.value as IncomeSource)}>
            {INCOME_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
          </select>
        </Field>
      )}
      <div className="row2">
        <Field label={variable ? 'Valor estimado (opcional)' : 'Valor por mês'}><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label={kind === 'income' ? 'Dia do recebimento' : 'Dia do vencimento'}>
          <input type="number" inputMode="numeric" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
      </div>
      {d == null && <p className="bad-text small">O dia precisa ser um número de 1 a 31.</p>}
      {d != null && d > 28 && <p className="muted small">Nos meses com menos dias, a conta vence no último dia do mês.</p>}
      {!periodOk && <p className="bad-text small">O mês final precisa ser depois do mês inicial.</p>}
      {variable && <p className="note">Todo mês a conta aparece em "A pagar" com <b>Informar valor</b>. Você preenche quando a conta chegar.</p>}
      <Field label="Categoria"><CategorySelect kind={kind} value={categoryId} onChange={setCategoryId} includeId={bill.category_id} /></Field>
      <Field label="Forma de pagamento"><PaymentSelect value={paymentId} onChange={setPaymentId} /></Field>
      <div className="row2">
        <Field label="Começa em"><input type="month" value={startMonth} onChange={(e) => e.target.value && setStartMonth(e.target.value)} /></Field>
        <Field label="Termina em" hint="Vazio = sem fim"><input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} /></Field>
      </div>
      <Toggle checked={active} onChange={setActive} label="Ativa (lançar automaticamente)" />
      <Field label="Observações"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {bill.id && <p className="note">Ao salvar, os meses futuros ainda não pagos são atualizados com os novos dados.</p>}
    </Sheet>
  )
}
