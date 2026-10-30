import { useState } from 'react'
import { api } from '../lib/api'
import { fmt, today } from '../lib/dates'
import { money, moneyInput, parseMoney } from '../lib/format'
import type { SavingsGoal } from '../lib/types'
import { useApp, useLoad } from '../store'
import { Field, MoneyInput } from './Fields'
import { Sheet } from './Sheet'

/** Registrar um aporte na meta e ver os últimos aportes. */
export function ContributionSheet({ goal, onClose }: { goal: SavingsGoal; onClose: () => void }) {
  const { run } = useApp()
  const [amount, setAmount] = useState(moneyInput(goal.monthly_contribution))
  const [date, setDate] = useState(today())
  const { data } = useLoad(async () => (await api.listContributions()).filter((c) => c.goal_id === goal.id), [goal.id])
  const value = parseMoney(amount)
  const valid = value > 0 && date <= today()
  const saved = (data ?? []).reduce((s, c) => s + c.amount, 0)

  async function save() {
    if (!valid) return
    const ok = await run(() => api.saveContribution({ goal_id: goal.id, amount: value, date, note: null }).then(() => true), 'Aporte registrado 💰')
    if (ok) onClose()
  }

  return (
    <Sheet title={`${goal.icon} ${goal.name}`} onClose={onClose}
      footer={<button className="btn primary grow" disabled={!valid} onClick={save}>Registrar aporte</button>}>
      <p className="muted">Guardado até agora: <b>{money(saved)}</b> de {money(goal.target_amount)}</p>
      <div className="row2">
        <Field label="Valor do aporte"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
        <Field label="Data"><input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
      </div>
      {(data ?? []).length > 0 && (
        <Field label="Últimos aportes">
          <ul className="kv">
            {data!.slice(0, 6).map((c) => (
              <li key={c.id}>
                <span>{fmt.day(c.date)}</span>
                <span>{money(c.amount)} <button className="link danger-text small" onClick={() =>
                  confirm('Excluir este aporte?') && run(() => api.deleteContribution(c.id), 'Aporte excluído')}>excluir</button></span>
              </li>
            ))}
          </ul>
        </Field>
      )}
    </Sheet>
  )
}
