import type { Backend } from './backend'
import { createLocalBackend } from './localBackend'
import { createCloudBackend } from './cloudBackend'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Com Supabase configurado usa a nuvem (com cópia offline no aparelho); senão, modo demonstração. */
export const api: Backend = url && key && !url.includes('SEU-PROJETO')
  ? createCloudBackend(url, key)
  : createLocalBackend()
