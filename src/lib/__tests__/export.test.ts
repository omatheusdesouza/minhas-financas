import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildPdf } from '../exportPdf'
import { buildXlsx } from '../exportXlsx'
import type { ReportData } from '../report'

const data: ReportData = {
  periodLabel: 'Outubro de 2026', from: '2026-10-01', to: '2026-10-31', prevLabel: 'Setembro de 2026',
  userName: 'Matheus', generatedAt: new Date(2026, 9, 31, 10, 0),
  kpis: { income: 5200, expense: 2595.15, balance: 2604.85, avgDay: 83.71, pending: 1450, prevIncome: 5000, prevExpense: 2100 },
  expenseByCategory: [
    { id: 'casa', name: 'Casa – contas fixas', icon: '🏠', color: '#1F5F7A', total: 1582.15 },
    { id: 'ff', name: 'Fast food e delivery', icon: '🍔', color: '#A4553F', total: 62.9 },
  ],
  incomeByCategory: [{ id: 'sal', name: 'Salário', icon: '💼', color: '#2F6B57', total: 5200 }],
  natures: [{ name: 'Essenciais', total: 2300 }, { name: 'Supérfluos', total: 295.15 }],
  changes: [{ key: 'bill:luz', label: 'Energia', icon: '💡', color: '#1F5F7A', current: 132.15, previous: 112, delta: 20.15, pct: 0.18 }],
  highlights: ['Energia subiu 18% (R$ 112,00 → R$ 132,15) 💡'],
  transactions: [
    { date: '2026-10-05', kind: 'Ganho', description: 'Salário', category: 'Salário', subcategory: '', payment: 'Pix', amount: 5200, status: 'Pago', notes: '', receipt: false },
    { date: '2026-10-15', kind: 'Gasto', description: 'Energia', category: 'Casa – contas fixas', subcategory: 'Energia', payment: '', amount: -132.15, status: 'Pago', notes: '', receipt: true },
    { date: '2026-10-20', kind: 'Gasto', description: 'Água', category: 'Casa – contas fixas', subcategory: 'Água', payment: '', amount: null, status: 'Pendente', notes: '', receipt: false },
  ],
}

describe('exportação', () => {
  it('gera um PDF válido', async () => {
    const blob = buildPdf(data)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(5000)
  })

  it('gera uma planilha Excel com as abas, datas e valores em reais', async () => {
    const blob = await buildXlsx(data)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await blob.arrayBuffer())
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumo', 'Lançamentos', 'Comparação', 'Ganhos'])
    const tx = wb.getWorksheet('Lançamentos')!
    expect(tx.getRow(1).getCell(1).value).toBe('Data')
    const d = tx.getRow(2).getCell(1).value as Date
    expect(d.toISOString().slice(0, 10)).toBe('2026-10-05')
    expect(tx.getRow(3).getCell(7).value).toBe(-132.15)
    expect(tx.getRow(3).getCell(7).numFmt).toContain('R$')
    expect(tx.getRow(3).getCell(9).value).toBe('Sim')
    expect(tx.getRow(4).getCell(7).value).toBe('a informar')
    expect((tx.getRow(5).getCell(7).value as any).formula).toBe('SUBTOTAL(9,G2:G4)')
    expect(tx.autoFilter).toBeTruthy()
    const cmp = wb.getWorksheet('Comparação')!
    expect(cmp.getRow(2).getCell(1).value).toBe('Energia')
    expect(cmp.getRow(2).getCell(5).value).toBe(0.18)
  })
})
