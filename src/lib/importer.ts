import { diffDays } from './dates'
import type { Category, Kind, Transaction } from './types'

/**
 * Importar extrato do banco: lê OFX (padrão dos bancos), CSV e Excel (qualquer banco: o cabeçalho é procurado
 * nas primeiras linhas) e PDF (texto do extrato ou da fatura) e monta a prévia: gasto ou ganho, categoria sugerida, repetidos e contas para dar baixa.
 * Convenção interna: valor negativo = dinheiro saindo (gasto).
 */

export interface RawRow {
  date: string // AAAA-MM-DD
  /** negativo = saída (gasto), positivo = entrada */
  amount: number
  description: string
  /** identificador do banco (FITID do OFX, Identificador do Nubank), quando existe */
  bankId?: string
}

export type Statement = { format: string; rows: RawRow[]; /** o arquivo é de cartão de crédito */ card: boolean }

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 120)

/** Lê o arquivo em UTF-8 ou, se não for, em Windows-1252 (comum nos OFX dos bancos brasileiros). */
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

/** "1.234,56", "-12.50", "R$ 10,00", "(10,00)", "10,00-" → número. */
export function parseAmount(raw: string): number {
  let s = raw.trim().replace(/\s|R\$/g, '')
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1) }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1) }
  if (s.startsWith('+')) s = s.slice(1)
  const comma = s.lastIndexOf(',')
  const dot = s.lastIndexOf('.')
  if (comma > dot) s = s.replace(/\./g, '').replace(',', '.') // 1.234,56
  else if (dot > comma && comma >= 0) s = s.replace(/,/g, '') // 1,234.56
  const v = Number(s)
  if (!Number.isFinite(v) || s === '') return NaN
  return Math.round((neg ? -v : v) * 100) / 100
}

/** "2026-10-31", "31/10/2026", "31/10/26", "20261031120000[-3:BRT]" → "2026-10-31". */
export function parseDate(raw: string): string | null {
  const s = raw.trim()
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/)
  if (m) {
    if (Number(m[2]) > 12 || Number(m[1]) > 31) return null
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

/** OFX 1 (SGML, sem tags de fechamento) e OFX 2 (XML). */
export function parseOfx(text: string): Statement {
  const tag = (block: string, name: string) => block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? ''
  const rows: RawRow[] = []
  for (const block of text.split(/<STMTTRN>/i).slice(1)) {
    const date = parseDate(tag(block, 'DTPOSTED'))
    const amount = parseAmount(tag(block, 'TRNAMT').replace(',', '.'))
    if (!date || Number.isNaN(amount) || amount === 0) continue
    const memo = tag(block, 'MEMO')
    const name = tag(block, 'NAME')
    const description = clean(memo && name && !memo.includes(name) ? `${name} - ${memo}` : memo || name || 'Lançamento')
    rows.push({ date, amount, description, bankId: tag(block, 'FITID') || undefined })
  }
  return { format: 'OFX', rows, card: /<CCSTMTRS>/i.test(text) }
}

/** Divide uma linha de CSV respeitando aspas. */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
    } else if (ch === sep && !quoted) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

/** Separador mais provável (o que divide as linhas no mesmo número de colunas, e no maior número). */
function guessSeparator(lines: string[]): string {
  const sample = lines.slice(0, 40)
  let best = ','
  let bestScore = -1
  for (const sep of [';', '\t', ',', '|']) {
    const counts = sample.map((l) => splitCsvLine(l, sep).length).filter((n) => n > 1)
    if (!counts.length) continue
    const freq = new Map<number, number>()
    counts.forEach((n) => freq.set(n, (freq.get(n) ?? 0) + 1))
    const [cols, times] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
    const score = times * 10 + cols
    if (score > bestScore) { bestScore = score; best = sep }
  }
  return best
}

/** Linhas de saldo, totais e resumos: não são lançamentos. */
const NOT_A_ROW = /^(saldo|total|resumo|s ?a ?l ?d ?o)\b|saldo (anterior|do dia|final|em |bloqueado|dispon)|total de |limite (total|dispon)|pagamento m[ií]nimo|valor (total|da fatura|m[ií]nimo)|^(initial|final)_balance/i

type Cols = { date: number; desc: number[]; amount: number; debit: number; credit: number; type: number; id: number }

/** Acha as colunas pelo nome do cabeçalho (vários bancos). */
function headerColumns(cells: string[]): Cols | null {
  const head = cells.map((c) => strip(c).replace(/\s+/g, ' ').trim())
  const used = new Set<number>()
  const find = (...res: RegExp[]) => {
    for (const re of res) {
      const i = head.findIndex((h, j) => !used.has(j) && re.test(h))
      if (i >= 0) { used.add(i); return i }
    }
    return -1
  }
  const date = find(/^data( d[aoe] (lancamento|movimento|transacao|compra|operacao))?$/, /^data/, /^date$/, /^dt\b/, /release_date|date$/, /^dia$/)
  if (date < 0) return null
  const id = find(/^identificador$/, /^id$/, /reference_id/, /^id da transacao/)
  const amount = find(/^valor( \(r\$\)| r\$| em r\$| da transacao| do lancamento)?$/, /^amount$/, /^value$/, /net_amount/, /^quantia/, /^valor/)
  const debit = find(/^debito/, /^saida/, /^valor debito/)
  const credit = find(/^credito/, /^entrada/, /^valor credito/)
  const type = find(/^tipo( de)?( lancamento| transacao| operacao)?$/, /^d\/c$/, /^natureza/, /^c\/d$/)
  const desc: number[] = []
  for (const re of [/^lancamento$/, /^historico/, /^descri/, /^title$/, /^titulo/, /^memo$/, /estabelecimento/, /^detalhe/, /^complemento/, /^favorecido/, /^nome/, /transaction_type/]) {
    const i = head.findIndex((h, j) => !used.has(j) && re.test(h) && !/saldo/.test(h))
    if (i >= 0) { used.add(i); desc.push(i) }
  }
  if (amount < 0 && debit < 0 && credit < 0) return null
  return { date, desc, amount, debit, credit, type, id }
}

/** Sem cabeçalho (ex.: Itaú): descobre as colunas pelo conteúdo. */
function contentColumns(rows: string[][]): Cols | null {
  const width = Math.max(...rows.map((r) => r.length))
  const score = (test: (v: string) => boolean) => Array.from({ length: width }, (_, i) => rows.filter((r) => r[i] && test(r[i])).length)
  const dates = score((v) => !!parseDate(v))
  const nums = score((v) => /\d/.test(v) && !parseDate(v) && !Number.isNaN(parseAmount(v)))
  const date = dates.indexOf(Math.max(...dates))
  if (dates[date] < rows.length * 0.6) return null
  // valor = a primeira coluna numérica depois da data (a última costuma ser o saldo)
  const amountCols = nums.map((n, i) => (n >= rows.length * 0.6 && i !== date ? i : -1)).filter((i) => i >= 0)
  if (!amountCols.length) return null
  const amount = amountCols[0]
  const lens = Array.from({ length: width }, (_, i) => (i === date || amountCols.includes(i) ? -1 : rows.reduce((s, r) => s + (r[i]?.length ?? 0), 0)))
  const desc = lens.indexOf(Math.max(...lens))
  return { date, desc: desc >= 0 && lens[desc] > 0 ? [desc] : [], amount, debit: -1, credit: -1, type: -1, id: -1 }
}

/**
 * Tabela já dividida em células (CSV ou Excel). O cabeçalho pode estar em qualquer uma das primeiras linhas
 * (Inter, BB, C6 e Mercado Pago colocam títulos antes); sem cabeçalho, as colunas são descobertas pelo conteúdo.
 */
export function parseTable(table: string[][], source: 'CSV' | 'Excel'): Statement {
  const rowsIn = table.map((r) => r.map((c) => (c ?? '').toString().trim())).filter((r) => r.some((c) => c))
  if (!rowsIn.length) throw new Error('O arquivo está vazio.')
  let headerAt = -1
  let cols: Cols | null = null
  for (let i = 0; i < Math.min(rowsIn.length, 40) && !cols; i++) {
    cols = headerColumns(rowsIn[i])
    if (cols) headerAt = i
  }
  const body = headerAt >= 0 ? rowsIn.slice(headerAt + 1) : rowsIn
  if (!cols) cols = contentColumns(rowsIn.filter((r) => r.some((c) => parseDate(c))))
  if (!cols) {
    throw new Error('Não encontrei as colunas de data, descrição e valor. Confira se é o extrato (não o comprovante) ou tente o arquivo OFX ou PDF do banco.')
  }
  const head = headerAt >= 0 ? rowsIn[headerAt].map(strip).join(',') : ''
  // Nubank cartão: "date,title,amount" com compras positivas → inverte para a convenção (gasto negativo)
  const nubankCard = head === 'date,title,amount'
  const nubankAccount = head === 'data,valor,identificador,descricao'

  const rows: RawRow[] = []
  for (const c of body) {
    const date = parseDate(c[cols.date] ?? '')
    if (!date) continue
    const description = clean(cols.desc.map((i) => c[i]).filter(Boolean).join(' - ') || 'Lançamento')
    if (NOT_A_ROW.test(strip(description))) continue
    let amount = cols.amount >= 0
      ? parseAmount(c[cols.amount] ?? '')
      : (cols.credit >= 0 ? Math.abs(parseAmount(c[cols.credit] || '0') || 0) : 0) - (cols.debit >= 0 ? Math.abs(parseAmount(c[cols.debit] || '0') || 0) : 0)
    if (Number.isNaN(amount) || amount === 0) continue
    if (cols.type >= 0) {
      const t = strip(c[cols.type] ?? '')
      if (/^(d|debito|saida|despesa)/.test(t)) amount = -Math.abs(amount)
      else if (/^(c|credito|entrada|receita)/.test(t)) amount = Math.abs(amount)
    }
    if (nubankCard) amount = -amount
    rows.push({ date, amount: Math.round(amount * 100) / 100, description, bankId: cols.id >= 0 ? c[cols.id] || undefined : undefined })
  }
  if (!rows.length) throw new Error(`Não encontrei lançamentos neste ${source === 'CSV' ? 'CSV' : 'arquivo do Excel'}. Confira se o período exportado tem movimentações.`)
  const label = nubankCard ? 'CSV do cartão Nubank' : nubankAccount ? 'CSV da conta Nubank' : source
  return { format: label, rows, card: nubankCard }
}

export function parseCsv(text: string): Statement {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) throw new Error('O arquivo está vazio.')
  const sep = guessSeparator(lines)
  return parseTable(lines.map((l) => splitCsvLine(l, sep)), 'CSV')
}

const MONTHS: Record<string, string> = { jan: '01', fev: '02', feb: '02', mar: '03', abr: '04', apr: '04', mai: '05', may: '05', jun: '06', jul: '07', ago: '08', aug: '08', set: '09', sep: '09', out: '10', oct: '10', nov: '11', dez: '12', dec: '12' }
const PDF_DATE = /^(\d{1,2})\s?[/.\- ]\s?(\d{1,2}|[a-zç]{3})[a-zç]*\.?(?:\s?[/.\- ]\s?(\d{4}|\d{2}))?(?![\d,])/i
const MONEY = /(?:^|\s)([+\-−–]?\s?(?:R\$\s?)?[+\-−–]?\d{1,3}(?:\.\d{3})*,\d{2})(\s?[DC](?![a-zà-ú]))?(?=\s|$)/gi
const CREDIT_WORDS = /recebid|recebimento|dep[oó]sito|sal[aá]rio|estorno|reembolso|cr[eé]dito em conta|rendimento|resgate|devolu/i

/**
 * Texto de um extrato em PDF (já separado em linhas, na ordem da página).
 * Cada linha com data e valor vira um lançamento; linhas sem data herdam a última data (Nubank agrupa por dia).
 * Sinal: "-" ou "D" = saída, "+" ou "C" = entrada; senão, pela seção ("Total de saídas") ou por palavras.
 * Na fatura de cartão, valor sem sinal é compra e negativo é pagamento/estorno.
 */
export function parsePdfText(lines: string[], today = new Date()): Statement {
  const text = lines.join('\n')
  if (text.replace(/\s/g, '').length < 20) {
    throw new Error('Este PDF não tem texto (parece uma foto ou imagem escaneada). Baixe no app do banco o extrato em PDF original, OFX ou CSV.')
  }
  const card = /fatura/i.test(text) && /vencimento/i.test(text) && !/saldo anterior|extrato de conta/i.test(text)
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((m) => m[1])
  const freq = new Map<string, number>()
  years.forEach((y) => freq.set(y, (freq.get(y) ?? 0) + 1))
  const defaultYear = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? String(today.getFullYear())
  const limit = new Date(today.getTime() + 62 * 86_400_000).toISOString().slice(0, 10)

  const toDate = (m: RegExpMatchArray): string | null => {
    const day = Number(m[1])
    const mon = /^\d+$/.test(m[2]) ? m[2].padStart(2, '0') : MONTHS[strip(m[2]).slice(0, 3)]
    if (!mon || Number(mon) < 1 || Number(mon) > 12 || day < 1 || day > 31) return null
    let year = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : defaultYear
    let iso = `${year}-${mon}-${String(day).padStart(2, '0')}`
    if (!m[3] && iso > limit) { year = String(Number(year) - 1); iso = `${year}-${mon}-${String(day).padStart(2, '0')}` }
    return iso
  }

  const rows: RawRow[] = []
  let date: string | null = null
  let section = 0
  for (const raw of lines) {
    let line = raw.replace(/\s+/g, ' ').trim()
    if (!line) continue
    const dm = line.match(PDF_DATE)
    const parsed = dm ? toDate(dm) : null
    if (parsed) {
      date = parsed
      line = line.slice(dm![0].length).trim()
    }
    const plain = strip(line)
    if (/total de entradas|^entradas\b|^creditos?\b/.test(plain)) { section = 1; continue }
    if (/total de saidas|^saidas\b|^debitos?\b/.test(plain)) { section = -1; continue }
    if (!date || NOT_A_ROW.test(plain)) continue
    const money = [...line.matchAll(MONEY)]
    if (!money.length) continue
    // com dois valores na linha, o primeiro é o lançamento e o último o saldo
    const tok = money[0]
    const value = tok[1].replace(/\s/g, '').replace(/[−–]/g, '-')
    let amount = Math.abs(parseAmount(value.replace(/[+-]/g, '')))
    if (!amount) continue
    const explicit = /-/.test(value) ? -1 : /\+/.test(value) ? 1 : tok[2] ? (/d/i.test(tok[2]) ? -1 : 1) : 0
    let description = line
    for (const m of money) description = description.replace(m[0], ' ')
    description = clean(description.replace(/^[\s\-–|:]+|[\s\-–|:]+$/g, '')) || 'Lançamento'
    if (NOT_A_ROW.test(strip(description))) continue
    if (card) amount = explicit < 0 ? amount : -amount
    else {
      const sign = explicit || section || (CREDIT_WORDS.test(description) ? 1 : -1)
      amount *= sign
    }
    rows.push({ date, amount, description })
  }
  if (!rows.length) {
    throw new Error('Não consegui ler os lançamentos deste PDF. Alguns bancos montam o PDF de um jeito que não dá para ler; tente o OFX ou o CSV do mesmo período.')
  }
  return { format: card ? 'PDF da fatura' : 'PDF do extrato', rows, card }
}

/** Reconhece o formato pelo conteúdo. */
export function parseStatement(text: string): Statement {
  if (/<OFX>|OFXHEADER/i.test(text)) {
    const st = parseOfx(text)
    if (!st.rows.length) throw new Error('O arquivo OFX não tem lançamentos.')
    return st
  }
  return parseCsv(text)
}

/** Tipo do arquivo pelos primeiros bytes (o nome e a extensão nem sempre vêm certos do celular). */
export function sniffFile(bytes: Uint8Array): 'pdf' | 'xlsx' | 'xls' | 'text' {
  const head = String.fromCharCode(...bytes.slice(0, 8))
  if (head.startsWith('%PDF')) return 'pdf'
  if (head.startsWith('PK\u0003\u0004')) return 'xlsx'
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'xls'
  return 'text'
}

/** Chave estável de cada linha (o app transforma em id: importar de novo não duplica). */
export function rowKeys(rows: RawRow[], scope: string): string[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    if (r.bankId) return `import:${scope}:${r.bankId}`
    const base = `${r.date}|${r.amount}|${strip(r.description)}`
    const n = (seen.get(base) ?? 0) + 1 // compras iguais no mesmo dia continuam separadas
    seen.set(base, n)
    return `import:${scope}:${base}|${n}`
  })
}

export interface ImportItem {
  id: string
  date: string
  amount: number
  kind: Kind
  description: string
  categoryId: string | null
  include: boolean
  /** new = lançar; duplicate = já importado; settle = dá baixa numa conta em aberto; skip = sugerido não importar */
  status: 'new' | 'duplicate' | 'settle' | 'maybe' | 'skip'
  settleId?: string
  note?: string
}

const TRANSFER_OWN = /aplica[cç][aã]o|resgate|caixinha|\brdb\b|\bcdb\b|poupan[cç]a|entre contas|guardad|porquinho/i
const INVOICE_PAYMENT = /pagamento.{0,10}fatura|pgto\.?\s*fatura|fatura.{0,10}cart[aã]o|pagamento recebido/i

/** Palavras comuns → nome da categoria (das categorias que já vêm no app). */
const RULES: [RegExp, Kind, string][] = [
  [/ifood|rappi|ze delivery|aiqfome|uber ?eats|james delivery/, 'expense', 'Delivery'],
  [/posto|shell|ipiranga|petrobras|br mania|combustiv|auto ?posto/, 'expense', 'Combustível'],
  [/supermerc|mercado|atacad|assai|carrefour|pao de acucar|hortifruti|sams club/, 'expense', 'Supermercado'],
  [/farmac|drogar|droga|raia|pacheco|pague menos|panvel|nissei/, 'expense', 'Farmácia'],
  [/netflix|spotify|disney|prime ?video|amazon prime|youtube|hbo|deezer|apple\.com|google one|icloud|globoplay|paramount/, 'expense', 'Apps e assinaturas'],
  [/restaurante|churrasc|cantina|sushi|outback|coco bambu/, 'expense', 'Restaurantes'],
  [/lanchonete|padaria|burger|mc ?donald|\bbk\b|subway|pizza|habib|bobs|starbucks|cafe/, 'expense', 'Lanches'],
  [/estaciona|pedagio|sem parar|conectcar|veloe|zul digital/, 'expense', 'Estacionamento e pedágio'],
  [/enel|cemig|copel|light s|energia|eletropaulo|celpe|coelba|equatorial|neoenergia|celesc|rge/, 'expense', 'Energia'],
  [/sabesp|saneago|copasa|cedae|embasa|compesa|caesb|sanepar|corsan|agua e esgoto/, 'expense', 'Água'],
  [/\bvivo\b|\bclaro\b|\btim\b|\boi\b|\bnet\b|internet|telefonica/, 'expense', 'Internet / telefone'],
  [/aluguel/, 'expense', 'Aluguel / financiamento'],
  [/condominio|iptu/, 'expense', 'Condomínio / IPTU'],
  [/salario|folha de pag|proventos|pagamento de salario/, 'income', 'Salário'],
  [/rendimento|juros|dividend/, 'income', 'Rendimentos'],
  [/estorno|reembolso|cashback/, 'income', 'Reembolsos e presentes'],
]

/** Texto da descrição para comparar (sem acento, número ou código). */
export const descKey = (s: string) => strip(s).replace(/[0-9*#\-_/.]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Aprende com os lançamentos já feitos: descrição → categoria usada por último. */
export function learnCategories(history: Transaction[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const t of [...history].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (t.category_id && t.description) map.set(`${t.kind}|${descKey(t.description)}`, t.category_id)
  }
  return map
}

export function suggestCategory(desc: string, kind: Kind, learned: Map<string, string>, categories: Category[]): string | null {
  const key = descKey(desc)
  const exact = learned.get(`${kind}|${key}`)
  if (exact) return exact
  // mesma loja com outro código no fim (ex.: "IFOOD *RESTAURANTE 123")
  const firstWords = key.split(' ').slice(0, 2).join(' ')
  if (firstWords.length >= 4) {
    for (const [k, v] of learned) if (k.startsWith(`${kind}|${firstWords}`)) return v
  }
  for (const [re, k, name] of RULES) {
    if (k !== kind || !re.test(key)) continue
    const c = categories.find((x) => x.kind === kind && !x.archived && strip(x.name) === strip(name))
    if (c) return c.id
  }
  return null
}

/**
 * Monta a prévia. `ids` são os ids estáveis de cada linha; `existing`, os lançamentos já salvos perto dessas datas.
 * Extrato de cartão: compras entram; pagamentos e estornos ficam desmarcados.
 */
export function buildPreview(opts: {
  rows: RawRow[]
  ids: string[]
  card: boolean
  existing: Transaction[]
  learned: Map<string, string>
  categories: Category[]
}): ImportItem[] {
  const { rows, ids, card, existing, learned, categories } = opts
  const known = new Set(existing.map((t) => t.id))
  const used = new Set<string>()
  return rows.map((r, i) => {
    const kind: Kind = r.amount < 0 ? 'expense' : 'income'
    const amount = Math.abs(r.amount)
    const item: ImportItem = {
      id: ids[i], date: r.date, amount, kind, description: r.description,
      categoryId: suggestCategory(r.description, kind, learned, categories), include: true, status: 'new',
    }
    if (known.has(ids[i])) return { ...item, include: false, status: 'duplicate', note: 'Já importado antes' }
    if (card && kind === 'income') return { ...item, include: false, status: 'skip', note: 'Pagamento ou estorno da fatura' }
    if (!card && INVOICE_PAYMENT.test(r.description)) {
      return { ...item, include: false, status: 'skip', note: 'Pagamento de fatura: as compras do cartão já contam' }
    }
    if (!card && TRANSFER_OWN.test(r.description)) {
      return { ...item, include: false, status: 'skip', note: 'Parece movimento entre suas contas ou reservas' }
    }
    const near = (t: Transaction, days: number) => t.kind === kind && !used.has(t.id) && t.amount != null
      && Math.abs(t.amount - amount) < 0.005 && Math.abs(diffDays(t.date, r.date)) <= days && !t.purchase_date
    // conta em aberto com o mesmo valor (aluguel, salário...): dá baixa em vez de lançar outra
    const open = card ? undefined : existing.find((t) => !t.paid && near(t, 5))
    if (open) {
      used.add(open.id)
      return { ...item, status: 'settle', settleId: open.id, note: `Dá baixa em: ${open.description || 'conta em aberto'}` }
    }
    const same = existing.find((t) => t.paid && near(t, 2))
    if (same) {
      used.add(same.id)
      return { ...item, include: false, status: 'maybe', note: `Parece já lançado: ${same.description || 'lançamento'}` }
    }
    return item
  })
}
