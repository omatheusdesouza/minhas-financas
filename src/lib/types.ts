export type Kind = 'expense' | 'income'
export type Nature = 'essencial' | 'superfluo' | 'investimento'

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
  amount: number
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
  amount: number
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
