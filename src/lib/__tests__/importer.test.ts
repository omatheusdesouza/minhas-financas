import { describe, expect, it } from 'vitest'
import { buildPreview, decodeText, learnCategories, parseAmount, parseDate, parseStatement, rowKeys } from '../importer'
import type { Category, Transaction } from '../types'

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261005120000[-3:BRT]
<TRNAMT>-1500.00
<FITID>abc1
<MEMO>Pagamento de boleto - ALUGUEL
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261005
<TRNAMT>5000.00
<FITID>abc2
<MEMO>Salário EMPRESA X
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261010
<TRNAMT>-89.90
<FITID>abc3
<NAME>IFOOD
<MEMO>Compra no débito
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261011
<TRNAMT>-300.00
<FITID>abc4
<MEMO>Aplicação RDB
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

const OFX_XML_CARD = `<?xml version="1.0"?><?OFX OFXHEADER="200"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261020</DTPOSTED><TRNAMT>-45.50</TRNAMT><FITID>c1</FITID><MEMO>Posto Shell</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261021</DTPOSTED><TRNAMT>800.00</TRNAMT><FITID>c2</FITID><MEMO>Pagamento recebido</MEMO></STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`

const cat = (id: string, name: string, kind: 'expense' | 'income' = 'expense'): Category =>
  ({ id, name, kind, icon: '', color: '', parent_id: null, archived: false, sort_order: 0, nature: 'essencial', monthly_budget: null } as unknown as Category)
const categories = [cat('deliv', 'Delivery'), cat('comb', 'Combustível'), cat('sal', 'Salário', 'income'), cat('alug', 'Aluguel / financiamento')]
const tx = (p: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(), kind: 'expense', amount: 10, date: '2026-10-05', description: '', category_id: null, payment_method_id: null,
  paid: true, paid_at: null, notes: null, installment_plan_id: null, installment_number: null, recurring_bill_id: null,
  recurring_month: null, receipt_path: null, ...p,
})

describe('ler extrato', () => {
  it('valores e datas nos formatos dos bancos', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('-12.50')).toBe(-12.5)
    expect(parseAmount('R$ -10,00')).toBe(-10)
    expect(parseAmount('(10,00)')).toBe(-10)
    expect(parseAmount('10,00-')).toBe(-10)
    expect(parseAmount('1,234.56')).toBe(1234.56)
    expect(parseAmount('abc')).toBeNaN()
    expect(parseDate('31/10/2026')).toBe('2026-10-31')
    expect(parseDate('5/1/26')).toBe('2026-01-05')
    expect(parseDate('20261031120000[-3:BRT]')).toBe('2026-10-31')
    expect(parseDate('2026-10-31')).toBe('2026-10-31')
  })

  it('OFX 1 (SGML) da conta e OFX 2 (XML) do cartão', () => {
    const a = parseStatement(OFX_SGML)
    expect(a.card).toBe(false)
    expect(a.rows.map((r) => [r.date, r.amount, r.bankId])).toEqual([
      ['2026-10-05', -1500, 'abc1'], ['2026-10-05', 5000, 'abc2'], ['2026-10-10', -89.9, 'abc3'], ['2026-10-11', -300, 'abc4'],
    ])
    expect(a.rows[2].description).toBe('IFOOD - Compra no débito')
    const c = parseStatement(OFX_XML_CARD)
    expect(c.card).toBe(true)
    expect(c.rows.map((r) => r.amount)).toEqual([-45.5, 800])
  })

  it('CSV do Nubank (conta e cartão) e planilha com débito/crédito', () => {
    const conta = parseStatement('Data,Valor,Identificador,Descrição\n05/10/2026,-89.90,id-1,"Compra no débito - IFOOD"\n06/10/2026,5000.00,id-2,Transferência recebida')
    expect(conta.format).toBe('CSV da conta Nubank')
    expect(conta.rows.map((r) => [r.amount, r.bankId])).toEqual([[-89.9, 'id-1'], [5000, 'id-2']])
    const cartao = parseStatement('date,title,amount\n2026-10-20,Posto Shell,45.50\n2026-10-21,Pagamento recebido,-800.00')
    expect(cartao.card).toBe(true)
    expect(cartao.rows.map((r) => r.amount)).toEqual([-45.5, 800])
    const plan = parseStatement('Data;Histórico;Débito;Crédito\n01/10/2026;Mercado Bom;1.234,56;\n02/10/2026;Salário;;5.000,00')
    expect(plan.rows.map((r) => r.amount)).toEqual([-1234.56, 5000])
    expect(() => parseStatement('a;b\n1;2')).toThrow(/colunas/)
  })

  it('arquivo em Windows-1252 (acentos)', () => {
    const bytes = new Uint8Array([0x53, 0x61, 0x6c, 0xe1, 0x72, 0x69, 0x6f]) // "Salário" em 1252
    expect(decodeText(bytes.buffer)).toBe('Salário')
  })

  it('chaves estáveis: mesmo arquivo gera as mesmas; compras iguais no mesmo dia ficam separadas', () => {
    const rows = [{ date: '2026-10-01', amount: -5, description: 'Café' }, { date: '2026-10-01', amount: -5, description: 'Café' }]
    const k1 = rowKeys(rows, 'pm')
    expect(k1[0]).not.toBe(k1[1])
    expect(rowKeys(rows, 'pm')).toEqual(k1)
    expect(rowKeys([{ ...rows[0], bankId: 'X' }], 'pm')[0]).toBe('import:pm:X')
  })
})

describe('prévia da importação', () => {
  const rows = parseStatement(OFX_SGML).rows
  const ids = rowKeys(rows, 'conta')

  it('categoria sugerida, dá baixa em conta aberta, desmarca aplicação e já importados', () => {
    const aluguel = tx({ id: 'alug-out', kind: 'expense', amount: 1500, date: '2026-10-05', paid: false, description: 'Aluguel' })
    const items = buildPreview({
      rows, ids, card: false, categories,
      existing: [aluguel, tx({ id: ids[1], kind: 'income', amount: 5000 })],
      learned: learnCategories([tx({ description: 'Pagamento de boleto - ALUGUEL', category_id: 'alug' })]),
    })
    expect(items.map((i) => [i.status, i.include])).toEqual([
      ['settle', true], ['duplicate', false], ['new', true], ['skip', false],
    ])
    expect(items[0].settleId).toBe('alug-out')
    expect(items[0].categoryId).toBe('alug') // aprendeu com o histórico
    expect(items[2].categoryId).toBe('deliv') // palavra iFood
  })

  it('extrato de cartão: compras entram, pagamento da fatura fica desmarcado', () => {
    const st = parseStatement(OFX_XML_CARD)
    const items = buildPreview({ rows: st.rows, ids: rowKeys(st.rows, 'nu'), card: true, existing: [], learned: new Map(), categories })
    expect(items.map((i) => [i.kind, i.include, i.categoryId])).toEqual([['expense', true, 'comb'], ['income', false, null]])
  })

  it('lançamento pago igual (mesmo valor, até 2 dias) fica desmarcado como possível repetido', () => {
    const items = buildPreview({
      rows: [{ date: '2026-10-10', amount: -89.9, description: 'IFOOD' }], ids: ['x'], card: false, categories, learned: new Map(),
      existing: [tx({ amount: 89.9, date: '2026-10-09', description: 'Lanche' })],
    })
    expect(items[0]).toMatchObject({ status: 'maybe', include: false })
  })
})
