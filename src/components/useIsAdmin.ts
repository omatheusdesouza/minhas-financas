import { useEffect, useState } from 'react'
import { api } from '../lib/api'

/** O usuário logado é gestor? Só serve para mostrar o atalho: quem protege os dados é o banco. */
export function useIsAdmin(): boolean {
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    let alive = true
    api.security?.isAdmin().then((ok) => { if (alive) setAdmin(ok) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return admin
}
