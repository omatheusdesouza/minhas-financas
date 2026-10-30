import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // Identificador mantido do nome antigo: trocá-lo impediria atualizar o app já instalado.
  appId: 'br.com.minhasfinancas.app',
  appName: 'Fynvault',
  webDir: 'dist',
  android: { backgroundColor: '#0B2A3C' },
  ios: { backgroundColor: '#0B2A3C', contentInset: 'never' },
}

export default config
