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
}

export interface PaymentMethod {
  id: string
  name: string
  archived: boolean
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
  target_amount: number
  monthly_contribution: number | null
  contribution_day: number | null
  target_date: string | null
  archived: boolean
}

export interface GoalContribution {
  id: string
  goal_id: string
  amount: number
  date: string
  note: string | null
}

export type Bucket = 'avatars' | 'receipts'

/** Valor de um lançamento para somas: sem valor informado conta como zero. */
export const amt = (t: { amount: number | null }) => t.amount ?? 0
