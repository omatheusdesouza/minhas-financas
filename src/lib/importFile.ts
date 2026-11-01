import { decodeText, parsePdfText, parseStatement, parseTable, sniffFile, type Statement } from './importer'

/** O PDF tem senha (muitos bancos protegem o extrato com parte do CPF). */
export class PdfPasswordError extends Error {
  constructor(public wrong: boolean) {
    super(wrong ? 'Senha incorreta. Tente de novo.' : 'Este PDF tem senha.')
  }
}

/** Lê o extrato em qualquer formato aceito: OFX, CSV, Excel (.xlsx) ou PDF. */
export async function readStatementFile(file: Blob, password?: string): Promise<Statement> {
  const buf = await file.arrayBuffer()
  const kind = sniffFile(new Uint8Array(buf.slice(0, 8)))
  if (kind === 'pdf') return parsePdfText(await pdfLines(buf, password))
  if (kind === 'xlsx') return parseTable(await xlsxRows(buf), 'Excel')
  if (kind === 'xls') {
    throw new Error('Arquivo do Excel antigo (.xls) não é aceito. No banco, escolha OFX, CSV ou PDF; ou abra no Excel e salve como .xlsx ou CSV.')
  }
  const text = decodeText(buf)
  if (/\u0000/.test(text.slice(0, 2000))) throw new Error('Não reconheci este arquivo. Use o extrato em OFX, CSV, Excel (.xlsx) ou PDF.')
  return parseStatement(text)
}

/** Texto do PDF linha a linha, na ordem de leitura de cada página. */
async function pdfLines(buf: ArrayBuffer, password?: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
  let doc
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf), password, useSystemFonts: true }).promise
  } catch (e: any) {
    if (e?.name === 'PasswordException') throw new PdfPasswordError(Boolean(password))
    throw new Error('Não consegui abrir este PDF. Ele pode estar corrompido.')
  }
  const out: string[] = []
  for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    // agrupa os pedaços de texto pela altura (y) e ordena da esquerda para a direita
    const lines: { y: number; parts: { x: number; w: number; s: string }[] }[] = []
    for (const it of content.items as { str: string; transform: number[]; width: number }[]) {
      if (!it.str?.trim()) continue
      const x = it.transform[4]
      const y = it.transform[5]
      let line = lines.find((l) => Math.abs(l.y - y) < 3)
      if (!line) { line = { y, parts: [] }; lines.push(line) }
      line.parts.push({ x, w: it.width, s: it.str })
    }
    lines.sort((a, b) => b.y - a.y)
    for (const l of lines) {
      l.parts.sort((a, b) => a.x - b.x)
      let text = ''
      let end = -Infinity
      for (const part of l.parts) {
        text += (text && part.x - end > 1 ? ' ' : '') + part.s
        end = part.x + part.w
      }
      out.push(text)
    }
    page.cleanup()
  }
  await doc.destroy()
  return out
}

/** Primeira planilha do arquivo .xlsx como tabela de textos. */
async function xlsxRows(buf: ArrayBuffer): Promise<string[][]> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buf)
  } catch {
    throw new Error('Não consegui abrir esta planilha do Excel.')
  }
  const ws = wb.worksheets.find((w) => w.rowCount > 0)
  if (!ws) throw new Error('A planilha está vazia.')
  const rows: string[][] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const v = cell.value as unknown
      let s = ''
      if (v instanceof Date) s = v.toISOString().slice(0, 10)
      else if (typeof v === 'number') s = String(v)
      else if (v && typeof v === 'object') {
        const o = v as { result?: unknown; text?: string; richText?: { text: string }[] }
        if (o.result instanceof Date) s = o.result.toISOString().slice(0, 10)
        else if (o.result != null) s = String(o.result)
        else if (o.richText) s = o.richText.map((r) => r.text).join('')
        else if (o.text) s = o.text
      } else if (v != null) s = String(v)
      cells[col - 1] = s
    })
    rows.push(Array.from(cells, (c) => c ?? ''))
  })
  return rows
}
