import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdminOverview, AdminUser, ClientSecurityEvent, SecurityAlert, SecurityApi, SecurityEvent } from './backend'

/**
 * Registros de segurança e painel do gestor (migration 0008).
 * Toda a proteção fica no banco: as funções admin_* recusam quem não está na lista de gestores,
 * então ler este código ou abrir a tela pelo F12 não dá acesso a nada.
 */

function must<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    if (res.error.code === '42501' || /restrito ao gestor/i.test(res.error.message)) throw new Error('Acesso restrito ao gestor.')
    if (res.error.code === 'PGRST202') throw new Error('O banco de dados precisa da atualização 0008.')
    throw new Error(res.error.message.replace(/^.*?:\s*(?=[A-ZÀ-Ú])/, ''))
  }
  return res.data
}

/** Registra um evento de segurança sem atrapalhar o app (erros são ignorados). */
export async function logSecurityEvent(sb: SupabaseClient, kind: ClientSecurityEvent, email?: string | null, detail?: string | null) {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    await sb.rpc('log_security_event', {
      p_kind: kind, p_email: email ? email.trim().toLowerCase().slice(0, 254) : null, p_detail: detail ? detail.slice(0, 500) : null,
    })
  } catch {
    /* sem rede ou banco sem a migration 0008 */
  }
}

export function supabaseSecurity(sb: SupabaseClient): SecurityApi {
  let admin: Promise<boolean> | null = null
  let adminUser: string | undefined
  return {
    report: (kind, email, detail) => logSecurityEvent(sb, kind, email, detail),
    async isAdmin() {
      const { data } = await sb.auth.getSession()
      const uid = data.session?.user.id
      if (!uid) return false
      if (!admin || adminUser !== uid) {
        adminUser = uid
        admin = Promise.resolve(sb.rpc('is_admin')).then((r) => r.data === true).catch(() => false)
        admin.then((ok) => { if (!ok) admin = null }) // "não" é consultado de novo (pode ter sido cadastrado agora)
      }
      return admin
    },
    async overview() {
      return must(await sb.rpc('admin_overview')) as AdminOverview
    },
    async users() {
      return (must(await sb.rpc('admin_users')) ?? []) as AdminUser[]
    },
    async events(kind, days = 7) {
      return (must(await sb.rpc('admin_events', { p_kind: kind ?? null, p_days: days })) ?? []) as SecurityEvent[]
    },
    async alerts(all = false) {
      return (must(await sb.rpc('admin_alerts', { p_all: all })) ?? []) as SecurityAlert[]
    },
    async resolveAlert(id) {
      must(await sb.rpc('admin_resolve_alert', id === 'all' ? { p_id: null, p_all: true } : { p_id: id, p_all: false }))
    },
    async setBlocked(userId, blocked) {
      must(await sb.rpc('admin_set_blocked', { p_user: userId, p_block: blocked }))
    },
    async deleteUser(userId) {
      return must(await sb.rpc('admin_delete_user', { p_user: userId })) as { files: number }
    },
  }
}
