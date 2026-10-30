import { addDays, addMonths, dayInMonth, diffDays, iso, parse, startOfMonth } from './dates'
import { money } from './format'

/**
 * Regras dos lembretes (só calcula; quem agenda no celular é o notify.ts):
 *
 *  - Conta variável sem valor: lembrete diário de D-10 até D-3 para informar o valor.
 *    Para assim que o valor é preenchido (a agenda é recalculada a cada mudança).
 *  - D-2: alerta crítico (canal de prioridade alta, vermelho).
 *  - D (vencimento): "vence hoje".
 *  - A partir de D+1: "conta vencida", todo dia, até ser marcada como paga.
 *  - Meta com aporte mensal: lembrete no dia do aporte.
 *
 * Todos no horário escolhido pela pessoa. Horários que já passaram são ignorados.
 */

export type ReminderKind = 'informar' | 'critico' | 'hoje' | 'vencida' | 'aporte'
export type Channel = 'normal' | 'critical'

export interface Reminder {
  id: number
  at: Date
  title: string
  body: string
  channel: Channel
  kind: ReminderKind
  /** id da conta ou meta que gerou o lembrete */
  ref: string
}

export interface BillInput {
  id: string
  kind: 'expense' | 'income'
  date: string
  paid: boolean
  amount: number | null
  description: string
}

export interface GoalInput {
  id: string
  name: string
  archived: boolean
  monthly_contribution: number | null
  contribution_day: number | null
}

export interface ScheduleInput {
  bills: BillInput[]
  goals: GoalInput[]
  /** "HH:MM" ou "HH:MM:SS" */
  time: string
  now: Date
  /** quantos dias à frente agendar (o app renova ao abrir) */
  horizonDays?: number
  /** limite total (o iPhone aceita no máximo 64 agendados) */
  max?: number
}

export const DEFAULT_HORIZON = 30
export const DEFAULT_MAX = 60
export const VARIABLE_REMINDER_DAYS = 10
export const CRITICAL_DAYS = 2
/** dia padrão do lembrete de aporte quando a meta não tem um */
export const DEFAULT_CONTRIBUTION_DAY = 5

/** Id numérico estável (o Android exige inteiro de 32 bits). */
export function reminderId(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 2147483647 || 1
}

export function atTime(day: string, time: string): Date {
  const [hh, mm] = time.split(':').map(Number)
  const d = parse(day)
  d.setHours(hh || 0, mm || 0, 0, 0)
  return d
}

export function buildSchedule(input: ScheduleInput): Reminder[] {
  const horizon = input.horizonDays ?? DEFAULT_HORIZON
  const max = input.max ?? DEFAULT_MAX
  const today = iso(input.now)
  const last = addDays(today, horizon)
  const out: Reminder[] = []

  const push = (kind: ReminderKind, ref: string, day: string, title: string, body: string, channel: Channel) => {
    if (day > last) return
    const at = atTime(day, input.time)
    if (at.getTime() <= input.now.getTime()) return
    out.push({ id: reminderId(`${kind}|${ref}|${day}`), at, title, body, channel, kind, ref })
  }

  for (const b of input.bills) {
    if (b.paid || b.kind !== 'expense') continue
    const name = b.description.trim() || 'Conta'
    const due = b.date
    const value = b.amount != null ? money(b.amount) : null

    if (b.amount == null) {
      for (let d = VARIABLE_REMINDER_DAYS; d > CRITICAL_DAYS; d--) {
        push('informar', b.id, addDays(due, -d), `Informe o valor: ${name}`,
          `${name} vence em ${d} dias. Toque para informar o valor da conta deste mês.`, 'normal')
      }
    }
    push('critico', b.id, addDays(due, -CRITICAL_DAYS), `⚠️ ${name} vence em 2 dias`,
      value ? `${value} vence em ${dueLabel(due)}. Não esqueça de pagar.` : `Vence em ${dueLabel(due)} e o valor ainda não foi informado.`,
      'critical')
    push('hoje', b.id, due, `${name} vence hoje`,
      value ? `Hoje é o vencimento de ${value}. Depois de pagar, marque como paga no Fynvault.` : 'Hoje é o vencimento. Informe o valor e marque como paga.',
      'critical')
    // Vencida: todo dia a partir do dia seguinte, até marcar como paga
    const start = due >= today ? addDays(due, 1) : today
    for (let day = start; day <= last; day = addDays(day, 1)) {
      const late = diffDays(due, day)
      push('vencida', b.id, day, `🔴 ${name} está vencida`,
        `${late === 1 ? 'Venceu ontem' : `Vencida há ${late} dias`}${value ? ` · ${value}` : ''}. Toque para marcar como paga.`, 'critical')
    }
  }

  for (const g of input.goals) {
    if (g.archived || !g.monthly_contribution) continue
    const day = g.contribution_day ?? DEFAULT_CONTRIBUTION_DAY
    for (let m = 0; m <= 2; m++) {
      const date = dayInMonth(addMonths(startOfMonth(today), m), day)
      push('aporte', g.id, date, `💰 Hora do aporte: ${g.name}`,
        `Guarde ${money(g.monthly_contribution)} na sua meta "${g.name}" e registre no Fynvault.`, 'normal')
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, max)
}

function dueLabel(day: string) {
  const [, m, d] = day.split('-')
  return `${d}/${m}`
}
