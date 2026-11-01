import type { UiPrefs } from './prefs'
import type { SyncStatus } from './sync'
import type {
  Bucket, FamilyInvite, FamilyMember, FamilyRole, Space, Category, Draft, GoalContribution, InstallmentPlan, NewInstallmentPlan, PaymentMethod, Profile,
  RecurringBill, SavingsGoal, Transaction,
} from './types'

export interface User {
  id: string
  email: string
  /** versão dos Termos e da Política de Privacidade aceita (LGPD) e quando */
  termsVersion?: string | null
  termsAcceptedAt?: string | null
  /** personalização do Início e da navegação guardada na conta (vale em todos os aparelhos) */
  prefs?: UiPrefs | null
}

/** Tudo o que o app precisa do armazenamento. Há duas implementações: nuvem e demonstração. */
export interface Backend {
  mode: 'cloud' | 'demo'

  getUser(): Promise<User | null>
  onAuthChange(cb: (u: User | null, event?: string) => void): () => void
  signIn(email: string, password: string): Promise<void>
  /** termsVersion: versão dos Termos e da Política aceita ao criar a conta */
  signUp(email: string, password: string, termsVersion: string): Promise<{ needsConfirmation: boolean }>
  /** Guarda a personalização na conta (modo nuvem; precisa de internet, senão fica só no aparelho). */
  savePrefs?(p: UiPrefs): Promise<void>
  /** Registra o aceite de uma nova versão dos Termos e da Política. */
  acceptTerms(version: string): Promise<void>
  /** Apaga a conta, todos os dados e arquivos (LGPD, art. 18, VI). Precisa de internet no modo nuvem. */
  deleteAccount(): Promise<void>
  /** Última migration aplicada no banco (null se não der para saber). */
  schemaVersion(): Promise<string | null>
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
  /** Registros de segurança e painel do gestor (modo nuvem com a migration 0008) */
  security?: SecurityApi
}

/** Eventos que o próprio app registra (os de convite e do gestor o banco registra sozinho). */
export type ClientSecurityEvent = 'login_failed' | 'login_ok' | 'reset_requested' | 'csp_violation'

export type SecurityEventKind = ClientSecurityEvent
  | 'invite_failed' | 'invite_blocked' | 'flood' | 'admin_block' | 'admin_unblock' | 'admin_delete'

export interface SecurityEvent {
  id: number
  created_at: string
  kind: SecurityEventKind
  email: string | null
  user_id: string | null
  ip: string | null
  user_agent: string | null
  detail: string | null
}

export interface SecurityAlert {
  id: number
  created_at: string
  level: 'info' | 'warn' | 'critical'
  title: string
  detail: string | null
  resolved_at: string | null
}

export interface AdminUser {
  id: string
  email: string
  name: string | null
  created_at: string
  last_sign_in_at: string | null
  confirmed: boolean
  blocked: boolean
  admin: boolean
  /** pessoas com quem compartilha as finanças / espaços de outros em que participa */
  shares: number
  member_of: number
  /** senhas erradas nas últimas 24 h */
  failed24: number
}

export interface AdminOverview {
  users: number
  new7: number
  active30: number
  unconfirmed: number
  blocked: number
  logins24: number
  failed24: number
  alerts: number
  /** cadastros por dia nos últimos 30 dias */
  signups: { day: string; n: number }[]
}

export interface SecurityApi {
  /** Registra um evento (nunca dá erro: sem internet ou sem a migration, simplesmente não registra). */
  report(kind: ClientSecurityEvent, email?: string | null, detail?: string | null): Promise<void>
  /** O usuário logado é gestor? (quem decide é o banco) */
  isAdmin(): Promise<boolean>
  overview(): Promise<AdminOverview>
  users(): Promise<AdminUser[]>
  events(kind?: SecurityEventKind | null, days?: number): Promise<SecurityEvent[]>
  alerts(all?: boolean): Promise<SecurityAlert[]>
  resolveAlert(id: number | 'all'): Promise<void>
  setBlocked(userId: string, blocked: boolean): Promise<void>
  /** Exclui a conta e os dados; devolve quantos arquivos ficaram no Storage para apagar à mão. */
  deleteUser(userId: string): Promise<{ files: number }>
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
