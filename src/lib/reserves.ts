import type { GoalContribution, SavingsGoal } from './types'

/** Reserva = dinheiro guardado sem valor-alvo (migration 0006). Metas têm alvo. */
export const isReserve = (g: Pick<SavingsGoal, 'target_amount'>) => g.target_amount == null

export type Goal = SavingsGoal & { target_amount: number }
export const isGoal = (g: SavingsGoal): g is Goal => g.target_amount != null

const round = (v: number) => Math.round(v * 100) / 100

/** Saldo de cada reserva/meta: entradas positivas, retiradas negativas. */
export function balances(contributions: GoalContribution[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const c of contributions) out.set(c.goal_id, round((out.get(c.goal_id) ?? 0) + c.amount))
  return out
}

/** Quanto foi para as reservas no período (fica fora de ganhos e gastos, mas sai do valor livre). */
export function reserveFlow(reserves: SavingsGoal[], contributions: GoalContribution[], from: string, to: string) {
  const ids = new Set(reserves.map((r) => r.id))
  let sent = 0
  let withdrawn = 0
  for (const c of contributions) {
    if (!ids.has(c.goal_id) || c.date < from || c.date > to) continue
    // saldo que já existia e ajustes não vieram do dinheiro do mês
    if (c.kind === 'initial' || c.kind === 'adjust') continue
    if (c.amount > 0) sent += c.amount
    else withdrawn -= c.amount
  }
  return { sent: round(sent), withdrawn: round(withdrawn), net: round(sent - withdrawn) }
}

/** Movimento que leva o saldo atual ao valor informado (0 = nada a ajustar). */
export const adjustment = (current: number, target: number) => round(target - current)
