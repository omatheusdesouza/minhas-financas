import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MyAvatar } from '../components/Avatar'
import { Donut, ScoreRing, SliceList } from '../components/Charts'
import { ContributionSheet } from '../components/ContributionSheet'
import { Icon } from '../components/Icon'
import { PeriodPicker, initialPeriod } from '../components/PeriodPicker'
import { PermissionHelp, useReminderPermission } from '../components/Reminders'
import { SyncBanner } from '../components/SyncBadge'
import { TxRow } from '../components/TxRow'
import { api } from '../lib/api'
import { addDays, fmt, previousPeriod, today } from '../lib/dates'
import { compareSpending, insights } from '../lib/compare'
import { money, pct } from '../lib/format'
import { computeHealth } from '../lib/health'
import { byCategory, sumBy } from '../lib/services'
import { amt, type SavingsGoal, type Transaction } from '../lib/types'
import { useApp, useLoad } from '../store'

export function Home() {
  const { idx, profile } = useApp()
  const nav = useNavigate()
  const [p, setP] = useState(initialPeriod('mes'))
  const [showHealth, setShowHealth] = useState(false)
  const [contribGoal, setContribGoal] = useState<SavingsGoal | null>(null)
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

    const activeGoals = goals.filter((g) => !g.archived)
    const goal = activeGoals[0] ?? null
    const highlights = insights(compareSpending(month, before, idx), 3)
    const saved = goal ? contributions.filter((c) => c.goal_id === goal.id).reduce((s, c) => s + c.amount, 0) : 0

    const overdue = unpaid.filter((t) => t.date < today())
    const upcoming = unpaid.filter((t) => t.kind === 'expense').sort((a, b) => (a.date < b.date ? -1 : 1))
    const slices = byCategory(month, idx, 'expense')
    const budgets = new Map<string, number>()
    for (const c of idx.roots('expense')) if (c.monthly_budget) budgets.set(c.id, c.monthly_budget)
    const health = computeHealth({ month, overdue, futureInstallments: plans, idx })
    return {
      month, income, expense, realized, pendingAmounts, fixedIncome, fixedExpense, variableNoEstimate, hasVariable,
      goal, saved, otherGoals: activeGoals.length - 1, highlights, prevLabel: fmt.month(prevFrom), upcoming, overdue, slices, budgets, health, spent: sumBy(month, 'expense'),
    }
  }, [data, idx])

  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div className="screen">
      <header className="top home-top">
        <Link to="/ajustes/perfil" className="home-avatar" aria-label="Meu perfil"><MyAvatar size={48} /></Link>
        <div className="grow">
          <p className="muted small">{hello},</p>
          <h1 className="hello">{profile?.display_name}</h1>
        </div>
        <Link to="/ajustes" className="icon-btn" aria-label="Ajustes"><Icon name="gear" /></Link>
      </header>

      <SyncBanner />
      <PeriodPicker value={p} onChange={setP} presets={false} />

      {!view ? <div className="skeleton tall" /> : (
        <>
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
            </div>
          </section>

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

          {view.goal ? (
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
                {view.saved < view.goal.target_amount && (
                  <button className="btn ghost sm-btn gold-btn" onClick={(e) => { e.stopPropagation(); setContribGoal(view.goal) }}>Aportar</button>
                )}
              </div>
            </div>
          ) : (
            <Link to="/metas" className="card goal-empty"><span className="goal-icon">🎯</span>
              <span className="grow"><b>Crie uma meta de economia</b><span className="muted small"> · reserva, viagem, carro…</span></span>
              <Icon name="right" /></Link>
          )}

          {view.highlights.length > 0 && (
            <section className="card">
              <div className="card-title"><h3>Destaques do mês</h3><Link to="/relatorios" className="link">Relatórios</Link></div>
              <p className="muted small">Comparado com {view.prevLabel.toLowerCase()}</p>
              <ul className="insights">{view.highlights.map((h) => (
                <li key={h} className={/subiu|novo gasto/.test(h) ? 'up' : 'down'}>{h}</li>
              ))}</ul>
            </section>
          )}

          {!hideReminderCard && (reminders.state === 'prompt' || reminders.state === 'denied') && (
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
          )}

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
                {view.upcoming.slice(0, 6).map((t) => <TxRow key={t.id} t={t} showDate />)}
              </>
            ) : <p className="empty">Nenhuma conta a pagar nos próximos 30 dias. 🎉</p>}
          </section>

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

          <section className="card">
            <div className="card-title">
              <h3>Últimos lançamentos</h3>
              <Link to="/lancamentos" className="link">Ver todos</Link>
            </div>
            {view.month.length
              ? view.month.filter((t) => amt(t) > 0 || t.paid).slice(0, 6).map((t) => <TxRow key={t.id} t={t} showDate />)
              : <p className="empty">Nada por aqui ainda.</p>}
          </section>
        </>
      )}
      {contribGoal && <ContributionSheet goal={contribGoal} onClose={() => setContribGoal(null)} />}
    </div>
  )
}
