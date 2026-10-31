import { useCallback } from 'react'
import { api } from '../lib/api'
import { budgetMessage, budgetStatus, crossed, type BudgetStatus } from '../lib/budgets'
import { endOfMonth, fmt, startOfMonth, today } from '../lib/dates'
import { useApp } from '../store'

/**
 * Envolve uma gravação (lançar, pagar, importar): compara os limites das categorias antes e depois e
 * avisa se algum passou de 80% ou de 100% no mês. `dates` = datas que a gravação afeta.
 */
export function useBudgetWatch() {
  const { idx, toast } = useApp()
  return useCallback(async <T,>(dates: string[], save: () => Promise<T>): Promise<T> => {
    if (!idx.all.some((c) => c.monthly_budget)) return save()
    const months = [...new Set(dates.map(startOfMonth))].slice(0, 3)
    const snap = () => Promise.all(months.map(async (m) => budgetStatus(await api.listTransactions(m, endOfMonth(m)), idx)))
    const before = await snap().catch(() => null)
    const result = await save()
    if (before && result) {
      const after = await snap().catch(() => null)
      const alerts: string[] = []
      after?.forEach((list, i) => crossed(before[i], list).forEach((s: BudgetStatus) => {
        alerts.push(budgetMessage(s, months[i] === startOfMonth(today()) ? undefined : fmt.month(months[i]).split(' ')[0]))
      }))
      if (alerts.length) setTimeout(() => toast(alerts.join('\n'), 'warn'), 300)
    }
    return result
  }, [idx, toast])
}
