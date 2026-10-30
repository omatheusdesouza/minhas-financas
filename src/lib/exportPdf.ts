import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmt } from './dates'
import { money } from './format'
import { pctChange, type ReportData } from './report'

const NAVY: [number, number, number] = [11, 42, 60]
const GOLD: [number, number, number] = [216, 179, 106]
const GOLD_INK: [number, number, number] = [140, 106, 44]
const OFF: [number, number, number] = [242, 235, 221]
const CREAM: [number, number, number] = [251, 248, 242]
const MUTED: [number, number, number] = [95, 111, 119]
const GREEN: [number, number, number] = [47, 125, 82]
const RED: [number, number, number] = [179, 67, 58]

/** As fontes padrão do PDF não têm emoji nem alguns símbolos: troca por equivalentes. */
const clean = (s: string) =>
  s.replace(/→/g, '›').replace(/−/g, '-').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').trim()
const brl = (v: number) => money(v).replace(/ /g, ' ')
const pct = (v: number) => `${Math.round(v * 100)}%`

/**
 * Gera o relatório em PDF (A4) com a identidade Fynvault.
 * `logo` é a logo horizontal (versão para fundo escuro) já convertida em imagem (data URL); opcional.
 */
export function buildPdf(d: ReportData, logo?: string): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 14
  doc.setProperties({ title: `Relatório financeiro — ${d.periodLabel}`, author: 'Fynvault', creator: 'Fynvault · Personal finance' })

  // Cabeçalho azul-petróleo com filete dourado
  doc.setFillColor(...NAVY).rect(0, 0, W, 34, 'F')
  doc.setFillColor(...GOLD).rect(0, 34, W, 0.8, 'F')
  if (logo) doc.addImage(logo, 'JPEG', M, 8, 58, 19)
  else {
    doc.setFont('times', 'bold').setFontSize(22).setTextColor(...OFF).text('Fynvault', M, 20)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...GOLD).text('P E R S O N A L   F I N A N C E', M, 26)
  }
  doc.setFont('times', 'bold').setFontSize(16).setTextColor(...OFF).text('Relatório financeiro', W - M, 15, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GOLD)
    .text(`${clean(d.periodLabel)}  ·  ${fmt.day(d.from)} a ${fmt.day(d.to)}`, W - M, 22, { align: 'right' })
  doc.setTextColor(200, 210, 214).text(clean(d.userName), W - M, 28, { align: 'right' })

  // Indicadores
  const k = d.kpis
  const boxes: [string, string, string, [number, number, number]][] = [
    ['GANHOS', brl(k.income), k.prevIncome ? `${pctChange(k.income, k.prevIncome)} vs ${d.prevLabel}` : '', GREEN],
    ['GASTOS', brl(k.expense), k.prevExpense ? `${pctChange(k.expense, k.prevExpense)} vs ${d.prevLabel}` : '', RED],
    ['SALDO', brl(k.balance), k.income > 0 ? `${pct(k.balance / k.income)} da renda` : '', k.balance < 0 ? RED : NAVY],
    ['GASTO MÉDIO/DIA', brl(k.avgDay), k.pending > 0 ? `${brl(k.pending)} pendente` : '', NAVY],
  ]
  const bw = (W - 2 * M - 9) / 4
  boxes.forEach(([label, value, sub, color], i) => {
    const x = M + i * (bw + 3)
    doc.setFillColor(...CREAM).setDrawColor(227, 216, 196).roundedRect(x, 42, bw, 24, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...GOLD_INK).text(label, x + 4, 48)
    doc.setFontSize(12).setTextColor(...color).text(value, x + 4, 56)
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...MUTED).text(clean(sub), x + 4, 62)
  })

  let y = 76
  const section = (title: string) => {
    if (y > 260) { doc.addPage(); y = 20 }
    doc.setFont('times', 'bold').setFontSize(13).setTextColor(...NAVY).text(title, M, y)
    doc.setFillColor(...GOLD).rect(M, y + 2, 18, 0.6, 'F')
    y += 6
  }
  const table = (head: string[], body: (string | number)[][], opts: {
    money?: number[]
    /** cor do valor por linha, aplicada só na coluna colorCol */
    colors?: (row: number) => [number, number, number] | null
    colorCol?: number
  } = {}) => {
    autoTable(doc, {
      startY: y, head: [head], body: body.map((r) => r.map((c) => (typeof c === 'number' ? c : clean(c)))),
      margin: { left: M, right: M }, theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: NAVY, lineColor: [227, 216, 196], lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: NAVY, textColor: OFF, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: CREAM },
      columnStyles: Object.fromEntries((opts.money ?? []).map((i) => [i, { halign: 'right' }])),
      didParseCell: (h) => {
        if ((opts.money ?? []).includes(h.column.index)) h.cell.styles.halign = 'right'
        if (h.section !== 'body' || h.column.index !== opts.colorCol) return
        const c = opts.colors?.(h.row.index)
        if (c) h.cell.styles.textColor = c
      },
    })
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 9
  }

  if (d.highlights.length) {
    section(`Destaques comparados com ${d.prevLabel}`)
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...NAVY)
    for (const h of d.highlights) {
      const up = /subiu|novo gasto/.test(h)
      doc.setFillColor(...(up ? RED : GREEN))
      if (up) doc.triangle(M, y + 1, M + 3, y + 1, M + 1.5, y - 1.8, 'F')
      else doc.triangle(M, y - 1.8, M + 3, y - 1.8, M + 1.5, y + 1, 'F')
      doc.setTextColor(...NAVY).text(clean(h).replace(/ /g, ' '), M + 5, y + 1)
      y += 5.5
    }
    y += 4
  }

  if (d.expenseByCategory.length) {
    section('Gastos por categoria')
    table(['Categoria', 'Valor', '% dos gastos'],
      d.expenseByCategory.map((s) => [s.name, brl(s.total), pct(s.total / (k.expense || 1))]), { money: [1, 2] })
  }
  if (d.natures.length) {
    section('Essencial × supérfluo')
    table(['Tipo', 'Valor', '%'], d.natures.map((n) => [n.name, brl(n.total), pct(n.total / (k.expense || 1))]), { money: [1, 2] })
  }
  if (d.changes.length) {
    section(`Comparação com ${d.prevLabel}`)
    const rows = d.changes.slice(0, 15)
    table(['Item', d.prevLabel, 'Atual', 'Variação'],
      rows.map((c) => [c.label, brl(c.previous), brl(c.current), `${c.delta > 0 ? '+' : ''}${brl(c.delta)}${c.pct != null ? ` (${c.delta > 0 ? '+' : ''}${pct(c.pct)})` : ''}`]),
      { money: [1, 2, 3], colorCol: 3, colors: (i) => (rows[i] ? (rows[i].delta > 0 ? RED : GREEN) : null) })
  }
  if (d.incomeByCategory.length) {
    section('Ganhos por categoria')
    table(['Categoria', 'Valor', '% dos ganhos'],
      d.incomeByCategory.map((s) => [s.name, brl(s.total), pct(s.total / (k.income || 1))]), { money: [1, 2] })
  }
  section(`Lançamentos (${d.transactions.length})`)
  const tx = d.transactions
  table(['Data', 'Descrição', 'Categoria', 'Pagamento', 'Valor', 'Situação'],
    tx.map((t) => [fmt.day(t.date), t.description + (t.receipt ? ' (comprovante)' : ''),
      t.subcategory ? `${t.category} › ${t.subcategory}` : t.category, t.payment,
      t.amount == null ? 'a informar' : brl(t.amount), t.status]),
    { money: [4], colorCol: 4, colors: (i) => (tx[i]?.amount == null ? MUTED : tx[i].amount! < 0 ? RED : GREEN) })

  // Rodapé em todas as páginas
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    const H = doc.internal.pageSize.getHeight()
    doc.setDrawColor(...GOLD).setLineWidth(0.3).line(M, H - 12, W - M, H - 12)
    doc.setFont('times', 'bold').setFontSize(8).setTextColor(...NAVY).text('Fynvault', M, H - 7)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED)
      .text(`· Personal finance · gerado em ${d.generatedAt.toLocaleString('pt-BR')}`, M + 13, H - 7)
      .text(`Página ${i} de ${pages}`, W - M, H - 7, { align: 'right' })
  }
  return doc.output('blob')
}

/** Converte um SVG (ex.: a logo) em JPEG sobre o fundo do cabeçalho, para colocar no PDF. */
export async function svgToImage(url: string, width: number): Promise<string | undefined> {
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const ratio = img.naturalHeight / img.naturalWidth || 0.33
    const c = document.createElement('canvas')
    c.width = width
    c.height = Math.round(width * ratio)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#0B2A3C'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.9)
  } catch {
    return undefined
  }
}
