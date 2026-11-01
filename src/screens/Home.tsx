import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MyAvatar } from '../components/Avatar'
import { Donut, ScoreRing, SliceList } from '../components/Charts'
import { BillRow, billItems } from '../components/Invoice'
import { MovementSheet } from '../components/ReserveSheets'
import { CashCard } from '../components/Cash'
import { ReservesCard } from './Reserves'
import { Icon } from '../components/Icon'
import { PeriodPicker, initialPeriod } from '../components/PeriodPicker'
import { PermissionHelp, useReminderPermission } from '../components/Reminders'
import { SpaceSwitcher } from '../components/SpaceSwitcher'
import { SyncBanner } from '../components/SyncBadge'
import { TxRow } from '../components/TxRow'
import { api } from '../lib/api'
import { addDays, fmt, previousPeriod, today } from '../lib/dates'
import { compareSpending, insights } from '../lib/compare'
import { money, pct } from '../lib/format'
import { budgetStatus } from '../lib/budgets'
import { computeHealth } from '../lib/health'
import { homeLayout, type WidgetId } from '../lib/prefs'
import { isGoal, isReserve, reserveFlow, type Goal } from '../lib/reserves'
import { byCategory, sumBy } from '../lib/services'
import { amt, type Transaction } from '../lib/types'
import { useApp, useLoad } from '../store'

export function Home() {
  const { idx, profile, space, canEdit, paymentMethods, prefs } = useApp()
  const nav = useNavigate()
  const [p, setP] = useState(initialPeriod('mes'))
  // No computador o detalhe da saúde financeira já abre expandido
  const [showHealth, setShowHealth] = useState(() => window.matchMedia?.('(min-width: 1024px)').matches ?? false)
  const [contribGoal, setContribGoal] = useState<Goal | null>(null)
  const reminders = useReminderPermission()
  const [hideReminderCard, setHideReminderCard] = useState(() => {
    try { return localStorage.getItem('fv-reminder-card') === 'hidden' } catch { return false }
  })
  const { from, to } = p.period

  const { data } = useLoad(async () => {
    const prev = previousPeriod('mes', { from, to })
    const [month, unpaid, plans, recurring, goals, contributions, before] = await Promise.all([
      api.listTransactions(from, to),
      api.listUnpaid(addDays(today(), 30)),
      api.listPlanTransactions(),
      api.listRecurring(),
      api.listGoals(),
      api.listContributions(),
      api.listTransactions(prev.from, prev.to),
    ])
    return { month, unpaid, plans, recurring, goals, contributions, before, prevFrom: prev.from }
  }, [from, to])

  const view = useMemo(() => {
    if (!data) return null
    const { month, unpaid, plans, recurring, goals, contributions, before, prevFrom } = data
    const active = recurring.filter((r) => r.active)
    const estimate = new Map(active.map((r) => [r.id, r.amount ?? 0]))
    // Previsto: contas variáveis ainda sem valor entram pela estimativa da conta fixa
    const expected = (t: Transaction) => t.amount ?? (t.recurring_bill_id ? estimate.get(t.recurring_bill_id) ?? 0 : 0)
    const pendingAmounts = month.filter((t) => t.amount == null).length
    const income = month.filter((t) => t.kind === 'income').reduce((s, t) => s + expected(t), 0)
    const expense = month.filter((t) => t.kind === 'expense').reduce((s, t) => s + expected(t), 0)
    const paid = month.filter((t) => t.paid)
    const realized = sumBy(paid, 'income') - sumBy(paid, 'expense')

    const fixedIncome = active.filter((r) => r.kind === 'income').reduce((s, r) => s + (r.amount ?? 0), 0)
    const fixedBills = active.filter((r) => r.kind === 'expense')
    const fixedExpense = fixedBills.reduce((s, r) => s + (r.amount ?? 0), 0)
    const variableNoEstimate = fixedBills.filter((r) => r.amount_type === 'variable' && r.amount == null).length
    const hasVariable = fixedBills.some((r) => r.amount_type === 'variable')

    const activeGoals = goals.filter((g) => !g.archived).filter(isGoal)
    const goal = activeGoals[0] ?? null
    const highlights = insights(compareSpending(month, before, idx), 3)
    const saved = goal ? contributions.filter((c) => c.goal_id === goal.id).reduce((s, c) => s + c.amount, 0) : 0

    const reserves = reserveFlow(goals.filter(isReserve), contributions, from, to)
    const overdue = unpaid.filter((t) => t.date < today())
    const upcoming = unpaid.filter((t) => t.kind === 'expense').sort((a, b) => (a.date < b.date ? -1 : 1))
    const slices = byCategory(month, idx, 'expense')
    const budgets = new Map<string, number>()
    for (const c of idx.roots('expense')) if (c.monthly_budget) budgets.set(c.id, c.monthly_budget)
    const health = computeHealth({ month, overdue, futureInstallments: plans, idx })
    const alerts = budgetStatus(month, idx).filter((s) => s.level !== 'ok')
    return {
      month, income, expense, realized, pendingAmounts, fixedIncome, fixedExpense, variableNoEstimate, hasVariable,
      alerts, reserves, goal, saved, otherGoals: activeGoals.length - 1, highlights, prevLabel: fmt.month(prevFrom), upcoming, overdue, slices, budgets, health, spent: sumBy(month, 'expense'),
    }
  }, [data, idx, from, to])

  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  // Blocos escolhidos em Ajustes › Personalizar (ordem e visibilidade)
  const layout = homeLayout(prefs)
  const visible = layout.filter((w) => w.visible)
  const main = visible.filter((w) => w.col === 'main')
  const side = visible.filter((w) => w.col === 'side')
  const slotStyle = (position: number) => ({ order: 2 + position * 2, '--d': `${Math.min(position, 6) * 0.03}s` }) as CSSProperties
  const reminderCard = view && !space.role && !hideReminderCard && (reminders.state === 'prompt' || reminders.state === 'denied') ? (
    <section className="card reminder-card">
      <div className="card-title"><h3>🔔 Ative os lembretes</h3>
        <button className="link muted" onClick={() => {
          setHideReminderCard(true)
          try { localStorage.setItem('fv-reminder-card', 'hidden') } catch { /* sem armazenamento */ }
        }}>Agora não</button>
      </div>
      <p className="muted small">Avisamos 2 dias antes, no dia e se alguma conta vencer, mesmo com o app fechado.</p>
      {reminders.state === 'prompt'
        ? <button className="btn primary block" onClick={reminders.ask}>Permitir notificações</button>
        : <PermissionHelp state="denied" />}
    </section>
  ) : null
  const blocks: Record<WidgetId, ReactNode> = !view ? ({} as Record<WidgetId, ReactNode>) : {
    saldo: (
    <section className="card hero">
      <p className="hero-label">Saldo previsto do mês</p>
      <p className={`hero-value ${view.income - view.expense < 0 ? 'neg' : ''}`}>{money(view.income - view.expense)}</p>
      <div className="hero-split">
        <div><span className="dot pos" /> Ganhos<strong>{money(view.income)}</strong></div>
        <div><span className="dot neg" /> Gastos<strong>{money(view.expense)}</strong></div>
      </div>
      <div className="hero-foot muted small">
        <span>Já realizado: <b>{money(view.realized)}</b></span>
        {view.pendingAmounts > 0 && <span>{view.pendingAmounts} conta(s) com valor estimado</span>}
        {(view.reserves.sent > 0 || view.reserves.withdrawn > 0) && <>
          <span>Para reservas: <b>{money(view.reserves.net)}</b></span>
          <span>Livre: <b>{money(view.income - view.expense - view.reserves.net)}</b></span>
        </>}
      </div>
    </section>
    ),
    caixa: <CashCard />,
    fixos: (
    <section className="stat-grid">
      <Link to="/contas?tab=fixas" className="card stat">
        <span className="stat-label">Renda fixa</span>
        <strong className="pos">{money(view.fixedIncome)}</strong>
        <span className="muted small">por mês</span>
      </Link>
      <Link to="/contas?tab=fixas" className="card stat">
        <span className="stat-label">Gastos fixos</span>
        <strong className="neg">{view.hasVariable ? '≈ ' : ''}{money(view.fixedExpense)}</strong>
        <span className="muted small">
          {view.fixedIncome > 0 ? `${pct(view.fixedExpense / view.fixedIncome)} da renda fixa` : 'por mês'}
          {view.variableNoEstimate > 0 && ` · +${view.variableNoEstimate} variável(is)`}
        </span>
      </Link>
    </section>
    ),
    contas: (
    <section className="card">
      <div className="card-title">
        <h3>Próximas contas</h3>
        <Link to="/contas" className="link">Ver todas</Link>
      </div>
      {view.upcoming.length ? (
        <>
          <div className="legend">
            <span><i className="lg good" /> Em dia</span><span><i className="lg warn" /> Perto de vencer</span><span><i className="lg bad" /> Vencida ou crítica</span>
          </div>
          {billItems(view.upcoming, paymentMethods).slice(0, 6).map((x) => <BillRow key={x.kind === 'tx' ? x.t.id : `${x.inv.card.id}${x.inv.due}`} item={x} />)}
        </>
      ) : <p className="empty">Nenhuma conta a pagar nos próximos 30 dias. 🎉</p>}
    </section>
    ),
    ultimos: (
    <section className="card">
      <div className="card-title">
        <h3>Últimos lançamentos</h3>
        <Link to="/lancamentos" className="link">Ver todos</Link>
      </div>
      {view.month.length
        ? view.month.filter((t) => amt(t) > 0 || t.paid).slice(0, 6).map((t) => <TxRow key={t.id} t={t} showDate />)
        : <p className="empty">Nada por aqui ainda.</p>}
    </section>
    ),
    limites: (
    view.alerts.length > 0 && (
      <section className={`card budget-alert ${view.alerts.some((a) => a.level === 'over') ? 'over' : ''}`}>
        <div className="card-title"><h3>⚠️ Atenção aos limites</h3><Link to="/ajustes/categorias" className="link">Limites</Link></div>
        {view.alerts.map((a) => (
          <Link key={a.category.id} to={`/lancamentos?cat=${a.category.id}&from=${from}&to=${to}`} className="budget-row">
            <span className="factor-top">
              <span>{a.category.icon} {a.category.name}</span>
              <span className={a.level === 'over' ? 'bad-text' : 'warn-text'}>{pct(a.ratio)}</span>
            </span>
            <span className="bar"><span style={{ width: `${Math.min(100, a.ratio * 100)}%`, background: a.level === 'over' ? 'var(--bad)' : 'var(--warn)' }} /></span>
            <span className="muted small">
              {money(a.spent)} de {money(a.limit)} · {a.spent > a.limit ? `estourou ${money(a.spent - a.limit)}` : `resta ${money(a.limit - a.spent)}`}
            </span>
          </Link>
        ))}
      </section>
    )
    ),
    saude: (
    <section className="card health" onClick={() => setShowHealth((v) => !v)}>
      <div className="health-head">
        <ScoreRing score={view.health.score} color={view.health.color} />
        <div>
          <p className="muted small">Saúde financeira</p>
          <h2 style={{ color: view.health.color }}>{view.health.level}</h2>
          <p className="small">{view.health.tips[0]}</p>
        </div>
      </div>
      {showHealth && (
        <div className="health-detail">
          {view.health.factors.map((f) => (
            <div key={f.label} className="factor">
              <div className="factor-top"><span>{f.label}</span><span className="muted">{f.points}/{f.max}</span></div>
              <span className="bar"><span style={{ width: `${(f.points / f.max) * 100}%`, background: view.health.color }} /></span>
              <span className="muted small">{f.detail}</span>
            </div>
          ))}
          {view.health.tips.length > 1 && (
            <ul className="tips">{view.health.tips.slice(1).map((t) => <li key={t}>{t}</li>)}</ul>
          )}
        </div>
      )}
      <p className="muted small center">{showHealth ? 'Toque para recolher' : 'Toque para ver o detalhe'}</p>
    </section>
    ),
    meta: (
    view.goal ? (
      <div className="card goal-card" role="link" tabIndex={0} onClick={() => nav('/metas')}>
        <div className="goal-top">
          <span className="goal-icon">{view.goal.icon}</span>
          <div className="grow">
            <span className="stat-label">Meta · {view.goal.name}</span>
            <strong>{money(view.saved)} <span className="muted small">de {money(view.goal.target_amount)}</span></strong>
          </div>
          <span className="goal-pct">{pct(Math.min(1, view.saved / view.goal.target_amount))}</span>
        </div>
        <span className="bar gold"><span style={{ width: `${Math.min(100, (view.saved / view.goal.target_amount) * 100)}%` }} /></span>
        <div className="goal-foot">
          <span className="muted small">
            {view.saved >= view.goal.target_amount ? 'Meta alcançada! 🎉'
              : view.goal.monthly_contribution ? `Aporte de ${money(view.goal.monthly_contribution)}/mês` : 'Ver detalhes'}
            {view.otherGoals > 0 && ` · +${view.otherGoals} meta(s)`}
          </span>
          {canEdit && view.saved < view.goal.target_amount && (
            <button className="btn ghost sm-btn gold-btn" onClick={(e) => { e.stopPropagation(); setContribGoal(view.goal) }}>Aportar</button>
          )}
        </div>
      </div>
    ) : canEdit && (
      <Link to="/metas" className="card goal-empty"><span className="goal-icon">🎯</span>
        <span className="grow"><b>Crie uma meta de economia</b><span className="muted small"> · viagem, carro, casa…</span></span>
        <Icon name="right" /></Link>
    )
    ),
    reservas: (
    <ReservesCard />
    ),
    gastos: (
    <section className="card">
      <div className="card-title"><h3>Para onde foi o dinheiro</h3></div>
      {view.slices.length ? (
        <>
          <Donut data={view.slices} total={view.spent} label="Gastos" />
          <SliceList
            data={view.slices} total={view.spent} budgets={view.budgets}
            onPick={(s) => nav(`/lancamentos?cat=${s.id}&from=${from}&to=${to}`)}
          />
        </>
      ) : <p className="empty">Nenhum gasto neste período. Toque no <b>+</b> para lançar.</p>}
    </section>
    ),
    destaques: (
    view.highlights.length > 0 && (
      <section className="card">
        <div className="card-title"><h3>Destaques do mês</h3><Link to="/relatorios" className="link">Relatórios</Link></div>
        <p className="muted small">Comparado com {view.prevLabel.toLowerCase()}</p>
        <ul className="insights">{view.highlights.map((h) => (
          <li key={h} className={/subiu|novo gasto/.test(h) ? 'up' : 'down'}>{h}</li>
        ))}</ul>
      </section>
    )
    ),
  }

  return (
    <div className="screen">
      <header className="top home-top">
        <Link to="/ajustes/perfil" className="home-avatar" aria-label="Meu perfil"><MyAvatar size={48} /></Link>
        <div className="grow greet">
          <span className="greet-hi">{hello},</span>
          <h1 className="hello">{profile?.display_name}</h1>
          <SpaceSwitcher />
        </div>
        <Link to="/ajustes" className="icon-btn settings-link" aria-label="Ajustes"><Icon name="gear" /></Link>
      </header>

      <SyncBanner />
      {space.role && (
        <p className="note small shared-note">
          Você está vendo as finanças de <b>{space.name}</b>{space.role === 'viewer' ? ' (só visualizar).' : '. O que você lançar aqui entra nessas finanças.'}
        </p>
      )}
      <PeriodPicker value={p} onChange={setP} presets={false} />

      {!view ? <div className="skeleton tall" /> : (
        <>
          {/* No computador: duas colunas; no celular, uma só, na ordem escolhida (style.order) */}
          <div className={`dash ${side.length && main.length ? '' : 'single'}`}>
            <div className="dash-main">
              {main.map((w) => <div key={w.id} className="dash-slot" style={slotStyle(w.position)}>{blocks[w.id]}</div>)}
            </div>
            <div className="dash-side">
              {reminderCard && <div className="dash-slot" style={{ order: 3 }}>{reminderCard}</div>}
              {side.map((w) => <div key={w.id} className="dash-slot" style={slotStyle(w.position)}>{blocks[w.id]}</div>)}
            </div>
          </div>
          {!layout.some((w) => w.visible) && <p className="empty">Todos os blocos do Início estão escondidos.</p>}
          <Link to="/ajustes/personalizar" className="btn ghost customize-link"><Icon name="edit" size={18} /> Personalizar o Início</Link>
        </>
      )}
      {contribGoal && <MovementSheet goal={contribGoal} kind="in" balance={view?.saved ?? 0} onClose={() => setContribGoal(null)} />}
    </div>
  )
}
