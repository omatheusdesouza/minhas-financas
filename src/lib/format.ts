const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function money(v: number): string {
  return brl.format(v)
}

/** Converte "1.234,56", "1234,5", "1234.56" ou "1.234" (milhar) em número. */
export function parseMoney(input: string): number {
  const s = input.replace(/[^\d,.]/g, '')
  if (!s) return NaN
  let normalized: string
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, '')
  else normalized = s
  return Math.round(parseFloat(normalized) * 100) / 100
}

export function moneyInput(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return ''
  return v.toFixed(2).replace('.', ',')
}

export function pct(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return `${Math.round(v * 100)}%`
}
