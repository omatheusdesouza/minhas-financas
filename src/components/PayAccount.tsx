import { useState } from 'react'
import { isAccount } from '../lib/cash'
import { cashAvailable } from '../lib/features'
import { useApp, useLoad } from '../store'
import { AccountSelect, Field } from './Fields'

const KEY = 'fv-last-account'
const lastAccount = () => { try { return localStorage.getItem(KEY) } catch { return null } }
export const rememberAccount = (id: string | null | undefined) => { try { if (id) localStorage.setItem(KEY, id) } catch { /* sem armazenamento */ } }

/**
 * "Saiu de qual conta?" ao pagar (ou "Entrou em qual conta?" ao receber), quando a forma de pagamento não é uma
 * conta do caixa. `patch` só traz paid_from com a migration 0009 aplicada (o banco antigo recusaria a coluna).
 */
export function usePayAccount(paymentMethodId: string | null | undefined, current?: string | null) {
  const { paymentMethods } = useApp()
  const { data: ok } = useLoad(cashAvailable, [])
  const accounts = paymentMethods.filter((p) => isAccount(p) && !p.archived)
  const pmIsAccount = isAccount(paymentMethods.find((p) => p.id === paymentMethodId))
  const show = Boolean(ok) && accounts.length > 0 && !pmIsAccount
  const fallback = [current, lastAccount()].find((id) => id && accounts.some((a) => a.id === id)) ?? accounts[0]?.id ?? null
  const [chosen, setChosen] = useState<string | null | undefined>(undefined)
  const value = chosen === undefined ? fallback : chosen
  return {
    show,
    value,
    set: setChosen,
    /** campos para gravar no lançamento */
    patch: (): { paid_from?: string | null } => {
      if (!show) return {}
      rememberAccount(value)
      return { paid_from: value }
    },
  }
}

export function PayAccountField({ income, state }: { income: boolean; state: ReturnType<typeof usePayAccount> }) {
  if (!state.show) return null
  return (
    <Field label={income ? 'Entrou em qual conta?' : 'Saiu de qual conta?'} hint="Atualiza o saldo dessa conta no Caixa.">
      <AccountSelect value={state.value} onChange={state.set} />
    </Field>
  )
}
