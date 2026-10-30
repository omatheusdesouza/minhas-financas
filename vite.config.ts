import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Caminhos relativos para funcionar dentro do app nativo (Capacitor)
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
})
