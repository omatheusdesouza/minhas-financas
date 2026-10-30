import type { Backend } from './backend'
import { createLocalBackend } from './localBackend'
import { createSupabaseBackend } from './supabaseBackend'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Com Supabase configurado usa a nuvem; senão, modo demonstração no aparelho. */
export const api: Backend = url && key && !url.includes('SEU-PROJETO')
  ? createSupabaseBackend(url, key)
  : createLocalBackend()
