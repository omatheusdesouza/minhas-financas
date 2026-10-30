import { BiometricAuth, BiometryErrorType, BiometryType } from '@aparajita/capacitor-biometric-auth'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { Capacitor } from '@capacitor/core'
import type { LockConfig, LockStore } from './lock'

const KEY = 'fv-lock'

/** Configuração do bloqueio no armazenamento seguro (Keychain / Keystore). */
export const secureLockStore: LockStore = {
  async get() {
    try {
      const v = await SecureStorage.get(KEY)
      return v && typeof v === 'object' ? (v as unknown as LockConfig) : null
    } catch {
      return null
    }
  },
  async set(c) {
    await SecureStorage.set(KEY, c as unknown as Record<string, unknown>)
  },
  async clear() {
    await SecureStorage.remove(KEY).catch(() => false)
  },
}

export interface Biometry {
  available: boolean
  /** "digital", "Face ID", "reconhecimento facial"... */
  label: string
}

export async function checkBiometry(): Promise<Biometry> {
  if (!Capacitor.isNativePlatform()) return { available: false, label: 'biometria' }
  try {
    const r = await BiometricAuth.checkBiometry()
    const label = r.biometryType === BiometryType.faceId ? 'Face ID'
      : r.biometryType === BiometryType.touchId ? 'Touch ID'
        : r.biometryType === BiometryType.faceAuthentication ? 'reconhecimento facial'
          : r.biometryType === BiometryType.irisAuthentication ? 'íris'
            : 'digital'
    return { available: r.isAvailable, label }
  } catch {
    return { available: false, label: 'biometria' }
  }
}

/** Pede a biometria. true = reconhecido; false = cancelado ou falhou (cai no PIN). */
export async function authenticateBiometric(reason = 'Desbloquear o Fynvault'): Promise<boolean> {
  try {
    await BiometricAuth.authenticate({
      reason, cancelTitle: 'Usar PIN', allowDeviceCredential: false, iosFallbackTitle: '',
      androidTitle: 'Fynvault', androidSubtitle: reason, androidConfirmationRequired: false,
    })
    return true
  } catch (e: any) {
    if (e?.code && e.code !== BiometryErrorType.userCancel && e.code !== BiometryErrorType.appCancel) {
      console.warn('biometria:', e.code)
    }
    return false
  }
}
