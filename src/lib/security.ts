/** Regras de segurança usadas no app (sem acesso à rede: fáceis de testar). */

/** Problema da senha nova, ou null se ela serve: 8+ caracteres, com letras e números. */
export function passwordProblem(p: string): string | null {
  if (p.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.'
  if (p.length > 72) return 'A senha pode ter no máximo 72 caracteres.'
  if (!/\p{L}/u.test(p) || !/\d/.test(p)) return 'A senha precisa ter letras e números.'
  if (/^(.)\1+$/.test(p.replace(/\d/g, '')) && /^(\d)\1*$/.test(p.replace(/\D/g, ''))) return 'Senha fácil demais de adivinhar. Misture letras e números diferentes.'
  return null
}

/** O site foi aberto dentro de outra página (golpe de clique falso / "clickjacking")? */
export function isFramed(w: { top: unknown; self: unknown }): boolean {
  try {
    return w.top !== w.self
  } catch {
    return true // acesso ao topo bloqueado = está dentro de página de outro site
  }
}

export interface CspViolation {
  blockedURI: string
  violatedDirective: string
  sourceFile?: string
}

/**
 * Vale registrar o bloqueio? Extensões do navegador também esbarram na política e não são ataque ao app;
 * cada tipo de bloqueio é registrado uma vez por aparelho/sessão (`seen`).
 */
export function cspReport(v: CspViolation, seen: Set<string>): string | null {
  const from = `${v.blockedURI} ${v.sourceFile ?? ''}`
  if (/(chrome|moz|safari(-web)?|ms-browser)-extension:/i.test(from)) return null
  const blocked = v.blockedURI.replace(/^(https?:\/\/[^/]+).*$/, '$1').slice(0, 200) || 'inline'
  const detail = `${v.violatedDirective.split(' ')[0]} bloqueou ${blocked}`
  if (seen.has(detail)) return null
  seen.add(detail)
  return detail
}
