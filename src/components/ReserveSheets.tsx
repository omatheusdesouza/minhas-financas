import { useState } from 'react'
import { api } from '../lib/api'
import { today } from '../lib/dates'
import { reservesAvailable } from '../lib/features'
import { money, moneyInput, parseMoney } from '../lib/format'
import { adjustment, balances, isReserve } from '../lib/reserves'
import type { GoalContribution, SavingsGoal } from '../lib/types'
import { useApp, useLoad } from '../store'
import { Field, MoneyInput, Toggle } from './Fields'
import { Sheet } from './Sheet'

export const RESERVE_ICONS = ['🛟', '🏦', '🐷', '💰', '💵', '🪙', '📦', '🔒', '🏠', '🚗', '🩺', '🎓', '✈️', '🎁', '📈', '⭐']

/** Reservas do espaço aberto, movimentos e saldos. available = banco com a migration 0006. */
export function useReserveData() {
  return useLoad(async () => {
    const available = await reservesAvailable()
    if (!available) return { available, reserves: [] as SavingsGoal[], contributions: [] as GoalContribution[], balance: new Map<string, number>() }
    const [goals, all] = await Promise.all([api.listGoals(), api.listContributions()])
    const reserves = goals.filter(isReserve)
    const ids = new Set(reserves.map((r) => r.id))
    const contributions = all.filter((c) => ids.has(c.goal_id))
    return { available, reserves, contributions, balance: balances(contributions) }
  }, [])
}

/**
 * Entrada (in) ou retirada (out) de uma reserva ou meta. Com `movement`, edita ou exclui um movimento existente.
 * balance = saldo atual (com o movimento, se for edição).
 */
export function MovementSheet({ goal, kind: initialKind, movement, balance, onClose }: {
  goal: SavingsGoal
  kind: 'in' | 'out'
  movement?: GoalContribution
  balance: number
  onClose: () => void
}) {
  const { run } = useApp()
  const [kind, setKind] = useState<'in' | 'out'>(movement ? (movement.amount < 0 ? 'out' : 'in') : initialKind)
  const [amount, setAmount] = useState(moneyInput(movement ? Math.abs(movement.amount) : !isReserve(goal) && initialKind === 'in' ? goal.monthly_contribution : null))
  const [date, setDate] = useState(movement?.date ?? today())
  const [note, setNote] = useState(movement?.note ?? '')
  const [showErrors, setShowErrors] = useState(false)
  const value = parseMoney(amount)
  // saldo sem este movimento: é dele que sai a retirada
  const base = balance - (movement?.amount ?? 0)
  const errors = [
    !(value > 0) && 'Informe o valor.',
    date > today() && 'A data não pode ser no futuro.',
    kind === 'out' && value > base + 0.001 && `A retirada passa do saldo disponível (${money(Math.max(0, base))}).`,
    note.length > 200 && 'A observação pode ter até 200 caracteres.',
  ].filter(Boolean) as string[]
  const reserve = isReserve(goal)

  async function save() {
    setShowErrors(true)
    if (errors.length) return
    const signed = kind === 'out' ? -value : value
    const ok = await run(() => api.saveContribution({
      ...(movement ?? {}), goal_id: goal.id, amount: signed, date, note: note.trim() || null,
    } as GoalContribution).then(() => true), movement ? 'Movimento atualizado' : kind === 'in' ? (reserve ? 'Valor adicionado 💰' : 'Aporte registrado 💰') : 'Retirada registrada')
    if (ok) onClose()
  }

  async function remove() {
    if (!movement || !confirm('Excluir este movimento? O saldo será recalculado.')) return
    const ok = await run(() => api.deleteContribution(movement.id).then(() => true), 'Movimento excluído')
    if (ok) onClose()
  }

  const title = movement ? 'Editar movimento' : kind === 'in' ? (reserve ? 'Adicionar à reserva' : 'Registrar aporte') : 'Retirar'
  return (
    <Sheet title={`${goal.icon} ${title}`} onClose={onClose} footer={<>
      {movement && <button className="btn danger ghost" onClick={remove}>Excluir</button>}
      <button className={`btn grow ${kind === 'out' ? 'danger-fill' : 'primary'}`} onClick={save}>
        {movement ? 'Salvar' : kind === 'in' ? 'Adicionar' : 'Retirar'}
      </button>
    </>}>
      <p className="muted">{goal.name} · saldo atual <b>{money(balance)}</b></p>
      {movement && (
        <div className="segmented" role="group">
          <button type="button" className={kind === 'in' ? 'on pos' : ''} onClick={() => setKind('in')}>Entrada</button>
          <button type="button" className={kind === 'out' ? 'on neg' : ''} onClick={() => setKind('out')}>Retirada</button>
        </div>
      )}
      <Field label={kind === 'in' ? 'Valor que entra' : 'Valor que sai'}><MoneyInput value={amount} onChange={setAmount} autoFocus big /></Field>
      <Field label="Data"><input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
      <Field label="Observação (opcional)">
        <input value={note} maxLength={200} placeholder={kind === 'in' ? 'Ex.: Parte do salário' : 'Ex.: Conserto do carro'} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {showErrors && errors.map((e) => <p key={e} className="bad-text small">{e}</p>)}
    </Sheet>
  )
}

/** Informa o saldo real; o app registra a diferença como entrada ou retirada. */
export function AdjustSheet({ reserve, balance, onClose }: { reserve: SavingsGoal; balance: number; onClose: () => void }) {
  const { run } = useApp()
  const [amount, setAmount] = useState(moneyInput(balance))
  const target = parseMoney(amount)
  const diff = adjustment(balance, target)
  const valid = amount.trim() !== '' && target >= 0 && diff !== 0

  async function save() {
    if (!valid) return
    const ok = await run(() => api.saveContribution({ goal_id: reserve.id, amount: diff, date: today(), note: 'Ajuste de saldo', kind: 'adjust' } as GoalContribution)
      .then(() => true), 'Saldo ajustado')
    if (ok) onClose()
  }

  return (
    <Sheet title={`${reserve.icon} Ajustar saldo`} onClose={onClose}
      footer={<button className="btn primary grow" disabled={!valid} onClick={save}>Ajustar</button>}>
      <p className="muted small">Use quando o valor guardado de verdade estiver diferente do app (rendimentos, correções). O ajuste muda o saldo, mas não conta como dinheiro enviado no mês.</p>
      <Field label="Quanto tem hoje nesta reserva"><MoneyInput value={amount} onChange={setAmount} autoFocus big /></Field>
      {diff !== 0 && amount.trim() !== '' && (
        <p className="note small">Será registrada uma {diff > 0 ? 'entrada' : 'retirada'} de <b>{money(Math.abs(diff))}</b> como "Ajuste de saldo".</p>
      )}
    </Sheet>
  )
}

/** Criar (com o quanto já tem) ou editar uma reserva. */
export function ReserveEditor({ reserve, onClose, onDeleted }: { reserve?: SavingsGoal; onClose: () => void; onDeleted?: () => void }) {
  const { run } = useApp()
  const [name, setName] = useState(reserve?.name ?? '')
  const [icon, setIcon] = useState(reserve?.icon ?? '🛟')
  const [initial, setInitial] = useState('')
  const [archived, setArchived] = useState(reserve?.archived ?? false)
  const [showErrors, setShowErrors] = useState(false)
  const start = initial.trim() ? parseMoney(initial) : 0
  const errors = [
    !name.trim() && 'Dê um nome para a reserva.',
    initial.trim() && !(start >= 0) && 'O valor inicial não pode ser negativo.',
  ].filter(Boolean) as string[]

  async function save() {
    setShowErrors(true)
    if (errors.length) return
    const ok = await run(async () => {
      const saved = await api.saveGoal({
        ...(reserve ?? {}), name: name.trim(), icon, color: reserve?.color ?? '#B8964F', target_amount: null,
        monthly_contribution: null, contribution_day: null, target_date: null, archived,
      } as SavingsGoal)
      if (!reserve && start > 0) {
        await api.saveContribution({ goal_id: saved.id, amount: start, date: today(), note: 'Saldo inicial', kind: 'initial' } as GoalContribution)
      }
      return true
    }, reserve ? 'Reserva atualizada' : 'Reserva criada 🛟')
    if (ok) onClose()
  }

  async function remove() {
    if (!reserve || !confirm(`Excluir a reserva "${reserve.name}" e todo o histórico? Para guardar o histórico, prefira arquivar.`)) return
    const ok = await run(() => api.deleteGoal(reserve.id).then(() => true), 'Reserva excluída')
    if (ok) { onClose(); onDeleted?.() }
  }

  return (
    <Sheet title={reserve ? 'Editar reserva' : 'Nova reserva'} onClose={onClose} footer={<>
      {reserve && <button className="btn danger ghost" onClick={remove}>Excluir</button>}
      <button className="btn primary grow" onClick={save}>Salvar</button>
    </>}>
      <div className="cat-preview">
        <span className="tx-icon lg" style={{ background: 'color-mix(in srgb, var(--gold) 20%, transparent)' }}>{icon}</span>
        <input className="grow" value={name} maxLength={60} placeholder="Ex.: Reserva de emergência" onChange={(e) => setName(e.target.value)} autoFocus={!reserve} />
      </div>
      <Field label="Ícone">
        <div className="icon-grid">{RESERVE_ICONS.map((i) => <button key={i} type="button" className={i === icon ? 'on' : ''} onClick={() => setIcon(i)}>{i}</button>)}</div>
      </Field>
      {!reserve && (
        <Field label="Quanto você já tem guardado" hint="Vira o saldo inicial. Pode deixar em branco e adicionar depois.">
          <MoneyInput value={initial} onChange={setInitial} />
        </Field>
      )}
      {reserve && <Toggle checked={archived} onChange={setArchived} label="Arquivada (some do Início, mantém o histórico)" />}
      {showErrors && errors.map((e) => <p key={e} className="bad-text small">{e}</p>)}
    </Sheet>
  )
}

export interface SplitValue { on: boolean; reserveId: string; amount: string }
export const emptySplit: SplitValue = { on: false, reserveId: '', amount: '' }

/** "Enviar para uma reserva" ao lançar ou receber um ganho (ex.: salário). */
export function ReserveSplit({ value, onChange, total }: { value: SplitValue; onChange: (v: SplitValue) => void; total: number }) {
  const { data } = useReserveData()
  const reserves = (data?.reserves ?? []).filter((r) => !r.archived)
  if (!data?.available || !reserves.length) return null
  const part = parseMoney(value.amount)
  const set = (patch: Partial<SplitValue>) => onChange({ ...value, ...patch })
  return (
    <div className="card inset reserve-split">
      <Toggle checked={value.on} label="Enviar parte para uma reserva" onChange={(on) => set({
        on, reserveId: value.reserveId || reserves[0].id, amount: value.amount || moneyInput(total > 0 ? total : null),
      })} />
      {value.on && (
        <>
          <div className="row2">
            <Field label="Reserva">
              <select value={value.reserveId} onChange={(e) => set({ reserveId: e.target.value })}>
                {reserves.map((r) => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
              </select>
            </Field>
            <Field label="Quanto enviar"><MoneyInput value={value.amount} onChange={(amount) => set({ amount })} /></Field>
          </div>
          <p className="muted small">
            Não conta como gasto: aparece no mês como "Enviado para reservas"
            {total > 0 && part > 0 && part <= total ? ` e sobram ${money(total - part)} livres` : ''}.
          </p>
        </>
      )}
    </div>
  )
}

/** Valida o envio para a reserva; devolve o texto do erro ou null. */
export function splitError(v: SplitValue, total: number): string | null {
  if (!v.on) return null
  const part = parseMoney(v.amount)
  if (!v.reserveId) return 'Escolha a reserva.'
  if (!(part > 0)) return 'Informe quanto enviar para a reserva.'
  if (total > 0 && part > total + 0.001) return 'O valor enviado para a reserva passa do valor recebido.'
  return null
}

/** Registra a entrada na reserva (depois de salvar o ganho). */
export async function sendToReserve(v: SplitValue, date: string, description: string) {
  if (!v.on) return
  await api.saveContribution({
    goal_id: v.reserveId, amount: parseMoney(v.amount), date: date > today() ? today() : date,
    note: description ? `Do ganho: ${description}`.slice(0, 200) : 'De um ganho',
  } as GoalContribution)
}
