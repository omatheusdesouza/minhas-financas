import { describe, expect, it } from 'vitest'
import { buildSchedule, reminderId, type BillInput, type GoalInput } from '../reminders'

const NOW = new Date(2026, 9, 1, 8, 0) // 01/10/2026 08:00
const bill = (over: Partial<BillInput> = {}): BillInput => ({
  id: 'c1', kind: 'expense', date: '2026-10-20', paid: false, amount: 120, description: 'Internet', ...over,
})
const run = (bills: BillInput[], extra: Partial<Parameters<typeof buildSchedule>[0]> = {}) =>
  buildSchedule({ bills, goals: [], time: '09:00', now: NOW, horizonDays: 60, max: 500, ...extra })
const days = (rs: ReturnType<typeof run>, kind: string) =>
  rs.filter((r) => r.kind === kind).map((r) => `${r.at.getDate()}/${r.at.getMonth() + 1}`)

describe('alertas de vencimento', () => {
  it('conta variável sem valor: lembrete diário de 10 a 3 dias antes', () => {
    const rs = run([bill({ amount: null, description: 'Energia' })])
    expect(days(rs, 'informar')).toEqual(['10/10', '11/10', '12/10', '13/10', '14/10', '15/10', '16/10', '17/10'])
    expect(rs.filter((r) => r.kind === 'informar').every((r) => r.channel === 'normal')).toBe(true)
  })

  it('o lembrete de informar valor para assim que o valor é preenchido', () => {
    const rs = run([bill({ amount: 132.15, description: 'Energia' })])
    expect(days(rs, 'informar')).toEqual([])
  })

  it('2 dias antes: alerta crítico', () => {
    const rs = run([bill()])
    const c = rs.filter((r) => r.kind === 'critico')
    expect(days(rs, 'critico')).toEqual(['18/10'])
    expect(c[0].channel).toBe('critical')
    expect(c[0].body).toContain('R$')
  })

  it('no dia do vencimento: "vence hoje"', () => {
    const rs = run([bill()])
    expect(days(rs, 'hoje')).toEqual(['20/10'])
    expect(rs.find((r) => r.kind === 'hoje')!.title).toContain('vence hoje')
  })

  it('1 dia depois: conta vencida, repetida todo dia até pagar', () => {
    const rs = run([bill()], { horizonDays: 25 })
    expect(days(rs, 'vencida')).toEqual(['21/10', '22/10', '23/10', '24/10', '25/10', '26/10'])
    expect(rs.find((r) => r.kind === 'vencida')!.body).toContain('Venceu ontem')
  })

  it('conta paga não gera nenhum alerta (cancelamento ao pagar)', () => {
    expect(run([bill({ paid: true })])).toEqual([])
  })

  it('ganhos não geram alertas de vencimento', () => {
    expect(run([bill({ kind: 'income' })])).toEqual([])
  })

  it('conta já vencida: alerta começa hoje, se o horário ainda não passou', () => {
    const late = bill({ date: '2026-09-25' })
    expect(days(run([late], { horizonDays: 2 }), 'vencida')).toEqual(['1/10', '2/10', '3/10'])
    const after = run([late], { horizonDays: 2, now: new Date(2026, 9, 1, 10, 0) })
    expect(days(after, 'vencida')).toEqual(['2/10', '3/10'])
    expect(run([late], { horizonDays: 0 })[0].body).toContain('Vencida há 6 dias')
  })

  it('não agenda nada no passado', () => {
    const rs = run([bill({ date: '2026-10-01' })], { horizonDays: 0 })
    expect(rs.some((r) => r.kind === 'hoje')).toBe(true) // 09:00 ainda não passou
    const later = run([bill({ date: '2026-10-01' })], { horizonDays: 0, now: new Date(2026, 9, 1, 9, 30) })
    expect(later).toEqual([])
  })

  it('usa o horário escolhido', () => {
    const rs = run([bill()], { time: '20:30' })
    expect(rs.every((r) => r.at.getHours() === 20 && r.at.getMinutes() === 30)).toBe(true)
  })

  it('respeita o limite do iPhone e mantém os mais próximos primeiro', () => {
    const bills = Array.from({ length: 20 }, (_, i) => bill({ id: `c${i}`, amount: null, date: '2026-10-25' }))
    const rs = run(bills, { max: 60 })
    expect(rs).toHaveLength(60)
    for (let i = 1; i < rs.length; i++) expect(rs[i].at.getTime()).toBeGreaterThanOrEqual(rs[i - 1].at.getTime())
  })

  it('ids estáveis e únicos', () => {
    const a = run([bill(), bill({ id: 'c2', amount: null })])
    const b = run([bill(), bill({ id: 'c2', amount: null })])
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id))
    expect(new Set(a.map((r) => r.id)).size).toBe(a.length)
    expect(reminderId('x')).toBeGreaterThan(0)
    expect(reminderId('x')).toBeLessThan(2 ** 31)
  })
})

describe('lembrete de aporte na meta', () => {
  const goal = (over: Partial<GoalInput> = {}): GoalInput => ({
    id: 'g1', name: 'Reserva', archived: false, monthly_contribution: 500, contribution_day: 10, ...over,
  })
  it('todo mês no dia do aporte', () => {
    const rs = buildSchedule({ bills: [], goals: [goal()], time: '09:00', now: NOW, horizonDays: 70 })
    expect(days(rs, 'aporte')).toEqual(['10/10', '10/11', '10/12'])
    expect(rs[0].body).toMatch(/R\$\s500,00/)
  })
  it('dia 31 vira o último dia em meses curtos', () => {
    const rs = buildSchedule({ bills: [], goals: [goal({ contribution_day: 31 })], time: '09:00', now: NOW, horizonDays: 70 })
    expect(days(rs, 'aporte')).toEqual(['31/10', '30/11'])
  })
  it('sem aporte mensal ou meta arquivada: nenhum lembrete', () => {
    expect(buildSchedule({ bills: [], goals: [goal({ monthly_contribution: null }), goal({ id: 'g2', archived: true })], time: '09:00', now: NOW })).toEqual([])
  })
})
