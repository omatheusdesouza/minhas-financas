import { describe, expect, it } from 'vitest'
import { parseCsv, parsePdfText, parseTable, sniffFile } from '../importer'

const pick = (rows: { date: string; amount: number; description: string }[]) => rows.map((r) => [r.date, r.amount, r.description])

describe('CSV de vários bancos', () => {
  it('Inter: títulos antes do cabeçalho, histórico + descrição, linha de saldo', () => {
    const st = parseCsv([
      'Extrato Conta Corrente', 'Conta ;12345678', 'Período ;01/10/2026 a 31/10/2026', 'Saldo ;1.000,00', '',
      'Data Lançamento;Histórico;Descrição;Valor;Saldo',
      '01/10/2026;Pix enviado ;Mercado Bom;-150,25;849,75',
      '02/10/2026;Pix recebido ;Fulano;1.000,00;1.849,75',
      '02/10/2026;Saldo do dia;;;1.849,75',
    ].join('\n'))
    expect(pick(st.rows)).toEqual([['2026-10-01', -150.25, 'Pix enviado - Mercado Bom'], ['2026-10-02', 1000, 'Pix recebido - Fulano']])
  })

  it('Banco do Brasil: coluna "Tipo Lançamento" (Entrada/Saída) e saldo anterior', () => {
    const st = parseCsv([
      '"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"',
      '"30/09/2026","Saldo Anterior","","","500,00",""',
      '"01/10/2026","Pix - Enviado","01/10 10:00 Padaria","123","25,50","Saída"',
      '"05/10/2026","Pix - Recebido","05/10 Salário","124","3.000,00","Entrada"',
    ].join('\n'))
    expect(pick(st.rows)).toEqual([['2026-10-01', -25.5, 'Pix - Enviado - 01/10 10:00 Padaria'], ['2026-10-05', 3000, 'Pix - Recebido - 05/10 Salário']])
  })

  it('Itaú sem cabeçalho: descobre data, descrição e valor pelo conteúdo', () => {
    const st = parseCsv('01/10/2026;SUPERMERCADO XYZ;-89,90\n03/10/2026;PIX TRANSF JOAO;200,00\n05/10/2026;CONTA DE LUZ;-120,00')
    expect(pick(st.rows)).toEqual([['2026-10-01', -89.9, 'SUPERMERCADO XYZ'], ['2026-10-03', 200, 'PIX TRANSF JOAO'], ['2026-10-05', -120, 'CONTA DE LUZ']])
  })

  it('Mercado Pago: saldo inicial antes do cabeçalho e valores com ponto', () => {
    const st = parseCsv([
      'INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE', '100.00;50.00;-30.00;120.00', '',
      'RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE',
      '01-10-2026;Pagamento com Pix Loja;111;-30.00;70.00',
      '02-10-2026;Transferência recebida;112;50.00;120.00',
    ].join('\n'))
    expect(st.rows.map((r) => [r.date, r.amount, r.bankId])).toEqual([['2026-10-01', -30, '111'], ['2026-10-02', 50, '112']])
  })

  it('débito e crédito em colunas separadas, separador vírgula com aspas', () => {
    const st = parseCsv('Data,Descrição,Débito,Crédito,Saldo\n10/10/2026,"Compra, cartão",45.00,,955.00\n11/10/2026,Depósito,,100.00,1055.00')
    expect(pick(st.rows)).toEqual([['2026-10-10', -45, 'Compra, cartão'], ['2026-10-11', 100, 'Depósito']])
  })

  it('planilha do Excel (células já separadas)', () => {
    const st = parseTable([['Extrato'], [], ['Data', 'Histórico', 'Valor'], ['2026-10-01', 'Uber', '-23.4'], ['2026-10-02', 'Salário', '5000']], 'Excel')
    expect(st.format).toBe('Excel')
    expect(pick(st.rows)).toEqual([['2026-10-01', -23.4, 'Uber'], ['2026-10-02', 5000, 'Salário']])
  })
})

describe('PDF', () => {
  const today = new Date('2026-11-01T12:00:00Z')

  it('extrato da conta no estilo Nubank: dia em cima, seções de entradas e saídas', () => {
    const st = parsePdfText([
      'Extrato de conta', 'Matheus  CPF ***', '01 a 31 de OUTUBRO de 2026', 'Saldo inicial 1.000,00',
      '01 OUT 2026 Total de entradas + 5.000,00',
      'Transferência recebida pelo Pix EMPRESA X 5.000,00',
      'Total de saídas - 239,90',
      'Compra no débito IFOOD 89,90',
      'Pagamento de boleto ALUGUEL 150,00',
      '03 OUT 2026 Total de saídas - 30,00',
      'Transferência enviada pelo Pix Fulano 30,00',
      'Saldo do dia 4.730,10',
    ], today)
    expect(st.card).toBe(false)
    expect(pick(st.rows)).toEqual([
      ['2026-10-01', 5000, 'Transferência recebida pelo Pix EMPRESA X'],
      ['2026-10-01', -89.9, 'Compra no débito IFOOD'],
      ['2026-10-01', -150, 'Pagamento de boleto ALUGUEL'],
      ['2026-10-03', -30, 'Transferência enviada pelo Pix Fulano'],
    ])
  })

  it('extrato com sinal ou D/C e coluna de saldo (pega o valor, não o saldo)', () => {
    const st = parsePdfText([
      'Extrato Período: 01/10/2026 a 31/10/2026', 'Data Lançamento Valor (R$) Saldo (R$)',
      '30/09/2026 SALDO ANTERIOR 1.000,00',
      '01/10/2026 PIX ENVIADO MERCADO -150,00 850,00',
      '02/10/2026 TED RECEBIDA 2.000,00 C 2.850,00',
      '03/10/2026 TARIFA PACOTE 25,00 D',
      '04/10 RENDIMENTO POUPANCA 3,21',
    ], today)
    expect(pick(st.rows)).toEqual([
      ['2026-10-01', -150, 'PIX ENVIADO MERCADO'], ['2026-10-02', 2000, 'TED RECEBIDA'],
      ['2026-10-03', -25, 'TARIFA PACOTE'], ['2026-10-04', 3.21, 'RENDIMENTO POUPANCA'],
    ])
  })

  it('fatura do cartão: compra sem sinal = gasto; pagamento negativo; ano anterior em janeiro', () => {
    const st = parsePdfText([
      'Fatura do cartão', 'Vencimento 10 JAN 2027', 'Total da fatura R$ 345,90', 'Pagamento mínimo R$ 50,00',
      '20 DEZ Posto Shell R$ 145,90', '28 DEZ Pagamento recebido -R$ 1.000,00', '05 JAN Netflix.com R$ 200,00',
    ], new Date('2027-01-06T12:00:00Z'))
    expect(st.card).toBe(true)
    expect(pick(st.rows)).toEqual([
      ['2026-12-20', -145.9, 'Posto Shell'], ['2026-12-28', 1000, 'Pagamento recebido'], ['2027-01-05', -200, 'Netflix.com'],
    ])
  })

  it('PDF de imagem (sem texto) e sem lançamentos', () => {
    expect(() => parsePdfText(['', ' '], today)).toThrow(/não tem texto/)
    expect(() => parsePdfText(['Comprovante de transferência realizado com sucesso'], today)).toThrow(/Não consegui ler/)
  })

  it('reconhece o tipo do arquivo pelos primeiros bytes', () => {
    const b = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)))
    expect(sniffFile(b('%PDF-1.7'))).toBe('pdf')
    expect(sniffFile(b('PK\u0003\u0004xx'))).toBe('xlsx')
    expect(sniffFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe('xls')
    expect(sniffFile(b('OFXHEADER'))).toBe('text')
  })
})
