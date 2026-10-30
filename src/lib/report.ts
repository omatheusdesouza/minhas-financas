import type { Change } from './compare'
import type { Slice } from './services'

/** Dados de um relatório, já calculados, prontos para virar PDF ou Excel. */
export interface ReportData {
  periodLabel: string
  from: string
  to: string
  prevLabel: string
  userName: string
  generatedAt: Date
  kpis: {
    income: number
    expense: number
    balance: number
    avgDay: number
    pending: number
    prevIncome: number
    prevExpense: number
  }
  expenseByCategory: Slice[]
  incomeByCategory: Slice[]
  natures: { name: string; total: number }[]
  changes: Change[]
  highlights: string[]
  transactions: ReportRow[]
}

export interface ReportRow {
  date: string
  kind: 'Gasto' | 'Ganho'
  description: string
  category: string
  subcategory: string
  payment: string
  /** com sinal: gastos negativos; null = valor ainda não informado */
  amount: number | null
  status: 'Pago' | 'Pendente'
  notes: string
  receipt: boolean
}

export const reportFileName = (d: ReportData, ext: string) => `fynvault_relatorio_${d.from}_a_${d.to}.${ext}`

/** Variação percentual em texto ("+12%", "-5%"); vazio quando não dá para comparar. */
export function pctChange(cur: number, prev: number): string {
  if (!prev) return ''
  const p = Math.round(((cur - prev) / prev) * 100)
  return `${p > 0 ? '+' : ''}${p}%`
}
