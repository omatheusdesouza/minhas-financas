import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { api } from './api'
import { addDays, today } from './dates'
import { DEFAULT_HORIZON, buildSchedule } from './reminders'

/**
 * Agenda os lembretes no próprio celular (funcionam com o app fechado e voltam após reiniciar).
 * Sempre que algo muda (conta criada, editada, paga ou excluída), a agenda inteira é recalculada:
 * os lembretes antigos são cancelados e os novos, agendados.
 */

const ENABLED_KEY = 'fv-reminders'
export const CHANNEL_NORMAL = 'fv-lembretes'
export const CHANNEL_CRITICAL = 'fv-alertas'

export const remindersSupported = () => Capacitor.isNativePlatform()

export function remindersEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setRemindersEnabled(on: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off')
  } catch {
    // ignora: vale só para esta sessão
  }
}

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

export async function permissionState(): Promise<PermissionState> {
  if (!remindersSupported()) return 'unsupported'
  const p = await LocalNotifications.checkPermissions()
  return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt'
}

export async function requestPermission(): Promise<PermissionState> {
  if (!remindersSupported()) return 'unsupported'
  const p = await LocalNotifications.requestPermissions()
  return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt'
}

let initialized = false

/** Cria os canais do Android e trata o toque na notificação. Chamar uma vez ao abrir o app. */
export async function initNotifications(onOpen: (route: string) => void) {
  if (!remindersSupported() || initialized) return
  initialized = true
  if (Capacitor.getPlatform() === 'android') {
    await LocalNotifications.createChannel({
      id: CHANNEL_NORMAL, name: 'Lembretes', importance: 3, visibility: 1,
      description: 'Informar valor das contas variáveis e aportes nas metas',
    }).catch(() => {})
    await LocalNotifications.createChannel({
      id: CHANNEL_CRITICAL, name: 'Alertas de vencimento', importance: 5, visibility: 1,
      description: 'Contas que vencem em 2 dias, vencem hoje ou estão vencidas',
      lights: true, lightColor: '#B3433A', vibration: true,
    }).catch(() => {})
  }
  await LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    onOpen((a.notification.extra?.route as string) || '/contas')
  })
}

let running: Promise<number> | null = null
let again = false

/** Recalcula e reagenda todos os lembretes. Devolve quantos foram agendados. */
export async function syncReminders(): Promise<number> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      return await doSync()
    } finally {
      running = null
      if (again) {
        again = false
        void syncReminders()
      }
    }
  })()
  return running
}

async function doSync(): Promise<number> {
  if (!remindersSupported()) return 0
  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
  }
  if (!remindersEnabled() || (await permissionState()) !== 'granted') return 0

  const [bills, goals, profile] = await Promise.all([
    api.listUnpaid(addDays(today(), DEFAULT_HORIZON + 10), 'own'),
    api.listGoals('own'),
    api.getProfile(),
  ])
  const list = buildSchedule({ bills, goals, time: profile?.reminder_time ?? '09:00', now: new Date() })
  if (!list.length) return 0
  await LocalNotifications.schedule({
    notifications: list.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      largeBody: r.body,
      schedule: { at: r.at, allowWhileIdle: true },
      channelId: r.channel === 'critical' ? CHANNEL_CRITICAL : CHANNEL_NORMAL,
      smallIcon: 'ic_stat_fynvault',
      iconColor: r.channel === 'critical' ? '#B3433A' : '#D8B36A',
      extra: { route: r.kind === 'aporte' ? '/' : '/contas' },
    })),
  })
  return list.length
}

/** Notificação de teste em 5 segundos (botão em Ajustes). */
export async function testNotification() {
  await LocalNotifications.schedule({
    notifications: [{
      id: 1, title: 'Fynvault', body: 'Tudo certo! Seus lembretes vão chegar assim. 🔔',
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
      channelId: CHANNEL_CRITICAL, smallIcon: 'ic_stat_fynvault', iconColor: '#D8B36A',
    }],
  })
}
