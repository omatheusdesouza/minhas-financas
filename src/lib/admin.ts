import type { AdminUser, SecurityEvent, SecurityEventKind } from './backend'

/** Textos e regras do painel do gestor (sem rede: fáceis de testar). */

export const EVENT_LABEL: Record<SecurityEventKind, { icon: string; label: string; tone: '' | 'good' | 'warn' | 'bad' }> = {
  login_ok: { icon: '✅', label: 'Entrou na conta', tone: 'good' },
  login_failed: { icon: '🔑', label: 'Senha errada', tone: 'warn' },
  reset_requested: { icon: '📧', label: 'Pediu recuperação de senha', tone: '' },
  invite_failed: { icon: '🎟️', label: 'Código de convite errado', tone: 'warn' },
  invite_blocked: { icon: '⛔', label: 'Bloqueado por errar convites', tone: 'bad' },
  csp_violation: { icon: '🛡️', label: 'Código estranho bloqueado', tone: 'warn' },
  flood: { icon: '🌊', label: 'Volume anormal de tentativas', tone: 'bad' },
  admin_block: { icon: '🔒', label: 'Conta bloqueada pelo gestor', tone: 'bad' },
  admin_unblock: { icon: '🔓', label: 'Conta desbloqueada pelo gestor', tone: '' },
  admin_delete: { icon: '🗑️', label: 'Conta excluída pelo gestor', tone: 'bad' },
}

export type UserFilter = 'todos' | 'bloqueados' | 'sem-confirmar' | 'inativos' | 'suspeitos'

const DAY = 86_400_000

export function filterUsers(users: AdminUser[], q: string, f: UserFilter, now = Date.now()): AdminUser[] {
  const term = q.trim().toLowerCase()
  return users.filter((u) => {
    if (term && !`${u.email} ${u.name ?? ''}`.toLowerCase().includes(term)) return false
    if (f === 'bloqueados') return u.blocked
    if (f === 'sem-confirmar') return !u.confirmed
    if (f === 'inativos') return !u.last_sign_in_at || now - Date.parse(u.last_sign_in_at) > 30 * DAY
    if (f === 'suspeitos') return u.failed24 >= 3
    return true
  })
}

/** Quem mais aparece nos eventos de um tipo (e-mails ou endereços IP), do maior para o menor. */
export function topBy(events: SecurityEvent[], kind: SecurityEventKind, key: 'email' | 'ip', limit = 5) {
  const count = new Map<string, number>()
  for (const e of events) {
    const k = e[key]
    if (e.kind === kind && k) count.set(k, (count.get(k) ?? 0) + 1)
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([value, n]) => ({ value, n }))
}

const dt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

/** "31/10/26 20:15" ou "—" */
export function when(iso: string | null | undefined): string {
  return iso ? dt.format(new Date(iso)).replace(',', '') : '—'
}

/** "há 5 min", "há 3 h", "há 2 dias", "nunca" */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nunca'
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 48 * 60) return `há ${Math.round(min / 60)} h`
  return `há ${Math.round(min / 1440)} dias`
}

/** Navegador resumido a partir do "user-agent". */
export function device(ua: string | null): string {
  if (!ua) return ''
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : ''
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl|python|node|axios|Go-http|okhttp/i.test(ua) ? 'robô/script' : ''
  return [br, os].filter(Boolean).join(' · ') || ua.slice(0, 40)
}
