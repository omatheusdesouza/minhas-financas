import { describe, expect, it } from 'vitest'
import { adjustment, balances, isReserve, reserveFlow } from '../reserves'
import type { GoalContribution, SavingsGoal } from '../types'

const goal = (id: string, target_amount: number | null): SavingsGoal => ({
  id, name: id, icon: '🛟', color: '#B8964F', target_amount, monthly_contribution: null, contribution_day: null, target_date: null, archived: false,
})
const mov = (goal_id: string, amount: number, date: string): GoalContribution => ({ id: `${goal_id}-${date}-${amount}`, goal_id, amount, date, note: null })

describe('reservas', () => {
  it('reserva é a meta sem valor-alvo', () => {
    expect(isReserve(goal('r', null))).toBe(true)
    expect(isReserve(goal('m', 1000))).toBe(false)
  })

  it('saldo soma entradas e desconta retiradas, sem erro de centavos', () => {
    const b = balances([mov('r', 1000, '2026-10-01'), mov('r', -250.1, '2026-10-05'), mov('r', 0.2, '2026-10-06'), mov('m', 50, '2026-10-01')])
    expect(b.get('r')).toBe(750.1)
    expect(b.get('m')).toBe(50)
  })

  it('fluxo do período considera só reservas e só as datas do período', () => {
    const reserves = [goal('r', null)]
    const list = [
      mov('r', 3000, '2026-09-30'), // saldo inicial, mês anterior
      mov('r', 800, '2026-10-05'),
      mov('r', -200, '2026-10-20'),
      mov('m', 400, '2026-10-10'), // aporte em meta: não entra
      { ...mov('r', 1500, '2026-10-02'), kind: 'initial' as const }, // saldo que já existia
      { ...mov('r', 35.5, '2026-10-31'), kind: 'adjust' as const }, // rendimento ajustado
    ]
    expect(reserveFlow(reserves, list, '2026-10-01', '2026-10-31')).toEqual({ sent: 800, withdrawn: 200, net: 600 })
  })

  it('ajuste de saldo gera a diferença', () => {
    expect(adjustment(750.1, 1000)).toBe(249.9)
    expect(adjustment(1000, 900)).toBe(-100)
    expect(adjustment(500, 500)).toBe(0)
  })
})
