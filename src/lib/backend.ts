import type {
  Category, Draft, InstallmentPlan, NewInstallmentPlan, PaymentMethod, RecurringBill, Transaction,
} from './types'

export interface User {
  id: string
  email: string
}

/** Tudo o que o app precisa do armazenamento. Há duas implementações: nuvem e demonstração. */
export interface Backend {
  mode: 'cloud' | 'demo'

  getUser(): Promise<User | null>
  onAuthChange(cb: (u: User | null, event?: string) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>
  resetPassword(email: string): Promise<void>
  /** Confirma o código de 6 dígitos enviado por e-mail e entra na conta. */
  verifyRecovery(email: string, code: string): Promise<void>
  updatePassword(password: string): Promise<void>
  signOut(): Promise<void>

  listCategories(): Promise<Category[]>
  saveCategory(c: Draft<Category>): Promise<Category>
  deleteCategory(id: string): Promise<void>

  listPaymentMethods(): Promise<PaymentMethod[]>
  savePaymentMethod(p: Draft<PaymentMethod>): Promise<PaymentMethod>
  deletePaymentMethod(id: string): Promise<void>

  listTransactions(from: string, to: string): Promise<Transaction[]>
  listUnpaid(until: string): Promise<Transaction[]>
  listPlanTransactions(): Promise<Transaction[]>
  saveTransaction(t: Draft<Transaction>): Promise<Transaction>
  updateTransactions(ids: string[], patch: Partial<Transaction>): Promise<void>
  deleteTransaction(id: string): Promise<void>
  /** Insere lançamentos de contas fixas, ignorando meses que já existem. */
  insertRecurringTransactions(ts: Draft<Transaction>[]): Promise<void>

  listPlans(): Promise<InstallmentPlan[]>
  createPlan(p: NewInstallmentPlan): Promise<string>
  updatePlan(id: string, patch: Partial<InstallmentPlan>): Promise<void>
  deletePlan(id: string): Promise<void>

  listRecurring(): Promise<RecurringBill[]>
  saveRecurring(r: Draft<RecurringBill>): Promise<RecurringBill>
  deleteRecurring(id: string): Promise<void>
}
