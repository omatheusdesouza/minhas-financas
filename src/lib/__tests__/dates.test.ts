import { describe, expect, it } from 'vitest'
import { addMonths, dayInMonth, monthsBetween, presetPeriod } from '../dates'

describe('meses curtos (dias 29, 30 e 31)', () => {
  it('dia 31 cai no último dia dos meses menores', () => {
    expect(dayInMonth('2026-02-01', 31)).toBe('2026-02-28')
    expect(dayInMonth('2026-04-01', 31)).toBe('2026-04-30')
    expect(dayInMonth('2026-05-01', 31)).toBe('2026-05-31')
  })
  it('dias 29 e 30 em fevereiro, com e sem ano bissexto', () => {
    expect(dayInMonth('2026-02-01', 29)).toBe('2026-02-28')
    expect(dayInMonth('2026-02-01', 30)).toBe('2026-02-28')
    expect(dayInMonth('2028-02-01', 29)).toBe('2028-02-29')
    expect(dayInMonth('2028-02-01', 30)).toBe('2028-02-29')
  })
  it('somar meses mantém o dia quando possível', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
  })
  it('lista os meses de um intervalo, virando o ano', () => {
    expect(monthsBetween('2026-11-01', '2027-02-01')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'])
  })
  it('períodos dos relatórios', () => {
    expect(presetPeriod('semana', '2026-10-30')).toEqual({ from: '2026-10-26', to: '2026-11-01' })
    expect(presetPeriod('quinzena', '2026-10-30')).toEqual({ from: '2026-10-16', to: '2026-10-31' })
    expect(presetPeriod('quinzena', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-15' })
    expect(presetPeriod('mes', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})
