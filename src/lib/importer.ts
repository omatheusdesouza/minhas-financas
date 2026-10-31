import { diffDays } from './dates'
import type { Category, Kind, Transaction } from './types'

/**
 * Importar extrato do banco: lê OFX (padrão dos bancos) e CSV (Nubank conta/cartão ou planilha com data,
 * descrição e valor) e monta a prévia: gasto ou ganho, categoria sugerida, repetidos e contas para dar baixa.
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
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) {
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

export function parseCsv(text: string): Statement {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw new Error('O arquivo está vazio ou tem só o cabeçalho.')
  const first = lines[0]
  const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0]
  const head = splitCsvLine(first, sep).map(strip)
  const col = (...names: RegExp[]) => head.findIndex((h) => names.some((n) => n.test(h)))

  const iDate = col(/^data/, /^date$/, /^dt/, /data.*lanc/)
  const iDesc = col(/^descri/, /^historico/, /^title$/, /^memo$/, /^lancamento$/, /estabelecimento/, /^titulo/, /^description$/)
  const iAmount = col(/^valor/, /^amount$/, /^value$/, /^quantia/)
  const iDebit = col(/^debito/, /^saida/)
  const iCredit = col(/^credito/, /^entrada/)
  const iId = col(/^identificador$/, /^id$/)
  if (iDate < 0 || iDesc < 0 || (iAmount < 0 && iDebit < 0 && iCredit < 0)) {
    throw new Error('Não encontrei as colunas de data, descrição e valor neste CSV. Prefira o arquivo OFX do banco.')
  }
  // Nubank cartão: "date,title,amount" com compras positivas → inverte para a convenção (gasto negativo)
  const nubankCard = head.join(',') === 'date,title,amount'
  const nubankAccount = head.join(',') === 'data,valor,identificador,descricao'

  const rows: RawRow[] = []
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line, sep)
    const date = parseDate(c[iDate] ?? '')
    let amount = iAmount >= 0
      ? parseAmount(c[iAmount] ?? '')
      : (iCredit >= 0 ? Math.abs(parseAmount(c[iCredit] || '0') || 0) : 0) - (iDebit >= 0 ? Math.abs(parseAmount(c[iDebit] || '0') || 0) : 0)
    if (nubankCard) amount = -amount
    if (!date || Number.isNaN(amount) || amount === 0) continue
    rows.push({ date, amount: Math.round(amount * 100) / 100, description: clean(c[iDesc] || 'Lançamento'), bankId: iId >= 0 ? c[iId] || undefined : undefined })
  }
  if (!rows.length) throw new Error('Não encontrei lançamentos válidos neste CSV.')
  return { format: nubankCard ? 'CSV do cartão Nubank' : nubankAccount ? 'CSV da conta Nubank' : 'CSV', rows, card: nubankCard }
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
