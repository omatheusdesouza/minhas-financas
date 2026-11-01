import type { AccountMove, PaymentMethod, Transaction } from './types'

/**
 * Caixa: quanto há em cada conta (Nubank, Itaú, Carteira...) e no total.
 * Saldo = saldo inicial informado + ganhos recebidos na conta − gastos pagos por ela (só lançamentos pagos,
 * a partir da data do saldo inicial) ± transferências e ajustes. O que é anterior à data já está no saldo inicial.
 */

export const isAccount = (pm: PaymentMethod | null | undefined): boolean => pm?.type === 'account'

const round = (v: number) => Math.round(v * 100) / 100

/** Conta ligada a um cartão ou forma de pagamento (débito do Nubank → Nubank), se for uma conta válida. */
export function linkedAccount(pm: PaymentMethod | null | undefined, methods: Map<string, PaymentMethod>): string | null {
  if (!pm || isAccount(pm) || !pm.account_id) return null
  return isAccount(methods.get(pm.account_id)) ? pm.account_id : null
}

/**
 * Em qual conta o dinheiro do lançamento entrou ou saiu:
 * 1) a forma de pagamento, se for uma conta; 2) a conta escolhida ao pagar ("pago com", ex.: a fatura paga pelo Itaú);
 * 3) a conta ligada ao cartão ou à forma de pagamento (débito do Nubank, cartão de crédito do Nubank).
 */
export function cashAccountOf(t: Pick<Transaction, 'payment_method_id' | 'paid_from'>, methods: Map<string, PaymentMethod>): string | null {
  const pm = t.payment_method_id ? methods.get(t.payment_method_id) : undefined
  if (pm && isAccount(pm)) return pm.id
  if (t.paid_from && isAccount(methods.get(t.paid_from))) return t.paid_from
  return linkedAccount(pm, methods)
}

/** Cartões e formas de pagamento ligados a uma conta. */
export const linkedTo = (accountId: string, methods: PaymentMethod[]) => methods.filter((m) => !isAccount(m) && m.account_id === accountId)

/** Dia em que o dinheiro mexeu: o dia do pagamento (senão, a data do lançamento). */
const cashDate = (t: Transaction) => t.paid_at ?? t.date

export interface Entry {
  key: string
  date: string
  /** positivo = entrou na conta; negativo = saiu */
  amount: number
  label: string
  kind: 'tx' | 'transfer' | 'adjust'
  tx?: Transaction
  move?: AccountMove
  /** saldo da conta depois deste movimento */
  balance: number
}

/** Movimentos de uma conta desde o saldo inicial, do mais recente ao mais antigo, com o saldo após cada um. */
export function statement(
  account: PaymentMethod, txs: Transaction[], moves: AccountMove[], methods: PaymentMethod[],
  describe: (t: Transaction) => string = (t) => t.description || 'Lançamento',
): Entry[] {
  const since = account.opening_date ?? '0000-00-00'
  const byId = new Map(methods.map((m) => [m.id, m]))
  const name = (id: string | null) => (id ? byId.get(id)?.name ?? 'outra conta' : '')
  const list: Omit<Entry, 'balance'>[] = []
  for (const t of txs) {
    if (!t.paid || t.amount == null || !(t.amount > 0)) continue
    if (cashAccountOf(t, byId) !== account.id) continue
    const date = cashDate(t)
    if (date < since) continue
    list.push({ key: `t:${t.id}`, date, amount: t.kind === 'income' ? t.amount : -t.amount, label: describe(t), kind: 'tx', tx: t })
  }
  for (const m of moves) {
    if (m.date < since || !(m.amount > 0)) continue
    const out = m.from_id === account.id
    const inn = m.to_id === account.id
    if (!out && !inn) continue
    const label = m.kind === 'adjust'
      ? (inn ? 'Ajuste de saldo (+)' : 'Ajuste de saldo (−)')
      : inn ? `Transferência de ${name(m.from_id)}` : `Transferência para ${name(m.to_id)}`
    list.push({ key: `m:${m.id}`, date: m.date, amount: inn ? m.amount : -m.amount, label: m.note ? `${label} · ${m.note}` : label, kind: m.kind, move: m })
  }
  // do mais antigo ao mais recente para acumular o saldo; no mesmo dia, entradas antes de saídas
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount))
  let balance = account.opening_balance ?? 0
  const out = list.map((e) => {
    balance = round(balance + e.amount)
    return { ...e, balance }
  })
  return out.reverse()
}

export interface AccountBalance {
  account: PaymentMethod
  balance: number
  /** entradas e saídas desde o saldo inicial */
  inflow: number
  outflow: number
}

/** Saldo de cada conta (arquivadas ficam de fora do total, mas aparecem se tiverem saldo). */
export function balances(methods: PaymentMethod[], txs: Transaction[], moves: AccountMove[]): AccountBalance[] {
  return methods.filter(isAccount).map((account) => {
    const entries = statement(account, txs, moves, methods)
    const inflow = round(entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0))
    const outflow = round(entries.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0))
    return { account, balance: entries[0]?.balance ?? round(account.opening_balance ?? 0), inflow, outflow }
  })
}

/** Total do caixa (contas ativas). */
export const cashTotal = (list: AccountBalance[]) => round(list.filter((b) => !b.account.archived).reduce((s, b) => s + b.balance, 0))

/** Ajuste para o saldo do app ficar igual ao do banco (null = já está certo). */
export function adjustment(accountId: string, current: number, real: number, date: string): Omit<AccountMove, 'id'> | null {
  const diff = round(real - current)
  if (Math.abs(diff) < 0.005) return null
  return diff > 0
    ? { kind: 'adjust', to_id: accountId, from_id: null, amount: diff, date, note: null }
    : { kind: 'adjust', from_id: accountId, to_id: null, amount: -diff, date, note: null }
}

/** Primeira data que importa para o caixa (a menor data de saldo inicial). */
export function earliestOpening(methods: PaymentMethod[]): string | null {
  const dates = methods.filter(isAccount).map((m) => m.opening_date).filter(Boolean) as string[]
  return dates.length ? dates.sort()[0] : null
}
