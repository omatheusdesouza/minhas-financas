/** Datas sempre como string local "YYYY-MM-DD" para evitar problemas de fuso. */

export function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): string {
  return iso(new Date())
}

export function addDays(s: string, n: number): string {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}

/** Soma meses mantendo o dia quando possível (31/01 + 1 mês = 28/02). */
export function addMonths(s: string, n: number): string {
  const d = parse(s)
  const day = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, last))
  return iso(target)
}

export function startOfMonth(s: string): string {
  return s.slice(0, 8) + '01'
}

export function endOfMonth(s: string): string {
  const d = parse(s)
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

/** Dia do mês ajustado ao último dia (ex.: dia 31 em fevereiro vira 28/29). */
export function dayInMonth(monthStart: string, day: number): string {
  const d = parse(monthStart)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return iso(new Date(d.getFullYear(), d.getMonth(), Math.min(day, last)))
}

export function diffDays(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)
}

const fmtDay = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtShort = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
const fmtMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const fmtWeekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

export const fmt = {
  day: (s: string) => fmtDay.format(parse(s)),
  short: (s: string) => fmtShort.format(parse(s)).replace('.', ''),
  month: (s: string) => capitalize(fmtMonth.format(parse(s))),
  weekday: (s: string) => capitalize(fmtWeekday.format(parse(s))),
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export type PeriodPreset = 'semana' | 'quinzena' | 'mes' | 'ano' | 'personalizado'

export interface Period {
  from: string
  to: string
}

/** Período que contém a data de referência. Semana começa na segunda-feira. */
export function presetPeriod(preset: Exclude<PeriodPreset, 'personalizado'>, ref: string): Period {
  const d = parse(ref)
  switch (preset) {
    case 'semana': {
      const dow = (d.getDay() + 6) % 7
      const from = addDays(ref, -dow)
      return { from, to: addDays(from, 6) }
    }
    case 'quinzena': {
      const ms = startOfMonth(ref)
      return d.getDate() <= 15
        ? { from: ms, to: addDays(ms, 14) }
        : { from: addDays(ms, 15), to: endOfMonth(ref) }
    }
    case 'mes':
      return { from: startOfMonth(ref), to: endOfMonth(ref) }
    case 'ano':
      return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` }
  }
}

/** Período imediatamente anterior, do mesmo tipo (para comparação). */
export function previousPeriod(preset: PeriodPreset, p: Period): Period {
  if (preset === 'personalizado' || preset === 'semana') {
    const len = diffDays(p.from, p.to) + 1
    return { from: addDays(p.from, -len), to: addDays(p.from, -1) }
  }
  return presetPeriod(preset, addDays(p.from, -1))
}

export function shiftPeriod(preset: PeriodPreset, p: Period, dir: 1 | -1): Period {
  if (dir === -1) return previousPeriod(preset, p)
  if (preset === 'personalizado' || preset === 'semana') {
    const len = diffDays(p.from, p.to) + 1
    return { from: addDays(p.to, 1), to: addDays(p.to, len) }
  }
  return presetPeriod(preset, addDays(p.to, 1))
}

export function periodLabel(preset: PeriodPreset, p: Period): string {
  if (preset === 'mes') return fmt.month(p.from)
  if (preset === 'ano') return p.from.slice(0, 4)
  return `${fmt.short(p.from)} – ${fmt.short(p.to)}`
}

export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = []
  let m = startOfMonth(fromMonth)
  const end = startOfMonth(toMonth)
  while (m <= end) {
    out.push(m)
    m = addMonths(m, 1)
  }
  return out
}
