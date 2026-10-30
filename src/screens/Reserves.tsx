import { useState, type MouseEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Icon } from '../components/Icon'
import { AdjustSheet, MovementSheet, ReserveEditor, useReserveData } from '../components/ReserveSheets'
import { startOfMonth, today } from '../lib/dates'
import { money } from '../lib/format'
import { goalProgress, monthLabel } from '../lib/goals'
import { reserveFlow } from '../lib/reserves'
import type { GoalContribution, SavingsGoal } from '../lib/types'
import { useApp } from '../store'
import { MovementList } from './Goals'

type Move = { reserve: SavingsGoal; kind: 'in' | 'out'; item?: GoalContribution }

/** Aviso quando o banco ainda não tem a migration 0006. */
function NeedsMigration() {
  return (
    <p className="note">
      Para usar as reservas, o banco de dados precisa da atualização <b>0006</b>: no Supabase, abra o SQL Editor e rode
      o arquivo <code>supabase/migrations/0006_reservas.sql</code>. Depois, feche e abra o app.
    </p>
  )
}

/** Botões diretos de adicionar e retirar. */
export function MoveButtons({ reserve, balance, onMove, compact }: {
  reserve: SavingsGoal; balance: number; onMove: (m: Move) => void; compact?: boolean
}) {
  const stop = (e: MouseEvent, kind: 'in' | 'out') => { e.stopPropagation(); e.preventDefault(); onMove({ reserve, kind }) }
  return (
    <div className={`move-btns ${compact ? 'compact' : ''}`}>
      <button className="btn add-btn" onClick={(e) => stop(e, 'in')} aria-label={`Adicionar em ${reserve.name}`}>
        <Icon name="plus" size={18} />{!compact && ' Adicionar'}
      </button>
      <button className="btn out-btn" disabled={balance <= 0} onClick={(e) => stop(e, 'out')} aria-label={`Retirar de ${reserve.name}`}>
        <Icon name="minus" size={18} />{!compact && ' Retirar'}
      </button>
    </div>
  )
}

export function ReservesScreen() {
  const { data } = useReserveData()
  const { canEdit } = useApp()
  const nav = useNavigate()
  const [creating, setCreating] = useState(false)
  const [move, setMove] = useState<Move | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  if (!data) return <div className="screen"><div className="skeleton tall" /></div>

  const active = data.reserves.filter((r) => !r.archived)
  const list = data.reserves.filter((r) => showArchived || !r.archived)
  const total = active.reduce((s, r) => s + (data.balance.get(r.id) ?? 0), 0)
  const month = reserveFlow(active, data.contributions, startOfMonth(today()), today())

  return (
    <div className="screen">
      <header className="top"><Link to="/" className="icon-btn back-home" aria-label="Voltar"><Icon name="left" /></Link><h1>Reservas</h1><span /></header>
      {!data.available ? <NeedsMigration /> : (
        <>
          <section className="card hero">
            <p className="hero-label">Total reservado</p>
            <p className="hero-value">{money(total)}</p>
            <div className="hero-split">
              <div><span className="dot pos" /> Entrou este mês<strong>{money(month.sent)}</strong></div>
              <div><span className="dot neg" /> Saiu este mês<strong>{money(month.withdrawn)}</strong></div>
            </div>
            <p className="muted small">Fica separado dos ganhos e gastos do mês.</p>
          </section>
          {canEdit && <button className="btn primary block new-reserve" onClick={() => setCreating(true)}><Icon name="plus" /> Nova reserva</button>}
          {list.length === 0 && (
            <p className="empty">Crie uma reserva, como a reserva de emergência ou uma caixinha do banco, informe quanto já tem e
              acompanhe cada entrada e retirada.</p>
          )}
          <div className="goal-grid">
            {list.map((r) => {
              const bal = data.balance.get(r.id) ?? 0
              return (
                <div key={r.id} className={`card reserve-card ${r.archived ? 'dim' : ''}`} role="link" tabIndex={0}
                  onClick={() => nav(`/reservas/${r.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/reservas/${r.id}`)}>
                  <div className="goal-top">
                    <span className="goal-icon">{r.icon}</span>
                    <div className="grow">
                      <span className="stat-label">{r.name}{r.archived ? ' · arquivada' : ''}</span>
                      <strong>{money(bal)}</strong>
                    </div>
                    <Icon name="right" className="muted" />
                  </div>
                  {canEdit && !r.archived && <MoveButtons reserve={r} balance={bal} onMove={setMove} />}
                </div>
              )
            })}
          </div>
          {data.reserves.some((r) => r.archived) && (
            <button className="link center" onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Esconder arquivadas' : 'Mostrar arquivadas'}</button>
          )}
        </>
      )}
      {creating && <ReserveEditor onClose={() => setCreating(false)} />}
      {move && <MovementSheet goal={move.reserve} kind={move.kind} movement={move.item} balance={data.balance.get(move.reserve.id) ?? 0} onClose={() => setMove(null)} />}
    </div>
  )
}

export function ReserveDetailScreen() {
  const { id } = useParams()
  const { data } = useReserveData()
  const { canEdit } = useApp()
  const nav = useNavigate()
  const [move, setMove] = useState<Move | null>(null)
  const [editing, setEditing] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  if (!data) return <div className="screen"><div className="skeleton tall" /></div>
  const reserve = data.reserves.find((r) => r.id === id)
  if (!reserve) return <div className="screen"><p className="empty">Reserva não encontrada.</p><Link className="link center" to="/reservas">Voltar</Link></div>

  const bal = data.balance.get(reserve.id) ?? 0
  const list = data.contributions.filter((c) => c.goal_id === reserve.id)
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
  const month = reserveFlow([reserve], data.contributions, startOfMonth(today()), today())
  const chart = goalProgress(reserve, list, today()).history.map((h) => ({ label: monthLabel(h.month), total: h.total }))

  return (
    <div className="screen narrow">
      <header className="top"><Link to="/reservas" className="icon-btn" aria-label="Voltar"><Icon name="left" /></Link><h1>{reserve.icon} {reserve.name}</h1>
        {canEdit ? <button className="icon-btn" aria-label="Editar reserva" onClick={() => setEditing(true)}><Icon name="edit" /></button> : <span />}</header>

      <section className="card reserve-detail">
        <p className="stat-label">Saldo da reserva</p>
        <p className="goal-big">{money(bal)}</p>
        <p className="muted small">Este mês: entrou {money(month.sent)} · saiu {money(month.withdrawn)}</p>
        {canEdit && !reserve.archived && (
          <>
            <MoveButtons reserve={reserve} balance={bal} onMove={setMove} />
            <button className="link" onClick={() => setAdjusting(true)}>Ajustar saldo</button>
          </>
        )}
      </section>

      {chart.length > 1 && (
        <section className="card">
          <div className="card-title"><h3>Evolução</h3></div>
          <div className="chart">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="resfill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#D8B36A" stopOpacity={0.5} /><stop offset="1" stopColor="#D8B36A" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={52}
                  tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v))} />
                <Tooltip formatter={(v: number) => money(v)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)' }} />
                <Area type="monotone" dataKey="total" name="Saldo" stroke="#B8964F" strokeWidth={2.5} fill="url(#resfill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-title"><h3>Entradas e retiradas</h3><span className="muted small">{list.length}</span></div>
        {list.length
          ? <MovementList items={list} canEdit={canEdit} onEdit={(c) => setMove({ reserve, kind: c.amount < 0 ? 'out' : 'in', item: c })} />
          : <p className="empty">Nenhum movimento ainda. Toque em Adicionar.</p>}
        {canEdit && list.length > 0 && <p className="muted small">Toque num movimento para corrigir ou excluir.</p>}
      </section>

      {move && <MovementSheet goal={move.reserve} kind={move.kind} movement={move.item} balance={bal} onClose={() => setMove(null)} />}
      {adjusting && <AdjustSheet reserve={reserve} balance={bal} onClose={() => setAdjusting(false)} />}
      {editing && <ReserveEditor reserve={reserve} onClose={() => setEditing(false)} onDeleted={() => nav('/reservas')} />}
    </div>
  )
}

/** Cartão do Início: total reservado e botões diretos em cada reserva. */
export function ReservesCard({ className }: { className?: string }) {
  const { data } = useReserveData()
  const { canEdit } = useApp()
  const [move, setMove] = useState<Move | null>(null)
  const [creating, setCreating] = useState(false)
  if (!data?.available) return null
  const active = data.reserves.filter((r) => !r.archived)
  if (!active.length) {
    return canEdit ? (
      <>
        <button className={`card goal-empty ${className ?? ''}`} onClick={() => setCreating(true)}>
          <span className="goal-icon">🛟</span>
          <span className="grow"><b>Crie uma reserva</b><span className="muted small"> · informe quanto já tem guardado</span></span>
          <Icon name="right" />
        </button>
        {creating && <ReserveEditor onClose={() => setCreating(false)} />}
      </>
    ) : null
  }
  const total = active.reduce((s, r) => s + (data.balance.get(r.id) ?? 0), 0)
  return (
    <section className={`card reserves-card ${className ?? ''}`}>
      <div className="card-title">
        <div><span className="stat-label">Reservado</span><strong className="reserve-total">{money(total)}</strong></div>
        <Link to="/reservas" className="link">Ver reservas</Link>
      </div>
      {active.slice(0, 4).map((r) => {
        const bal = data.balance.get(r.id) ?? 0
        return (
          <div key={r.id} className="reserve-row">
            <Link to={`/reservas/${r.id}`} className="reserve-name">
              <span className="slice-icon" style={{ background: 'color-mix(in srgb, var(--gold) 18%, transparent)' }}>{r.icon}</span>
              <span className="grow"><b>{r.name}</b><span className="muted small">{money(bal)}</span></span>
            </Link>
            {canEdit && <MoveButtons reserve={r} balance={bal} onMove={setMove} compact />}
          </div>
        )
      })}
      {move && <MovementSheet goal={move.reserve} kind={move.kind} balance={data.balance.get(move.reserve.id) ?? 0} onClose={() => setMove(null)} />}
    </section>
  )
}
