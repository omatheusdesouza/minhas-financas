import { api } from './api'

let reserves: Promise<boolean> | null = null

/** O banco já aceita reservas e retiradas (migration 0006)? Consulta uma vez por sessão. */
export function reservesAvailable(): Promise<boolean> {
  reserves ??= api.schemaVersion().then((v) => (v ?? '') >= '0006').catch(() => false)
  return reserves
}
