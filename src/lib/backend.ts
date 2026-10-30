import type { SyncStatus } from './sync'
import type {
  Bucket, FamilyInvite, FamilyMember, FamilyRole, Space, Category, Draft, GoalContribution, InstallmentPlan, NewInstallmentPlan, PaymentMethod, Profile,
  RecurringBill, SavingsGoal, Transaction,
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
  /** scope 'own' = só o espaço do próprio usuário (lembretes), mesmo vendo um espaço compartilhado */
  listUnpaid(until: string, scope?: 'own'): Promise<Transaction[]>
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

  getProfile(): Promise<Profile | null>
  saveProfile(p: Omit<Profile, 'user_id'>): Promise<Profile>

  listGoals(scope?: 'own'): Promise<SavingsGoal[]>
  saveGoal(g: Draft<SavingsGoal>): Promise<SavingsGoal>
  deleteGoal(id: string): Promise<void>
  listContributions(): Promise<GoalContribution[]>
  saveContribution(c: Draft<GoalContribution>): Promise<GoalContribution>
  deleteContribution(id: string): Promise<void>

  /** Envia um arquivo para a pasta do usuário no bucket privado; devolve o caminho salvo. */
  uploadFile(bucket: Bucket, name: string, file: Blob): Promise<string>
  /** Link temporário para ver um arquivo privado. */
  fileUrl(bucket: Bucket, path: string): Promise<string>
  removeFile(bucket: Bucket, path: string): Promise<void>

  // Sincronização (só no modo nuvem)
  /** Prepara a cópia local; no primeiro acesso do aparelho, baixa os dados (precisa de internet). */
  prepare?(): Promise<void>
  /** Envia a fila e busca novidades agora. */
  sync?(): Promise<boolean>
  onSyncStatus?(cb: (s: SyncStatus) => void): () => void
  /** Dados chegaram da nuvem (outro aparelho): as telas devem recarregar. */
  onRemoteChange?(cb: () => void): () => void

  /** Modo família (modo nuvem com a migration 0004) */
  family?: FamilyApi
}

export interface FamilyApi {
  /** a migration 0004 já foi aplicada? */
  available(): boolean
  /** espaços que o usuário pode ver: o próprio primeiro */
  spaces(): Space[]
  current(): string
  setCurrent(ownerId: string): void
  /** atualiza quem compartilha com o usuário (baixa/apaga espaços); precisa de internet */
  refresh(): Promise<Space[]>
  members(): Promise<{ members: FamilyMember[]; invites: FamilyInvite[] }>
  invite(role: FamilyRole): Promise<FamilyInvite>
  cancelInvite(code: string): Promise<void>
  accept(code: string): Promise<Space>
  setRole(memberId: string, role: FamilyRole): Promise<void>
  remove(memberId: string): Promise<void>
  leave(ownerId: string): Promise<void>
}

/** Primeiro acesso no aparelho sem internet: não dá para baixar os dados ainda. */
export class FirstSyncOfflineError extends Error {
  constructor() {
    super('Conecte-se à internet para baixar seus dados neste aparelho pela primeira vez.')
  }
}

/** O banco na nuvem ainda não recebeu a migration necessária para esta versão do app. */
export class SchemaOutdatedError extends Error {
  constructor(public migration: string) {
    super(`O banco de dados precisa ser atualizado (migration ${migration}).`)
  }
}
