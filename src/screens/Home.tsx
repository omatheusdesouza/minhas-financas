import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Donut, ScoreRing, SliceList } from '../components/Charts'
import { Icon } from '../components/Icon'
import { PeriodPicker, initialPeriod } from '../components/PeriodPicker'
import { TxRow } from '../components/TxRow'
import { api } from '../lib/api'
import { addDays, today } from '../lib/dates'
import { money } from '../lib/format'
import { computeHealth } from '../lib/health'
import { byCategory, sumBy } from '../lib/services'
import { useApp, useLoad } from '../store'

export function Home() {
  const { idx, user } = useApp()
  const nav = useNavigate()
  const [p, setP] = useState(initialPeriod('mes'))
  const [showHealth, setShowHealth] = useState(false)
  const { from, to } = p.period

  const { data } = useLoad(async () => {
    const [month, unpaid, plans] = await Promise.all([
      api.listTransactions(from, to),
      api.listUnpaid(addDays(today(), 10)),
      api.listPlanTransactions(),
    ])
    return { month, unpaid, plans }
  }, [from, to])

  const view = useMemo(() => {
    if (!data) return null
    const { month, unpaid, plans } = data
    const income = sumBy(month, 'income')
    const expense = sumBy(month, 'expense')
    const paid = month.filter((t) => t.paid)
    const realized = sumBy(paid, 'income') - sumBy(paid, 'expense')
    const toPay = month.filter((t) => !t.paid && t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
    const toReceive = month.filter((t) => !t.paid && t.kind === 'income').reduce((s, t) => s + t.amount, 0)
    const overdue = unpaid.filter((t) => t.date < today())
    const upcoming = unpaid.filter((t) => t.date >= today())
    const slices = byCategory(month, idx, 'expense')
    const budgets = new Map<string, number>()
    for (const c of idx.roots('expense')) if (c.monthly_budget) budgets.set(c.id, c.monthly_budget)
    const health = computeHealth({ month, overdue, futureInstallments: plans, idx })
    return { month, income, expense, realized, toPay, toReceive, overdue, upcoming, slices, budgets, health }
  }, [data, idx])

  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const name = user.email.split('@')[0]

  return (
    <div className="screen">
      <header className="top">
        <div>
          <p className="muted small">{hello},</p>
          <h1 className="hello">{name}</h1>
        </div>
        <Link to="/ajustes" className="icon-btn" aria-label="Ajustes"><Icon name="gear" /></Link>
      </header>

      <PeriodPicker value={p} onChange={setP} presets={false} />

      {!view ? <div className="skeleton tall" /> : (
        <>
          <section className="card hero">
            <p className="muted small">Saldo do período</p>
            <p className={`hero-value ${view.income - view.expense < 0 ? 'neg' : ''}`}>{money(view.income - view.expense)}</p>
            <div className="hero-split">
              <div><span className="dot pos" /> Ganhos<strong>{money(view.income)}</strong></div>
              <div><span className="dot neg" /> Gastos<strong>{money(view.expense)}</strong></div>
            </div>
            <div className="hero-foot muted small">
              <span>Já realizado: <b>{money(view.realized)}</b></span>
              {view.toPay > 0 && <span>A pagar: <b className="neg">{money(view.toPay)}</b></span>}
              {view.toReceive > 0 && <span>A receber: <b className="pos">{money(view.toReceive)}</b></span>}
            </div>
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

          {(view.overdue.length > 0 || view.upcoming.length > 0) && (
            <section className="card">
              <div className="card-title">
                <h3>Contas próximas</h3>
                <Link to="/contas" className="link">Ver todas</Link>
              </div>
              {view.overdue.length > 0 && (
                <p className="alert"><Icon name="alert" size={16} /> {view.overdue.length} atrasada(s) — {money(view.overdue.reduce((s, t) => s + t.amount, 0))}</p>
              )}
              {[...view.overdue, ...view.upcoming].slice(0, 6).map((t) => <TxRow key={t.id} t={t} showDate />)}
            </section>
          )}

          <section className="card">
            <div className="card-title"><h3>Para onde foi o dinheiro</h3></div>
            {view.slices.length ? (
              <>
                <Donut data={view.slices} total={view.expense} label="Gastos" />
                <SliceList
                  data={view.slices} total={view.expense} budgets={view.budgets}
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
              ? view.month.slice(0, 6).map((t) => <TxRow key={t.id} t={t} showDate />)
              : <p className="empty">Nada por aqui ainda.</p>}
          </section>
        </>
      )}
    </div>
  )
}
