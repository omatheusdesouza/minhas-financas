import { api } from './api'

let reserves: Promise<boolean> | null = null

/**
 * O banco já aceita reservas e retiradas (migration 0006)? Guarda só a resposta "sim":
 * enquanto for "não", consulta de novo a cada tela (a migration pode ter sido rodada com o app aberto).
 */
export function reservesAvailable(): Promise<boolean> {
  if (reserves) return reserves
  const check = api.schemaVersion().then((v) => (v ?? '') >= '0006').catch(() => false)
  check.then((ok) => { if (ok) reserves = check })
  return check
}
