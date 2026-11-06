export type Kind = 'expense' | 'income'
export type Nature = 'essencial' | 'superfluo' | 'investimento'
export type AmountType = 'fixed' | 'variable'
export type IncomeSource = 'trabalho' | 'aluguel' | 'pensao' | 'beneficio' | 'outro'

export interface Category {
  id: string
  parent_id: string | null
  name: string
  kind: Kind
  nature: Nature
  icon: string
  color: string
  monthly_budget: number | null
  sort_order: number
  archived: boolean
  /** prioridade ao pagar (1 Essencial … 4 Flexível; migration 0011); vazio = sugestão do app */
  priority?: number | null
}

export interface PaymentMethod {
  id: string
  name: string
  archived: boolean
  /** cartão de crédito (migration 0007) ou conta com saldo (migration 0009); ausente = forma comum */
  type?: 'other' | 'credit_card' | 'account'
  closing_day?: number | null
  due_day?: number | null
  credit_limit?: number | null
  /** conta (caixa): saldo exato informado e a data dele */
  opening_balance?: number | null
  opening_date?: string | null
  /** cartão ou forma de pagamento ligado a uma conta do caixa: o dinheiro sai dela (migration 0010) */
  account_id?: string | null
}

/** Transferência entre contas ou ajuste de saldo (migration 0009). Não é gasto nem ganho. */
export interface AccountMove {
  id: string
  user_id?: string
  kind: 'transfer' | 'adjust'
  /** transferência: sai de from_id e entra em to_id; ajuste: só um dos dois */
  from_id: string | null
  to_id: string | null
  amount: number
  date: string
  note: string | null
}

export interface Transaction {
  id: string
  kind: Kind
  /** null = conta variável cujo valor ainda não foi informado (só quando não paga) */
  amount: number | null
  date: string // YYYY-MM-DD
  description: string
  category_id: string | null
  payment_method_id: string | null
  paid: boolean
  paid_at: string | null
  notes: string | null
  installment_plan_id: string | null
  installment_number: number | null
  recurring_bill_id: string | null
  recurring_month: string | null
  receipt_path: string | null
  /** compra no cartão (migration 0007): dia da compra; `date` é o vencimento da fatura */
  purchase_date?: string | null
  /** de qual conta saiu (ou em qual entrou) o dinheiro, quando a forma de pagamento não é uma conta (0009) */
  paid_from?: string | null
  /** prioridade ao pagar só deste lançamento (migration 0011) */
  priority?: number | null
}

export interface InstallmentPlan {
  id: string
  description: string
  creditor: string | null
  category_id: string | null
  payment_method_id: string | null
  total_amount: number
  installments: number
  first_due: string
  notes: string | null
}

export interface RecurringBill {
  id: string
  description: string
  kind: Kind
  /** Valor mensal; nas contas variáveis é só uma estimativa opcional */
  amount: number | null
  amount_type: AmountType
  income_source: IncomeSource | null
  day_of_month: number
  category_id: string | null
  payment_method_id: string | null
  start_month: string
  end_month: string | null
  active: boolean
  generated_until: string | null
  notes: string | null
  /** prioridade ao pagar, para todos os meses (migration 0011) */
  priority?: number | null
}

export interface NewInstallmentPlan {
  description: string
  creditor: string | null
  category_id: string | null
  payment_method_id: string | null
  total_amount: number
  installments: number
  first_due: string
  notes: string | null
  first_paid: boolean
  /** compra parcelada no cartão: cada parcela vai para uma fatura seguida (migration 0007) */
  card?: { purchase_date: string; due_day: number }
}

export type Draft<T extends { id: string }> = Omit<T, 'id'> & { id?: string }

export interface Profile {
  user_id: string
  display_name: string
  avatar_emoji: string | null
  avatar_path: string | null
  reminder_time: string // HH:MM[:SS]
  onboarding_completed_at: string | null
}

export interface SavingsGoal {
  id: string
  name: string
  icon: string
  color: string
  /** null = reserva (dinheiro guardado sem valor-alvo, migration 0006) */
  target_amount: number | null
  monthly_contribution: number | null
  contribution_day: number | null
  target_date: string | null
  archived: boolean
}

export interface GoalContribution {
  id: string
  goal_id: string
  /** positivo = entrada; negativo = retirada (migration 0006) */
  amount: number
  /** origem (migration 0006): 'initial' e 'adjust' mudam o saldo mas não contam como dinheiro do mês */
  kind?: 'move' | 'initial' | 'adjust'
  date: string
  note: string | null
}

export type Bucket = 'avatars' | 'receipts'

/** Valor de um lançamento para somas: sem valor informado conta como zero. */
export const amt = (t: { amount: number | null }) => t.amount ?? 0

export type FamilyRole = 'editor' | 'viewer'

/** Um espaço de finanças: o do próprio usuário ou um compartilhado com ele. */
export interface Space {
  ownerId: string
  name: string
  avatarEmoji: string | null
  /** null = espaço próprio */
  role: FamilyRole | null
}

export interface FamilyMember {
  memberId: string
  name: string
  avatarEmoji: string | null
  role: FamilyRole
}

export interface FamilyInvite {
  code: string
  role: FamilyRole
  expiresAt: string
}
