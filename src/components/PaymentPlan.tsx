import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Invoice } from '../lib/cards'
import { addDays, fmt, today } from '../lib/dates'
import { priorityAvailable } from '../lib/features'
import { money, moneyInput, parseMoney } from '../lib/format'
import { effectivePriority, PRIORITY, recommend, type Plan, type PlanBill, type PlanStep, type Priority } from '../lib/priority'
import type { RecurringBill, Transaction } from '../lib/types'
import { useApp, useLoad } from '../store'
import { loadCash } from './Cash'
import { Field, MoneyInput } from './Fields'
import { Icon } from './Icon'
import { billItems, InvoiceSheet } from './Invoice'
import { Sheet } from './Sheet'

/** Quantos dias à frente o plano olha. */
export const HORIZON = 45
const CASH_KEY = 'fv-plan-cash'

type Ref = { kind: 'tx'; t: Transaction } | { kind: 'inv'; inv: Invoice }
interface PlanData {
  plan: Plan
  refs: Map<string, Ref>
  /** de onde veio o dinheiro de hoje */
  cashSource: 'caixa' | 'manual' | 'none'
  lateIncomes: number
  recurring: Map<string, RecurringBill>
  sources: Map<string, ReturnType<typeof effectivePriority>['source']>
  priorityOk: boolean
}

const manualCash = (): number | null => {
  try {
    const v = localStorage.getItem(CASH_KEY)
    return v == null ? null : Number(v)
  } catch { return null }
}

/** Monta o plano com as contas e ganhos em aberto dos próximos dias e o dinheiro de hoje. */
export function usePlan() {
  const { idx, paymentMethods } = useApp()
  const [cashTick, setCashTick] = useState(0)
  const load = useLoad<PlanData>(async () => {
    const t0 = today()
    const until = addDays(t0, HORIZON)
    const [unpaid, recurringList, cash, priorityOk] = await Promise.all([
      api.listUnpaid(until), api.listRecurring(), loadCash(paymentMethods), priorityAvailable(),
    ])
    const recurring = new Map(recurringList.map((r) => [r.id, r]))
    const estimate = (t: Transaction) => t.amount ?? (t.recurring_bill_id ? recurring.get(t.recurring_bill_id)?.amount ?? 0 : 0)
    const refs = new Map<string, Ref>()
    const sources = new Map<string, ReturnType<typeof effectivePriority>['source']>()
    const bills: PlanBill[] = []
    for (const item of billItems(unpaid.filter((t) => t.kind === 'expense'), paymentMethods)) {
      if (item.kind === 'inv') {
        const key = `inv:${item.inv.card.id}:${item.inv.due}`
        refs.set(key, { kind: 'inv', inv: item.inv })
        sources.set(key, 'auto')
        bills.push({ key, label: `Fatura ${item.inv.card.name}`, due: item.inv.due, amount: item.inv.pending, priority: 2 })
      } else {
        const t = item.t
        const p = effectivePriority(t, idx, recurring)
        refs.set(t.id, { kind: 'tx', t })
        sources.set(t.id, p.source)
        bills.push({ key: t.id, label: t.description || idx.label(t.category_id), due: t.date, amount: estimate(t), estimated: t.amount == null, priority: p.level })
      }
    }
    const incomesRaw = unpaid.filter((t) => t.kind === 'income')
    const incomes = incomesRaw.filter((t) => t.date >= t0)
      .map((t) => ({ key: t.id, label: t.description || idx.label(t.category_id), date: t.date, amount: estimate(t) }))
    const manual = manualCash()
    const cashSource: PlanData['cashSource'] = cash.ok && cash.accounts.some((a) => !a.account.archived) ? 'caixa' : manual != null ? 'manual' : 'none'
    const start = cashSource === 'caixa' ? cash.total : manual ?? 0
    return {
      plan: recommend({ cash: start, today: t0, bills, incomes }), refs, cashSource, recurring, sources, priorityOk,
      lateIncomes: incomesRaw.filter((t) => t.date < t0).length,
    }
  }, [paymentMethods, idx, cashTick])
  return { ...load, reloadCash: () => setCashTick((n) => n + 1) }
}

const dayLabel = (d: string) => (d === today() ? 'Com o dinheiro de hoje' : fmt.weekday(d))

function PriorityChip({ level, onClick }: { level: Priority; onClick?: () => void }) {
  const p = PRIORITY[level]
  return onClick
    ? <button type="button" className={`prio prio-${level}`} onClick={onClick} title="Trocar a prioridade">{p.short}</button>
    : <span className={`prio prio-${level}`}>{p.short}</span>
}

function advice(s: PlanStep): string {
  const due = s.overdue ? `atrasada há ${-s.daysLeft} dia(s)` : s.daysLeft === 0 ? 'vence hoje' : `vence ${fmt.short(s.bill.due)}`
  if (s.action === 'pay') {
    if (s.payOn === today()) return s.daysLeft <= 2 ? `Pague hoje · ${due}` : `Já dá para pagar · ${due}`
    return `Pague em ${fmt.short(s.payOn!)} com ${s.fundedBy} · ${due}`
  }
  if (s.action === 'defer') return `Espere juntar: pague inteira em ${fmt.short(s.payOn!)} com ${s.fundedBy} · ${due}`
  return s.paidAmount > 0
    ? `Junte para pagar inteira: ${money(s.paidAmount)} já guardados, faltam ${money(s.missing)} · ${due}`
    : `Não dá para pagar nos próximos ${HORIZON} dias: adie, negocie ou cancele · ${due}`
}

/** Linha de uma conta no plano. */
function StepRow({ s, onPriority, onOpen }: { s: PlanStep; onPriority?: () => void; onOpen: () => void }) {
  return (
    <div className={`plan-row act-${s.action}`}>
      <button className="plan-main" onClick={onOpen}>
        <span className="plan-text">
          <span className="plan-title">{s.bill.label}</span>
          <span className={`plan-advice ${s.action !== 'pay' || s.overdue ? 'alert-text' : ''}`}>{advice(s)}</span>
        </span>
        <span className="plan-right">
          <b className="neg">{s.bill.estimated ? '≈ ' : ''}{money(s.bill.amount)}</b>
          {s.balanceAfter != null && <span className="muted small">sobra {money(s.balanceAfter)}</span>}
          {s.action === 'short' && <span className="bad-text small">faltam {money(s.missing)}</span>}
        </span>
      </button>
      <PriorityChip level={s.bill.priority} onClick={onPriority} />
    </div>
  )
}

/** Contas › Plano: pagamentos recomendados. */
export function PaymentPlan() {
  const { canEdit } = useApp()
  const { data, reloadCash } = usePlan()
  const [editingCash, setEditingCash] = useState(false)
  const [cashInput, setCashInput] = useState('')
  const [prio, setPrio] = useState<PlanStep | null>(null)
  const [pay, setPay] = useState<Ref | null>(null)
  const { openPay } = useApp()

  if (!data) return <div className="skeleton tall" />
  const { plan } = data
  const groups = new Map<string, PlanStep[]>()
  for (const s of plan.steps) {
    const k = s.payOn ?? 'sem'
    groups.set(k, [...(groups.get(k) ?? []), s])
  }
  const before = plan.needBeforeNext
  const gapNext = Math.max(0, before - plan.availableNow)

  function saveCash() {
    const v = parseMoney(cashInput)
    try { if (!Number.isNaN(v)) localStorage.setItem(CASH_KEY, String(v)) } catch { /* sem armazenamento */ }
    setEditingCash(false)
    reloadCash()
  }

  function open(s: PlanStep) {
    const ref = data!.refs.get(s.bill.key)
    if (!ref) return
    if (ref.kind === 'tx' && canEdit) openPay(ref.t)
    else setPay(ref)
  }

  return (
    <>
      <section className="card plan-summary">
        <div className="plan-free">
          <span className="stat-label">Livre agora</span>
          <strong className={plan.freeNow > 0 ? 'pos' : ''}>{money(plan.freeNow)}</strong>
          <span className="muted small">
            {plan.freeNow > 0
              ? 'Do dinheiro de hoje, este valor pode ser usado sem atrapalhar nenhuma conta, se os ganhos entrarem nas datas previstas.'
              : 'Todo o dinheiro de hoje já está separado para as contas do plano.'}
          </span>
        </div>
        <div className="plan-sum-grid">
          <div>
            <span className="stat-label">Você tem hoje</span>
            <strong className={plan.cash < 0 ? 'neg' : ''}>{money(plan.cash)}</strong>
            {plan.availableNow > plan.cash && <span className="pos small">+ {money(plan.availableNow - plan.cash)} a receber hoje</span>}
            <span className="muted small">
              {data.cashSource === 'caixa' ? <Link to="/caixa" className="link small">pelo Caixa</Link>
                : <button className="link small" onClick={() => { setCashInput(moneyInput(plan.cash)); setEditingCash(true) }}>{data.cashSource === 'manual' ? 'alterar' : 'informar'}</button>}
            </span>
          </div>
          <div>
            <span className="stat-label">{plan.nextIncome ? `Até ${fmt.short(plan.nextIncome.date)}` : 'Próximos dias'}</span>
            <strong className={gapNext > 0 ? 'neg' : ''}>{money(before)}</strong>
            <span className="muted small">{plan.nextIncome ? `em contas antes de: ${plan.nextIncome.label}` : 'em contas (nenhuma entrada prevista)'}</span>
          </div>
        </div>
        <p className={`plan-verdict ${plan.shortfall > 0 ? 'bad' : gapNext > 0 ? 'warn' : 'good'}`}>
          {plan.shortfall > 0
            ? `Nos próximos ${HORIZON} dias faltam ${money(plan.shortfall)}: o plano protege as contas mais importantes e mostra o que adiar ou negociar.`
            : gapNext > 0
              ? `Até a próxima entrada faltam ${money(gapNext)}: algumas contas ficam para quando o dinheiro entrar.`
              : `Dá para pagar tudo dos próximos ${HORIZON} dias. Siga a ordem abaixo.`}
        </p>
        {plan.freeAtEnd > 0 && plan.shortfall === 0 && (
          <p className="muted small">Pagando tudo do plano, sobram <b>{money(plan.freeAtEnd)}</b> no fim dos {HORIZON} dias.</p>
        )}
        {data.cashSource === 'none' && <p className="note small">Monte o <Link to="/caixa" className="link small">Caixa</Link> ou informe quanto tem hoje, para o plano ficar certo.</p>}
        {data.lateIncomes > 0 && <p className="muted small">{data.lateIncomes} ganho(s) com data passada e não marcado(s) como recebido(s) não entram na conta.</p>}
      </section>

      {plan.steps.length === 0 ? <p className="empty">Nenhuma conta em aberto nos próximos {HORIZON} dias. 🎉</p> : (
        [...groups.entries()].map(([k, steps]) => (
          <section key={k} className="plan-group">
            <h3 className="day-head"><span>{k === 'sem' ? 'Esperando juntar dinheiro' : dayLabel(k)}</span>
              {k !== 'sem' && steps[0].fundedBy && steps[0].fundedBy !== 'hoje' && <span className="muted">com {steps[0].fundedBy}</span>}</h3>
            <div className="card flush">
              {steps.map((s) => <StepRow key={s.bill.key} s={s} onOpen={() => open(s)} onPriority={canEdit && data.priorityOk && data.refs.get(s.bill.key)?.kind === 'tx' ? () => setPrio(s) : undefined} />)}
            </div>
          </section>
        ))
      )}

      <section className="card">
        <h3>Como o plano funciona</h3>
        <ul className="small plan-how">
          <li>Usa o dinheiro de hoje ({data.cashSource === 'caixa' ? 'total do Caixa' : 'valor informado'}) e cada ganho a receber, na data dele.</li>
          <li>As contas <b>Essenciais</b> escolhem o dinheiro primeiro, depois as de prioridade <b>Alta</b> (juros e multa), <b>Normal</b> e <b>Flexível</b>.</li>
          <li>Cada conta é paga com o dinheiro que entra mais perto do vencimento, sem passar dele.</li>
          <li>Nada de pagamento parcial: a conta é paga inteira ou espera o próximo dinheiro, que vai sendo guardado para ela (contas menos importantes não usam esse dinheiro).</li>
          <li><b>Livre agora</b> é o que sobra do dinheiro de hoje depois de separar tudo o que o plano precisa, contando que os ganhos entrem nas datas.</li>
          <li>Toque na etiqueta de prioridade para mudar o nível de uma conta.</li>
        </ul>
      </section>

      {editingCash && (
        <Sheet title="Quanto você tem hoje?" onClose={() => setEditingCash(false)} footer={<button className="btn primary grow" onClick={saveCash}>Usar este valor</button>}>
          <Field label="Dinheiro disponível agora" hint="Some o que tem nas contas e na carteira. Dica: com o Caixa montado, o app usa o total dele sozinho.">
            <MoneyInput value={cashInput} onChange={setCashInput} big autoFocus />
          </Field>
        </Sheet>
      )}
      {prio && data.refs.get(prio.bill.key)?.kind === 'tx' && (
        <PrioritySheet step={prio} t={(data.refs.get(prio.bill.key) as { t: Transaction }).t} data={data} onClose={() => setPrio(null)} />
      )}
      {pay?.kind === 'inv' && <InvoiceSheet inv={pay.inv} onClose={() => setPay(null)} />}
    </>
  )
}

/** Trocar a prioridade: só desta conta, de todos os meses (conta fixa) ou da categoria inteira. */
function PrioritySheet({ step, t, data, onClose }: { step: PlanStep; t: Transaction; data: PlanData; onClose: () => void }) {
  const { idx, run, bump, reloadMeta } = useApp()
  const rec = t.recurring_bill_id ? data.recurring.get(t.recurring_bill_id) : undefined
  const cat = idx.get(t.category_id)
  type Scope = 'tx' | 'recurring' | 'category'
  const [scope, setScope] = useState<Scope>(rec ? 'recurring' : 'tx')
  const [level, setLevel] = useState<Priority | null>(step.bill.priority)
  const source = data.sources.get(step.bill.key)

  async function save() {
    const ok = await run(async () => {
      if (scope === 'tx') await api.saveTransaction({ ...t, priority: level })
      if (scope === 'recurring' && rec) {
        await api.saveRecurring({ ...rec, priority: level })
        if (t.priority != null) await api.saveTransaction({ ...t, priority: null })
      }
      if (scope === 'category' && cat) {
        await api.saveCategory({ ...cat, priority: level })
        if (t.priority != null) await api.saveTransaction({ ...t, priority: null })
        if (rec?.priority != null) await api.saveRecurring({ ...rec, priority: null })
        await reloadMeta()
      }
      return true
    }, 'Prioridade salva')
    if (ok) { bump(); onClose() }
  }

  return (
    <Sheet title="Prioridade ao pagar" onClose={onClose} footer={<button className="btn primary grow" onClick={save}>Salvar</button>}>
      <p className="small"><b>{step.bill.label}</b> · {money(step.bill.amount)}</p>
      <div className="prio-options">
        {([1, 2, 3, 4] as Priority[]).map((p) => (
          <button key={p} type="button" className={`prio-option ${level === p ? 'on' : ''}`} onClick={() => setLevel(p)}>
            <span className={`prio prio-${p}`}>{PRIORITY[p].label}</span>
            <span className="muted small">{PRIORITY[p].desc}</span>
          </button>
        ))}
        <button type="button" className={`prio-option ${level == null ? 'on' : ''}`} onClick={() => setLevel(null)}>
          <span className="prio">Automática</span>
          <span className="muted small">O app sugere pela categoria e pelo nome.</span>
        </button>
      </div>
      <Field label="Vale para">
        <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
          <option value="tx">Só esta conta ({fmt.short(t.date)})</option>
          {rec && <option value="recurring">Todos os meses desta conta fixa</option>}
          {cat && <option value="category">Toda a categoria {cat.name}</option>}
        </select>
      </Field>
      {source && source !== 'auto' && <p className="muted small">Hoje vem de: {source === 'tx' ? 'esta conta' : source === 'recurring' ? 'a conta fixa' : 'a categoria'}.</p>}
    </Sheet>
  )
}

/** Bloco "Pague primeiro" do Início: as próximas recomendações. */
export function PayFirstCard() {
  const { data } = usePlan()
  if (!data || !data.plan.steps.length) return null
  const next = data.plan.steps.slice(0, 3)
  return (
    <section className="card pay-first">
      <div className="card-title"><h3>Pague primeiro</h3><Link to="/contas?tab=plano" className="link">Ver plano</Link></div>
      {next.map((s) => (
        <div key={s.bill.key} className="pay-first-row">
          <span className={`prio-dot prio-${s.bill.priority}`} aria-label={PRIORITY[s.bill.priority].label} />
          <span className="grow">
            <b>{s.bill.label}</b>
            <span className={`small ${s.action !== 'pay' || s.overdue ? 'alert-text' : 'muted'}`}>{advice(s)}</span>
          </span>
          <b className="neg">{money(s.bill.amount)}</b>
        </div>
      ))}
      {data.plan.shortfall > 0
        ? <p className="bad-text small">Faltam {money(data.plan.shortfall)} nos próximos {HORIZON} dias.</p>
        : data.plan.freeNow > 0 && <p className="small">Livre agora: <b className="pos">{money(data.plan.freeNow)}</b></p>}
      {!data.plan.steps.length && <p className="empty"><Icon name="check" /> Nada a pagar.</p>}
    </section>
  )
}
