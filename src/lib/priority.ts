import { diffDays } from './dates'
import type { CategoryIndex } from './services'
import type { Category, RecurringBill, Transaction } from './types'

/**
 * Pagamentos recomendados: em que ordem pagar as contas quando o dinheiro entra em datas diferentes.
 * Níveis: 1 Essencial (não pode atrasar), 2 Alta (juros/multa altos), 3 Normal, 4 Flexível (dá para adiar).
 */
export type Priority = 1 | 2 | 3 | 4

export const PRIORITY: Record<Priority, { label: string; short: string; tone: 'bad' | 'warn' | '' | 'muted'; desc: string }> = {
  1: { label: 'Essencial', short: 'Essencial', tone: 'bad', desc: 'Não pode atrasar: corta o serviço ou põe a moradia em risco.' },
  2: { label: 'Alta', short: 'Alta', tone: 'warn', desc: 'Atrasar sai caro: juros e multa altos.' },
  3: { label: 'Normal', short: 'Normal', tone: '', desc: 'Importante, mas dá para negociar alguns dias.' },
  4: { label: 'Flexível', short: 'Flexível', tone: 'muted', desc: 'Dá para adiar ou cancelar.' },
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ESSENTIAL = /aluguel|moradia|financiamento (da )?casa|energia|\bluz\b|agua|\bgas\b|condomin|iptu|saude|plano de saude|farmac|remedio|escola|educac|faculdade|creche|pensao/
const HIGH = /financiamento|promissor|parcela|emprestimo|cartao|fatura|ipva|imposto|licenciamento|multa|consorcio|cheque especial/
const FLEXIBLE = /assinatura|streaming|netflix|spotify|lazer|academia|clube|delivery|lanche|besteira|compras por impulso/

const asPriority = (v: unknown): Priority | null => (v === 1 || v === 2 || v === 3 || v === 4 ? v : null)

/** Nível sugerido pelo próprio app (sem escolha da pessoa): pela categoria, pelo tipo e pelo nome da conta. */
export function autoPriority(t: Pick<Transaction, 'description' | 'category_id' | 'installment_plan_id'>, idx: CategoryIndex): Priority {
  if (t.installment_plan_id) return 2
  const cat = idx.get(t.category_id)
  const root = cat?.parent_id ? idx.get(cat.parent_id) : cat
  const text = strip(`${cat?.name ?? ''} ${root?.name ?? ''} ${t.description ?? ''}`)
  if (ESSENTIAL.test(text)) return 1
  if (HIGH.test(text)) return 2
  if ((cat?.nature ?? root?.nature) === 'superfluo' || FLEXIBLE.test(text)) return 4
  return 3
}

/**
 * Nível que vale para a conta: o escolhido no lançamento → na conta fixa → na categoria (ou na principal) → o sugerido.
 */
export function effectivePriority(
  t: Transaction, idx: CategoryIndex, recurring: Map<string, RecurringBill>,
): { level: Priority; source: 'tx' | 'recurring' | 'category' | 'auto' } {
  const own = asPriority(t.priority)
  if (own) return { level: own, source: 'tx' }
  const rec = asPriority(t.recurring_bill_id ? recurring.get(t.recurring_bill_id)?.priority : null)
  if (rec) return { level: rec, source: 'recurring' }
  const cat: Category | undefined = idx.get(t.category_id)
  const catLevel = asPriority(cat?.priority) ?? asPriority(cat?.parent_id ? idx.get(cat.parent_id)?.priority : null)
  if (catLevel) return { level: catLevel, source: 'category' }
  return { level: autoPriority(t, idx), source: 'auto' }
}

export interface PlanBill {
  key: string
  label: string
  /** vencimento (AAAA-MM-DD) */
  due: string
  amount: number
  /** valor estimado (conta variável ainda sem o valor do mês) */
  estimated?: boolean
  priority: Priority
}

export interface PlanIncome {
  key: string
  label: string
  date: string
  amount: number
}

export interface PlanStep {
  bill: PlanBill
  /**
   * Sem pagamento parcial (juros do cartão, boleto não aceita): a conta é paga inteira ou espera.
   * pay: paga até o vencimento; defer: paga inteira, mas depois do vencimento (quando o dinheiro junta);
   * short: não junta o valor inteiro no período; o plano guarda o que der para ela e mostra quanto falta
   */
  action: 'pay' | 'defer' | 'short'
  /** quanto pagar (o valor inteiro) ou, em "short", quanto já fica guardado para ela */
  paidAmount: number
  /** quando pagar (hoje, ou o dia em que entra o dinheiro que cobre a conta) */
  payOn: string | null
  /** de onde vem o dinheiro: "hoje" ou a entrada que cobre a conta */
  fundedBy: string | null
  /** dinheiro que sobra logo depois de pagar (na ordem recomendada) */
  balanceAfter: number | null
  overdue: boolean
  /** dias até o vencimento (negativo = atrasada) */
  daysLeft: number
  /** quanto falta para conseguir pagar (adiadas sem data e "short") */
  missing: number
}

export interface Plan {
  steps: PlanStep[]
  cash: number
  nextIncome: PlanIncome | null
  /** contas que vencem antes da próxima entrada */
  needBeforeNext: number
  totalBills: number
  totalIncomes: number
  /** quanto falta no período inteiro (0 = dá para pagar tudo) */
  shortfall: number
  /**
   * Dinheiro de hoje que fica livre: pode ser usado sem atrapalhar nenhuma conta do plano,
   * desde que os ganhos entrem nas datas previstas.
   */
  freeNow: number
  /** quanto sobra no fim do período, depois de todas as contas do plano */
  freeAtEnd: number
  /** dinheiro disponível hoje: o que você tem + ganhos previstos para hoje */
  availableNow: number
}

const round = (v: number) => Math.round(v * 100) / 100

/**
 * Monta o plano de pagamento.
 * - As contas mais importantes escolhem primeiro (Essencial → Alta → Normal → Flexível; empate: vence antes).
 * - Cada uma é paga com o dinheiro que chega o mais perto possível do vencimento, sem passar dele (o dinheiro de hoje
 *   fica livre para o que vence antes). Um pagamento só é aceito se não deixar faltar dinheiro para os já marcados,
 *   em nenhuma data dali para frente.
 * - Se não dá até o vencimento, a conta vai para a primeira entrada em que cabe (atrasa); se não cabe em nenhuma, falta.
 */
export function recommend(opts: { cash: number; today: string; bills: PlanBill[]; incomes: PlanIncome[] }): Plan {
  const { today } = opts
  const cash = round(opts.cash)
  const incomes = opts.incomes.filter((i) => i.amount > 0 && i.date >= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const dueOf = (b: PlanBill) => (b.due < today ? today : b.due)
  const bills = opts.bills.filter((b) => b.amount > 0)

  // datas em que o dinheiro muda: hoje e cada entrada
  const dates = [...new Set([today, ...incomes.map((i) => i.date)])].sort()
  const funds = (d: string) => cash + incomes.filter((i) => i.date <= d).reduce((s, i) => s + i.amount, 0)
  const labelOf = (d: string) => (d === today ? 'hoje' : incomes.filter((i) => i.date === d).map((i) => i.label).join(' + '))
  const paid = new Map<string, number>()
  const paidUpTo = (d: string) => [...paid.entries()].filter(([k]) => k <= d).reduce((s, [, v]) => s + v, 0)
  const slackFrom = (d: string) => Math.min(...dates.filter((x) => x >= d).map((x) => funds(x) - paidUpTo(x)))
  const fits = (d: string, x: number) => slackFrom(d) + 0.005 >= x

  const steps: PlanStep[] = []
  const queue = [...bills].sort((a, b) => a.priority - b.priority || (dueOf(a) < dueOf(b) ? -1 : dueOf(a) > dueOf(b) ? 1 : b.amount - a.amount))
  for (const b of queue) {
    const due = dueOf(b)
    const onTime = dates.filter((d) => d <= due).reverse().find((d) => fits(d, b.amount))
    const late = onTime ? undefined : dates.filter((d) => d > due).find((d) => fits(d, b.amount))
    const when = onTime ?? late
    if (when) {
      paid.set(when, (paid.get(when) ?? 0) + b.amount)
      steps.push(step(b, onTime ? 'pay' : 'defer', when, labelOf(when), b.amount))
      continue
    }
    // não junta o valor inteiro no período: guarda o que sobrar para ela (contas menos importantes não usam esse dinheiro)
    const last = dates[dates.length - 1]
    const saved = Math.max(0, Math.floor(slackFrom(last) * 100) / 100)
    if (saved > 0) paid.set(last, (paid.get(last) ?? 0) + saved)
    steps.push(step(b, 'short', null, null, saved))
  }

  // ordem em que os pagamentos acontecem e quanto sobra depois de cada um
  const order = steps.filter((s) => s.payOn)
    .sort((a, b) => (a.payOn! < b.payOn! ? -1 : a.payOn! > b.payOn! ? 1 : a.bill.priority - b.bill.priority || (dueOf(a.bill) < dueOf(b.bill) ? -1 : 1)))
  // dinheiro livre: o menor folga entre hoje e o fim do período (antes de "guardar" para as contas que faltam)
  const lastDate = dates[dates.length - 1]
  // nunca mais do que o dinheiro que a pessoa já tem (um ganho previsto para hoje ainda não está na mão)
  const freeNow = round(Math.max(0, Math.min(cash, slackFrom(today))))
  const freeAtEnd = round(Math.max(0, funds(lastDate) - paidUpTo(lastDate)))

  let paidSoFar = 0
  for (const s of order) {
    paidSoFar += s.paidAmount
    s.balanceAfter = round(funds(s.payOn!) - paidSoFar)
  }

  const nextIncome = incomes.find((i) => i.date > today) ?? null
  const totalBills = round(bills.reduce((s, b) => s + b.amount, 0))
  const totalIncomes = round(incomes.reduce((s, i) => s + i.amount, 0))
  return {
    steps: [...order, ...steps.filter((s) => !s.payOn).sort((a, b) => a.bill.priority - b.bill.priority)],
    cash,
    nextIncome,
    needBeforeNext: round(bills.filter((b) => !nextIncome || dueOf(b) < nextIncome.date).reduce((s, b) => s + b.amount, 0)),
    totalBills,
    totalIncomes,
    shortfall: round(Math.max(0, totalBills - cash - totalIncomes)),
    freeNow,
    freeAtEnd,
    availableNow: round(funds(today)),
  }

  function step(bill: PlanBill, action: PlanStep['action'], payOn: string | null, fundedBy: string | null, paidAmount: number): PlanStep {
    return {
      bill, action, payOn, fundedBy, paidAmount: round(paidAmount), balanceAfter: null, missing: round(bill.amount - paidAmount),
      overdue: bill.due < today, daysLeft: diffDays(today, bill.due),
    }
  }
}
