import ExcelJS from 'exceljs'
import { fmt } from './dates'
import type { ReportData } from './report'

const NAVY = 'FF0B2A3C'
const GOLD = 'FFD8B36A'
const OFF = 'FFF2EBDD'
const CREAM = 'FFFBF8F2'
const BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
const PCT = '0%'

/** Data "YYYY-MM-DD" como data do Excel (meia-noite UTC, para não mudar de dia). */
const xlDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const strip = (s: string) => s.replace(/ /g, ' ')

function header(ws: ExcelJS.Worksheet, row: number) {
  const r = ws.getRow(row)
  r.eachCell((c) => {
    c.font = { bold: true, color: { argb: OFF } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { vertical: 'middle' }
    c.border = { bottom: { style: 'thin', color: { argb: GOLD } } }
  })
  r.height = 20
}

function title(ws: ExcelJS.Worksheet, text: string, sub: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols)
  ws.getCell(1, 1).value = text
  ws.getCell(1, 1).font = { name: 'Georgia', size: 16, bold: true, color: { argb: NAVY } }
  ws.mergeCells(2, 1, 2, cols)
  ws.getCell(2, 1).value = sub
  ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF8C6A2C' } }
  ws.getRow(1).height = 26
}

/** Gera a planilha Excel (.xlsx) do relatório. */
export async function buildXlsx(d: ReportData): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Fynvault'
  wb.created = d.generatedAt
  const period = `${d.periodLabel} · ${fmt.day(d.from)} a ${fmt.day(d.to)} · ${d.userName}`

  // Resumo
  const rs = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] })
  rs.columns = [{ width: 34 }, { width: 18 }, { width: 18 }, { width: 14 }]
  title(rs, 'Fynvault · Relatório financeiro', period, 4)
  rs.addRow([])
  rs.addRow(['Indicador', 'Período', d.prevLabel, 'Variação'])
  header(rs, 4)
  const k = d.kpis
  const kpi = (label: string, cur: number, prev: number | null) => {
    const r = rs.addRow([label, cur, prev, prev ? { formula: `IF(C${rs.rowCount + 1}=0,"",B${rs.rowCount + 1}/C${rs.rowCount + 1}-1)` } : null])
    r.getCell(2).numFmt = BRL
    r.getCell(3).numFmt = BRL
    r.getCell(4).numFmt = '+0%;-0%;0%'
  }
  kpi('Ganhos', k.income, k.prevIncome)
  kpi('Gastos', k.expense, k.prevExpense)
  kpi('Saldo', k.balance, k.prevIncome - k.prevExpense)
  kpi('Gasto médio por dia', k.avgDay, null)
  kpi('Pendente de pagamento', k.pending, null)

  if (d.highlights.length) {
    rs.addRow([])
    const h = rs.addRow([`Destaques comparados com ${d.prevLabel}`])
    h.font = { bold: true, color: { argb: NAVY } }
    for (const t of d.highlights) rs.addRow([strip(t)]).getCell(1).alignment = { wrapText: false }
  }

  rs.addRow([])
  const start = rs.rowCount + 1
  rs.addRow(['Gastos por categoria', 'Valor', '% dos gastos'])
  header(rs, start)
  for (const c of d.expenseByCategory) {
    const r = rs.addRow([c.name, c.total, k.expense ? c.total / k.expense : 0])
    r.getCell(2).numFmt = BRL
    r.getCell(3).numFmt = PCT
  }
  if (d.natures.length) {
    rs.addRow([])
    const ns = rs.rowCount + 1
    rs.addRow(['Essencial × supérfluo', 'Valor', '%'])
    header(rs, ns)
    for (const n of d.natures) {
      const r = rs.addRow([n.name, n.total, k.expense ? n.total / k.expense : 0])
      r.getCell(2).numFmt = BRL
      r.getCell(3).numFmt = PCT
    }
  }

  // Lançamentos
  const ws = wb.addWorksheet('Lançamentos', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Data', key: 'date', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Tipo', key: 'kind', width: 8 },
    { header: 'Descrição', key: 'description', width: 34 },
    { header: 'Categoria', key: 'category', width: 24 },
    { header: 'Subcategoria', key: 'subcategory', width: 24 },
    { header: 'Forma de pagamento', key: 'payment', width: 20 },
    { header: 'Valor', key: 'amount', width: 15, style: { numFmt: BRL } },
    { header: 'Situação', key: 'status', width: 11 },
    { header: 'Comprovante', key: 'receipt', width: 13 },
    { header: 'Observações', key: 'notes', width: 30 },
  ]
  header(ws, 1)
  d.transactions.forEach((t, i) => {
    const r = ws.addRow({ ...t, date: xlDate(t.date), amount: t.amount, receipt: t.receipt ? 'Sim' : '' })
    if (t.amount == null) r.getCell('amount').value = 'a informar'
    if (i % 2) r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM } } })
  })
  const last = ws.rowCount
  ws.autoFilter = { from: 'A1', to: `J${last}` }
  const total = ws.addRow({ description: 'Saldo (soma dos itens visíveis no filtro)', amount: { formula: `SUBTOTAL(9,G2:G${last})` } })
  total.font = { bold: true }
  total.getCell('amount').numFmt = BRL

  // Comparação
  if (d.changes.length) {
    const cs = wb.addWorksheet('Comparação', { views: [{ state: 'frozen', ySplit: 1 }] })
    cs.columns = [
      { header: 'Conta ou categoria', key: 'label', width: 34 },
      { header: d.prevLabel, key: 'previous', width: 16, style: { numFmt: BRL } },
      { header: 'Período atual', key: 'current', width: 16, style: { numFmt: BRL } },
      { header: 'Diferença', key: 'delta', width: 16, style: { numFmt: '+"R$" #,##0.00;[Red]-"R$" #,##0.00' } },
      { header: 'Variação', key: 'pct', width: 11, style: { numFmt: '+0%;-0%;0%' } },
    ]
    header(cs, 1)
    for (const c of d.changes) cs.addRow({ ...c, pct: c.pct })
  }

  // Ganhos por categoria
  if (d.incomeByCategory.length) {
    const is = wb.addWorksheet('Ganhos')
    is.columns = [{ header: 'Categoria', key: 'name', width: 30 }, { header: 'Valor', key: 'total', width: 16, style: { numFmt: BRL } }]
    header(is, 1)
    for (const c of d.incomeByCategory) is.addRow(c)
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
