import { useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { money } from '../lib/format'
import type { GoalContribution, SavingsGoal } from '../lib/types'
import { useApp } from '../store'
import { Icon } from './Icon'
import { MovementSheet, ReserveEditor, useReserveData } from './ReserveSheets'

export type Move = { reserve: SavingsGoal; kind: 'in' | 'out'; item?: GoalContribution }

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
