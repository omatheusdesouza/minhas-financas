import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ContributionSheet } from '../components/ContributionSheet'
import { Field, MoneyInput, Toggle } from '../components/Fields'
import { Icon } from '../components/Icon'
import { Sheet } from '../components/Sheet'
import { api } from '../lib/api'
import { addMonths, fmt, today } from '../lib/dates'
import { money, moneyInput, parseMoney, pct } from '../lib/format'
import { goalProgress, monthLabel, type GoalProgress } from '../lib/goals'
import { parseDay } from '../lib/templates'
import type { SavingsGoal } from '../lib/types'
import { useApp, useLoad } from '../store'

const GOAL_ICONS = ['🎯', '🛟', '✈️', '🚗', '🏠', '🎓', '💍', '👶', '🏖️', '💻', '📱', '🏥', '🐷', '📈', '🎁', '⭐']

function useGoals() {
  return useLoad(async () => {
    const [goals, contributions] = await Promise.all([api.listGoals(), api.listContributions()])
    return { goals, contributions, progress: new Map(goals.map((g) => [g.id, goalProgress(g, contributions, today())])) }
  }, [])
}

function Status({ p, goal }: { p: GoalProgress; goal: SavingsGoal }) {
  if (p.done) return <span className="chip good">Meta alcançada 🎉</span>
  if (p.onTrack === true) return <span className="chip good">No ritmo do prazo</span>
  if (p.onTrack === false) return <span className="chip warn">Abaixo do ritmo</span>
  if (!goal.monthly_contribution) return <span className="chip">Sem aporte mensal</span>
  return null
}

export function GoalsScreen() {
  const { data } = useGoals()
  const [editing, setEditing] = useState<Partial<SavingsGoal> | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const nav = useNavigate()
  if (!data) return <div className="screen"><div className="skeleton tall" /></div>
  const list = data.goals.filter((g) => showArchived || !g.archived)
  const active = data.goals.filter((g) => !g.archived)
  const totalSaved = active.reduce((s, g) => s + (data.progress.get(g.id)?.saved ?? 0), 0)
  const totalTarget = active.reduce((s, g) => s + g.target_amount, 0)

  return (
    <div className="screen">
      <header className="top"><Link to="/" className="icon-btn" aria-label="Voltar"><Icon name="left" /></Link><h1>Metas</h1><span /></header>
      {active.length > 0 && (
        <section className="card hero goals-hero">
          <p className="hero-label">Total guardado</p>
          <p className="hero-value">{money(totalSaved)}</p>
          <span className="bar gold"><span style={{ width: `${Math.min(100, (totalSaved / (totalTarget || 1)) * 100)}%` }} /></span>
          <p className="muted small">{pct(totalSaved / (totalTarget || 1))} de {money(totalTarget)} em {active.length} meta(s)</p>
        </section>
      )}
      <button className="btn primary block" onClick={() => setEditing({ icon: '🎯', archived: false })}><Icon name="plus" /> Nova meta</button>
      {list.length === 0 && <p className="empty">Crie uma meta: reserva de emergência, viagem, carro novo… e acompanhe quanto falta.</p>}
      {list.map((g) => {
        const p = data.progress.get(g.id)!
        return (
          <button key={g.id} className={`card goal-card ${g.archived ? 'dim' : ''}`} onClick={() => nav(`/metas/${g.id}`)}>
            <div className="goal-top">
              <span className="goal-icon">{g.icon}</span>
              <div className="grow">
                <span className="stat-label">{g.name}{g.archived ? ' · arquivada' : ''}</span>
                <strong>{money(p.saved)} <span className="muted small">de {money(g.target_amount)}</span></strong>
              </div>
              <span className="goal-pct">{pct(p.pct)}</span>
            </div>
            <span className="bar gold"><span style={{ width: `${p.pct * 100}%` }} /></span>
            <div className="goal-foot">
              <Status p={p} goal={g} />
              <span className="muted small">
                {p.done ? '' : p.projected ? `Previsão: ${fmt.month(p.projected)}` : `Faltam ${money(p.remaining)}`}
              </span>
            </div>
          </button>
        )
      })}
      {data.goals.some((g) => g.archived) && <Toggle checked={showArchived} onChange={setShowArchived} label="Mostrar arquivadas" />}
      {editing && <GoalEditor goal={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

export function GoalDetailScreen() {
  const { id } = useParams()
  const { data } = useGoals()
  const { run } = useApp()
  const nav = useNavigate()
  const [contrib, setContrib] = useState(false)
  const [editing, setEditing] = useState(false)
  if (!data) return <div className="screen"><div className="skeleton tall" /></div>
  const goal = data.goals.find((g) => g.id === id)
  if (!goal) return <div className="screen"><p className="empty">Meta não encontrada.</p><Link className="link center" to="/metas">Voltar</Link></div>
  const p = data.progress.get(goal.id)!
  const list = data.contributions.filter((c) => c.goal_id === goal.id)
  const chart = p.history.map((h) => ({ label: monthLabel(h.month), total: h.total }))

  return (
    <div className="screen">
      <header className="top"><Link to="/metas" className="icon-btn" aria-label="Voltar"><Icon name="left" /></Link><h1>{goal.icon} {goal.name}</h1>
        <button className="icon-btn" aria-label="Editar meta" onClick={() => setEditing(true)}><Icon name="edit" /></button></header>

      <section className="card goal-detail">
        <div className="goal-ring-row">
          <svg width="120" height="120" viewBox="0 0 100 100" role="img" aria-label={`${pct(p.pct)} da meta`}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--line)" strokeWidth="9" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--gold)" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${p.pct * 263.9} 263.9`} transform="rotate(-90 50 50)" />
            <text x="50" y="57" textAnchor="middle" fontSize="22" fontWeight="600" fill="var(--text)" fontFamily="var(--serif)">{pct(p.pct)}</text>
          </svg>
          <div className="grow">
            <p className="stat-label">Guardado</p>
            <p className="goal-big">{money(p.saved)}</p>
            <p className="muted small">de {money(goal.target_amount)} · faltam {money(p.remaining)}</p>
            <Status p={p} goal={goal} />
          </div>
        </div>
        <ul className="kv">
          {goal.monthly_contribution && <li><span>Aporte mensal</span><span>{money(goal.monthly_contribution)}{goal.contribution_day ? ` · dia ${goal.contribution_day}` : ''}</span></li>}
          {!p.done && p.projected && <li><span>Previsão no ritmo atual</span><span>{fmt.month(p.projected)} ({p.monthsToGo} {p.monthsToGo === 1 ? 'mês' : 'meses'})</span></li>}
          {goal.target_date && <li><span>Prazo</span><span>{fmt.day(goal.target_date)}</span></li>}
          {!p.done && p.neededPerMonth != null && <li><span>Para cumprir o prazo</span><span>{money(p.neededPerMonth)}/mês</span></li>}
        </ul>
        {!goal.archived && <button className="btn primary block" onClick={() => setContrib(true)}><Icon name="plus" /> Registrar aporte</button>}
      </section>

      <section className="card">
        <div className="card-title"><h3>Evolução</h3></div>
        {chart.length ? (
          <div className="chart">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="goalfill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#D8B36A" stopOpacity={0.5} /><stop offset="1" stopColor="#D8B36A" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={52}
                  domain={[0, Math.max(goal.target_amount, p.saved)]}
                  tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v))} />
                <ReferenceLine y={goal.target_amount} stroke="var(--gold-ink)" strokeDasharray="4 4" label={{ value: 'Meta', fontSize: 11, fill: 'var(--gold-ink)', position: 'insideTopRight' }} />
                <Tooltip formatter={(v: number) => money(v)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)' }} />
                <Area type="monotone" dataKey="total" name="Guardado" stroke="#B8964F" strokeWidth={2.5} fill="url(#goalfill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="empty">Registre o primeiro aporte para ver a evolução.</p>}
      </section>

      <section className="card">
        <div className="card-title"><h3>Histórico de aportes</h3><span className="muted small">{list.length}</span></div>
        {list.length ? (
          <ul className="kv">
            {list.map((c) => (
              <li key={c.id}>
                <span>{fmt.day(c.date)}{c.note ? <span className="muted small"> · {c.note}</span> : null}</span>
                <span>{money(c.amount)} <button className="link danger-text small" onClick={() =>
                  confirm('Excluir este aporte?') && run(() => api.deleteContribution(c.id), 'Aporte excluído')}>excluir</button></span>
              </li>
            ))}
          </ul>
        ) : <p className="empty">Nenhum aporte ainda.</p>}
      </section>

      {contrib && <ContributionSheet goal={goal} onClose={() => setContrib(false)} />}
      {editing && <GoalEditor goal={goal} onClose={() => setEditing(false)} onDeleted={() => nav('/metas')} />}
    </div>
  )
}

export function GoalEditor({ goal, onClose, onDeleted }: { goal: Partial<SavingsGoal>; onClose: () => void; onDeleted?: () => void }) {
  const { run } = useApp()
  const [name, setName] = useState(goal.name ?? '')
  const [icon, setIcon] = useState(goal.icon ?? '🎯')
  const [target, setTarget] = useState(moneyInput(goal.target_amount))
  const [monthly, setMonthly] = useState(moneyInput(goal.monthly_contribution))
  const [day, setDay] = useState(goal.contribution_day ? String(goal.contribution_day) : '')
  const [date, setDate] = useState(goal.target_date ?? '')
  const [archived, setArchived] = useState(goal.archived ?? false)
  const [showErrors, setShowErrors] = useState(false)

  const t = parseMoney(target)
  const m = monthly.trim() ? parseMoney(monthly) : null
  const d = day.trim() ? parseDay(day) : null
  const errors = [
    !name.trim() && 'Informe o objetivo.',
    !(t > 0) && 'Informe quanto quer juntar.',
    m != null && !(m > 0) && 'O aporte mensal precisa ser maior que zero.',
    day.trim() && d == null && 'O dia do aporte precisa ser de 1 a 31.',
    date && !goal.id && date <= today() && 'O prazo precisa ser uma data futura.',
  ].filter(Boolean) as string[]

  async function save() {
    setShowErrors(true)
    if (errors.length) return
    const ok = await run(() => api.saveGoal({
      ...(goal as SavingsGoal), name: name.trim(), icon, color: goal.color ?? '#B8964F', target_amount: t,
      monthly_contribution: m, contribution_day: d, target_date: date || null, archived,
    }).then(() => true), goal.id ? 'Meta atualizada' : 'Meta criada 🎯')
    if (ok) onClose()
  }

  async function remove() {
    if (!goal.id || !confirm(`Excluir a meta "${goal.name}" e todo o histórico de aportes? Para guardar o histórico, prefira arquivar.`)) return
    const ok = await run(() => api.deleteGoal(goal.id!).then(() => true), 'Meta excluída')
    if (ok) { onClose(); onDeleted?.() }
  }

  return (
    <Sheet title={goal.id ? 'Editar meta' : 'Nova meta'} onClose={onClose} footer={<>
      {goal.id && <button className="btn danger ghost" onClick={remove}>Excluir</button>}
      <button className="btn primary grow" onClick={save}>Salvar</button>
    </>}>
      <div className="cat-preview">
        <span className="tx-icon lg" style={{ background: 'color-mix(in srgb, var(--gold) 20%, transparent)' }}>{icon}</span>
        <input className="grow" value={name} maxLength={60} placeholder="Ex.: Viagem de férias" onChange={(e) => setName(e.target.value)} autoFocus={!goal.id} />
      </div>
      <Field label="Ícone">
        <div className="icon-grid">{GOAL_ICONS.map((i) => <button key={i} type="button" className={i === icon ? 'on' : ''} onClick={() => setIcon(i)}>{i}</button>)}</div>
      </Field>
      <div className="row2">
        <Field label="Quanto quer juntar"><MoneyInput value={target} onChange={setTarget} /></Field>
        <Field label="Aporte por mês"><MoneyInput value={monthly} onChange={setMonthly} /></Field>
      </div>
      <div className="row2">
        <Field label="Dia do aporte" hint="Recebe um lembrete neste dia"><input type="number" inputMode="numeric" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="Prazo (opcional)"><input type="date" value={date} min={addMonths(today(), 1)} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {goal.id && <Toggle checked={archived} onChange={setArchived} label="Arquivada (some da dashboard, mantém o histórico)" />}
      {showErrors && errors.map((e) => <p key={e} className="bad-text small">{e}</p>)}
    </Sheet>
  )
}
