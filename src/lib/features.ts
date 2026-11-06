import { api } from './api'

const known = new Map<string, Promise<boolean>>()

/**
 * O banco já tem a migration `version`? Guarda só a resposta "sim": enquanto for "não", consulta de novo
 * a cada tela (a migration pode ter sido rodada com o app aberto).
 */
function schemaAtLeast(version: string): Promise<boolean> {
  const cached = known.get(version)
  if (cached) return cached
  const check = api.schemaVersion().then((v) => (v ?? '') >= version).catch(() => false)
  check.then((ok) => { if (ok) known.set(version, check) })
  return check
}

/** Reservas e retiradas (migration 0006). */
export const reservesAvailable = () => schemaAtLeast('0006')
/** Cartão de crédito com fatura (migration 0007). */
export const cardsAvailable = () => schemaAtLeast('0007')
/** Caixa: contas com saldo, transferências e ajustes (migration 0009). */
export const cashAvailable = () => schemaAtLeast('0009')
/** Cartão ou forma de pagamento ligado a uma conta (migration 0010). */
export const linkAvailable = () => schemaAtLeast('0010')
/** Prioridade dos pagamentos escolhida pela pessoa (migration 0011). */
export const priorityAvailable = () => schemaAtLeast('0011')
