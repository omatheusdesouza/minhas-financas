import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'br.com.minhasfinancas.app',
  appName: 'Fynvault',
  webDir: 'dist',
  android: { backgroundColor: '#0b1215' },
  ios: { backgroundColor: '#0b1215', contentInset: 'never' },
}

export default config
