import { addMonths } from './dates'

/** Divide o total em parcelas em centavos; a sobra do arredondamento fica na 1ª (igual ao banco). */
export function splitInstallments(total: number, n: number, firstDue: string) {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / n)
  const rest = cents - base * n
  return Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    amount: (base + (i === 0 ? rest : 0)) / 100,
    date: addMonths(firstDue, i),
  }))
}
