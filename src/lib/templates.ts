import type { AmountType, IncomeSource } from './types'

export const INCOME_SOURCES: { value: IncomeSource; label: string; icon: string; category: string }[] = [
  { value: 'trabalho', label: 'Trabalho / salário', icon: '💼', category: 'Salário' },
  { value: 'aluguel', label: 'Aluguel recebido', icon: '🏠', category: 'Outros ganhos' },
  { value: 'pensao', label: 'Pensão', icon: '🤝', category: 'Outros ganhos' },
  { value: 'beneficio', label: 'Benefício (INSS, auxílio…)', icon: '🏛️', category: 'Outros ganhos' },
  { value: 'outro', label: 'Outro', icon: '💰', category: 'Outros ganhos' },
]

export const incomeSourceLabel = (v: IncomeSource | null | undefined) =>
  INCOME_SOURCES.find((s) => s.value === v)?.label ?? 'Renda'

/** Modelos prontos de gastos fixos (o nome da categoria é procurado entre as do usuário). */
export const BILL_TEMPLATES: { name: string; icon: string; amountType: AmountType; category: string; day: number }[] = [
  { name: 'Água', icon: '🚿', amountType: 'variable', category: 'Água', day: 10 },
  { name: 'Energia', icon: '💡', amountType: 'variable', category: 'Energia', day: 10 },
  { name: 'Internet', icon: '📶', amountType: 'fixed', category: 'Internet / telefone', day: 15 },
  { name: 'Aluguel', icon: '🔑', amountType: 'fixed', category: 'Aluguel / financiamento', day: 5 },
  { name: 'Escola', icon: '🎓', amountType: 'fixed', category: 'Educação', day: 10 },
  { name: 'Plano de saúde', icon: '🏥', amountType: 'fixed', category: 'Plano de saúde', day: 10 },
  { name: 'Cartão de crédito', icon: '💳', amountType: 'variable', category: 'Outros gastos', day: 10 },
]

/** Valida o dia do vencimento (1 a 31). Em meses curtos o app usa o último dia do mês. */
export function parseDay(v: string): number | null {
  if (!/^\d{1,2}$/.test(v.trim())) return null
  const d = Number(v)
  return d >= 1 && d <= 31 ? d : null
}
