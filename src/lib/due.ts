import { diffDays, today } from './dates'
import type { Transaction } from './types'

export type DueTone = 'good' | 'warn' | 'bad'

/**
 * Situação de uma conta a pagar:
 * vermelho = vencida ou crítica (vence em até 2 dias), amarelo = vence em até 10 dias, verde = em dia.
 */
export function dueStatus(t: Pick<Transaction, 'date' | 'paid'>, ref = today()): { tone: DueTone; label: string; days: number } {
  const days = diffDays(ref, t.date)
  if (t.paid) return { tone: 'good', label: 'Paga', days }
  if (days < 0) return { tone: 'bad', label: days === -1 ? 'Venceu ontem' : `Vencida há ${-days} dias`, days }
  if (days === 0) return { tone: 'bad', label: 'Vence hoje', days }
  if (days === 1) return { tone: 'bad', label: 'Vence amanhã', days }
  if (days === 2) return { tone: 'bad', label: 'Vence em 2 dias', days }
  if (days <= 10) return { tone: 'warn', label: `Vence em ${days} dias`, days }
  return { tone: 'good', label: `Em dia · ${days} dias`, days }
}
