import { useEffect, useState } from 'react'
import { CategorySelect, Field, MoneyInput, Segmented } from '../components/Fields'
import { Icon } from '../components/Icon'
import { ProfileForm, draftFrom, nameError, saveProfileDraft, type ProfileDraft } from '../components/ProfileForm'
import { BatteryTip, PermissionHelp, ReminderRules, useReminderPermission } from '../components/Reminders'
import { api } from '../lib/api'
import { addMonths, today } from '../lib/dates'
import { money, moneyInput, parseMoney } from '../lib/format'
import { generateRecurring, propagateRecurring } from '../lib/services'
import { BILL_TEMPLATES, INCOME_SOURCES, incomeSourceLabel, parseDay } from '../lib/templates'
import type { AmountType, IncomeSource, RecurringBill } from '../lib/types'
import { useApp } from '../store'

const STEPS = ['Perfil', 'Rendas fixas', 'Gastos fixos', 'Lembretes', 'Meta']

interface IncomeRow { key: string; id?: string; amount: string; source: IncomeSource; day: string; description: string }
interface BillRow {
  key: string; id?: string; name: string; categoryId: string | null; amountType: AmountType; amount: string; day: string
}

const key = () => Math.random().toString(36).slice(2)

/**
 * Onboarding obrigatório: perfil → rendas fixas → gastos fixos → meta (opcional).
 * A dashboard só aparece depois das rendas e dos gastos fixos.
 * Para quem já usa o app, as contas fixas existentes vêm preenchidas.
 */
export function Onboarding() {
  const { profile, avatarUrl, reloadProfile, idx, toast, bump } = useApp()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(profile, avatarUrl))
  const [existing, setExisting] = useState<RecurringBill[]>([])
  const [hasIncome, setHasIncome] = useState<boolean | null>(null)
  const [incomes, setIncomes] = useState<IncomeRow[]>([])
  const [bills, setBills] = useState<BillRow[]>([])
  const [goal, setGoal] = useState({ name: '', target: '', monthly: '', day: '', date: '' })
  const [hasGoal, setHasGoal] = useState(false)
  const reminders = useReminderPermission()

  // Contas fixas que a pessoa já tem
  useEffect(() => {
    api.listRecurring().then((rs) => {
      const active = rs.filter((r) => r.active)
      setExisting(active)
      const inc = active.filter((r) => r.kind === 'income')
      if (inc.length) {
        setHasIncome(true)
        setIncomes(inc.map((r) => ({
          key: key(), id: r.id, amount: moneyInput(r.amount), source: r.income_source ?? 'trabalho',
          day: String(r.day_of_month), description: r.description,
        })))
      }
      setBills(active.filter((r) => r.kind === 'expense').map((r) => ({
        key: key(), id: r.id, name: r.description, categoryId: r.category_id, amountType: r.amount_type,
        amount: moneyInput(r.amount), day: String(r.day_of_month),
      })))
    }).catch((e) => toast(e.message, 'error'))
  }, [toast])

  const incomeErrors = incomes.map((r) => (!(parseMoney(r.amount) > 0) ? 'Informe o valor.' : parseDay(r.day) == null ? 'Dia de 1 a 31.' : null))
  const billErrors = bills.map((r) =>
    !r.name.trim() ? 'Informe o nome.'
      : r.amountType === 'fixed' && !(parseMoney(r.amount) > 0) ? 'Informe o valor (ou marque como variável).'
        : parseDay(r.day) == null ? 'Dia de 1 a 31.' : null)

  async function guard(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
      setShowErrors(false)
    } catch (e: any) {
      toast(e?.message ?? String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  /** Cria/atualiza as contas fixas; as que a pessoa removeu da lista são pausadas, não apagadas. */
  async function persist(kind: 'income' | 'expense') {
    const rows = kind === 'income' ? (hasIncome ? incomes : []) : bills
    const keep = new Set(rows.map((r) => r.id).filter(Boolean))
    const saved: RecurringBill[] = []
    for (const r of rows) {
      const prev = existing.find((e) => e.id === r.id)
      const value = parseMoney(r.amount)
      const base = {
        ...(prev ?? {}), kind,
        day_of_month: parseDay(r.day)!, payment_method_id: prev?.payment_method_id ?? null,
        start_month: prev?.start_month ?? today().slice(0, 8) + '01', end_month: prev?.end_month ?? null,
        active: true, generated_until: prev?.generated_until ?? null, notes: prev?.notes ?? null,
      }
      const bill = kind === 'income'
        ? await api.saveRecurring({
          ...base,
          description: (r as IncomeRow).description.trim() || incomeSourceLabel((r as IncomeRow).source),
          amount: value, amount_type: 'fixed', income_source: (r as IncomeRow).source,
          category_id: prev?.category_id ?? findIncomeCategory((r as IncomeRow).source),
        })
        : await api.saveRecurring({
          ...base,
          description: (r as BillRow).name.trim(), amount: value > 0 ? value : null,
          amount_type: (r as BillRow).amountType, income_source: null, category_id: (r as BillRow).categoryId,
        })
      if (prev) await propagateRecurring(bill)
      saved.push(bill)
    }
    const paused = existing.filter((x) => x.kind === kind && !keep.has(x.id))
    for (const e of paused) await api.saveRecurring({ ...e, active: false })
    await generateRecurring(saved, { skipPastDue: true })
    // Guarda os ids: voltar e avançar de novo atualiza em vez de criar outra vez
    setExisting([...existing.filter((x) => x.kind !== kind), ...saved])
    if (kind === 'income') setIncomes((rs) => rs.map((r, i) => ({ ...r, id: saved[i]?.id ?? r.id })))
    else setBills((rs) => rs.map((r, i) => ({ ...r, id: saved[i]?.id ?? r.id })))
  }

  function findIncomeCategory(source: IncomeSource) {
    const name = INCOME_SOURCES.find((s) => s.value === source)?.category
    return idx.roots('income').find((c) => c.name === name)?.id ?? null
  }

  function findCategory(name: string) {
    return idx.all.find((c) => c.kind === 'expense' && !c.archived && c.name === name)?.id ?? null
  }

  async function next() {
    setShowErrors(true)
    if (step === 0) {
      if (nameError(draft.display_name)) return
      await guard(async () => {
        await saveProfileDraft(draft, profile)
        setStep(1)
      })
    } else if (step === 1) {
      if (hasIncome == null) return toast('Responda se você recebe algum valor fixo por mês.', 'error')
      if (hasIncome && (!incomes.length || incomeErrors.some(Boolean))) return
      await guard(async () => {
        await persist('income')
        setStep(2)
      })
    } else if (step === 2) {
      if (billErrors.some(Boolean)) return
      if (!bills.length && !confirm('Continuar sem nenhum gasto fixo? Você pode cadastrar depois em Contas › Fixas.')) return
      await guard(async () => {
        await persist('expense')
        // Etapas obrigatórias concluídas: a dashboard já pode aparecer
        const fresh = await api.getProfile()
        await api.saveProfile({ ...fresh!, onboarding_completed_at: new Date().toISOString() })
        const goals = await api.listGoals()
        setHasGoal(goals.some((g) => !g.archived))
        setStep(3)
      })
    } else if (step === 3) {
      // Lembretes: segue mesmo sem permissão (dá para ativar depois em Ajustes)
      if (hasGoal) await guard(finish)
      else setStep(4)
    } else {
      const target = parseMoney(goal.target)
      const monthly = goal.monthly.trim() ? parseMoney(goal.monthly) : null
      const day = goal.day.trim() ? parseDay(goal.day) : null
      if (!goal.name.trim() || !(target > 0) || (monthly != null && !(monthly > 0)) || (goal.day.trim() && day == null)
        || (goal.date && goal.date <= today())) return
      await guard(async () => {
        await api.saveGoal({
          name: goal.name.trim(), icon: '🎯', color: '#B8964F', target_amount: target,
          monthly_contribution: monthly, contribution_day: day, target_date: goal.date || null, archived: false,
        })
        await finish()
      })
    }
  }

  async function finish() {
    bump()
    await reloadProfile()
  }

  const goalTarget = parseMoney(goal.target)
  const goalMonthly = parseMoney(goal.monthly)
  const months = goalTarget > 0 && goalMonthly > 0 ? Math.ceil(goalTarget / goalMonthly) : null

  return (
    <div className="onboarding">
      <header className="ob-head">
        <img className="ob-logo logo-light" src="./brand/logo-horizontal.svg" alt="Fynvault" />
        <img className="ob-logo logo-dark" src="./brand/logo-horizontal-dark.svg" alt="Fynvault" />
        <div className="ob-progress" role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step + 1}>
          {STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}
        </div>
        <p className="muted small">Etapa {step + 1} de {STEPS.length} · {STEPS[step]}{step === 4 && ' (opcional)'}</p>
      </header>

      <main className="ob-body">
        {step === 0 && (
          <>
            <h1 className="ob-title">Bem-vindo ao Fynvault</h1>
            <p className="muted">Vamos deixar o app com a sua cara. Leva menos de 2 minutos.</p>
            <ProfileForm value={draft} onChange={setDraft} showErrors={showErrors} />
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="ob-title">Rendas fixas</h1>
            <p className="muted">Você recebe algum valor fixo por mês?</p>
            <div className="yes-no">
              <button className={`choice ${hasIncome === true ? 'on' : ''}`} onClick={() => {
                setHasIncome(true)
                if (!incomes.length) setIncomes([{ key: key(), amount: '', source: 'trabalho', day: '5', description: '' }])
              }}>Sim, recebo</button>
              <button className={`choice ${hasIncome === false ? 'on' : ''}`} onClick={() => setHasIncome(false)}>Não</button>
            </div>
            {hasIncome && incomes.map((r, i) => (
              <section key={r.key} className="card ob-row">
                <div className="ob-row-head">
                  <strong>Renda {i + 1}</strong>
                  {incomes.length > 1 && <button className="link danger-text" onClick={() => setIncomes(incomes.filter((x) => x.key !== r.key))}>Remover</button>}
                </div>
                <Field label="Origem">
                  <select value={r.source} onChange={(e) => setIncomes(incomes.map((x) => x.key === r.key ? { ...x, source: e.target.value as IncomeSource } : x))}>
                    {INCOME_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
                  </select>
                </Field>
                <div className="row2">
                  <Field label="Valor por mês"><MoneyInput value={r.amount} onChange={(v) => setIncomes(incomes.map((x) => x.key === r.key ? { ...x, amount: v } : x))} /></Field>
                  <Field label="Dia do recebimento">
                    <input type="number" inputMode="numeric" min={1} max={31} value={r.day}
                      onChange={(e) => setIncomes(incomes.map((x) => x.key === r.key ? { ...x, day: e.target.value } : x))} />
                  </Field>
                </div>
                <Field label="Descrição (opcional)">
                  <input value={r.description} placeholder={incomeSourceLabel(r.source)} maxLength={60}
                    onChange={(e) => setIncomes(incomes.map((x) => x.key === r.key ? { ...x, description: e.target.value } : x))} />
                </Field>
                {showErrors && incomeErrors[i] && <p className="bad-text small">{incomeErrors[i]}</p>}
              </section>
            ))}
            {hasIncome && (
              <button className="btn ghost block" onClick={() => setIncomes([...incomes, { key: key(), amount: '', source: 'outro', day: '5', description: '' }])}>
                <Icon name="plus" size={18} /> Adicionar outra renda
              </button>
            )}
            {hasIncome && incomes.length > 0 && (
              <p className="muted small center">Total fixo por mês: <b>{money(incomes.reduce((s, r) => s + (parseMoney(r.amount) || 0), 0))}</b></p>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="ob-title">Gastos fixos</h1>
            <p className="muted">Contas que chegam todo mês. Elas entram sozinhas em <b>Contas a pagar</b>. Nas variáveis (água, energia), você informa o valor quando a conta chegar.</p>
            <div className="chips-wrap">
              {BILL_TEMPLATES.map((t) => {
                const used = bills.some((b) => b.name.toLowerCase() === t.name.toLowerCase())
                return (
                  <button key={t.name} className={`chip-btn ${used ? 'on' : ''}`} disabled={used}
                    onClick={() => setBills([...bills, {
                      key: key(), name: t.name, categoryId: findCategory(t.category), amountType: t.amountType, amount: '', day: String(t.day),
                    }])}>
                    {t.icon} {t.name}
                  </button>
                )
              })}
              <button className="chip-btn" onClick={() => setBills([...bills, { key: key(), name: '', categoryId: null, amountType: 'fixed', amount: '', day: '10' }])}>
                + Outra conta
              </button>
            </div>
            {bills.map((r, i) => (
              <section key={r.key} className="card ob-row">
                <div className="ob-row-head">
                  <input className="ob-name" value={r.name} placeholder="Nome da conta" maxLength={60}
                    onChange={(e) => setBills(bills.map((x) => x.key === r.key ? { ...x, name: e.target.value } : x))} />
                  <button className="link danger-text" onClick={() => setBills(bills.filter((x) => x.key !== r.key))}>Remover</button>
                </div>
                <Segmented value={r.amountType} onChange={(v) => setBills(bills.map((x) => x.key === r.key ? { ...x, amountType: v } : x))} options={[
                  { value: 'fixed', label: 'Valor fixo' }, { value: 'variable', label: 'Valor variável' },
                ]} />
                <div className="row2">
                  <Field label={r.amountType === 'variable' ? 'Estimativa (opcional)' : 'Valor por mês'}>
                    <MoneyInput value={r.amount} onChange={(v) => setBills(bills.map((x) => x.key === r.key ? { ...x, amount: v } : x))} />
                  </Field>
                  <Field label="Dia do vencimento">
                    <input type="number" inputMode="numeric" min={1} max={31} value={r.day}
                      onChange={(e) => setBills(bills.map((x) => x.key === r.key ? { ...x, day: e.target.value } : x))} />
                  </Field>
                </div>
                <Field label="Categoria">
                  <CategorySelect kind="expense" value={r.categoryId} onChange={(v) => setBills(bills.map((x) => x.key === r.key ? { ...x, categoryId: v } : x))} />
                </Field>
                {showErrors && billErrors[i] && <p className="bad-text small">{billErrors[i]}</p>}
              </section>
            ))}
            {!bills.length && <p className="empty">Toque nos modelos acima para adicionar suas contas.</p>}
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="ob-title">Lembretes</h1>
            <p className="muted">O Fynvault avisa no seu celular, mesmo com o app fechado, para nenhuma conta passar do vencimento:</p>
            <section className="card"><ReminderRules /></section>
            {reminders.state === 'granted' ? (
              <p className="note">✅ Lembretes ativados. Você pode mudar o horário em Ajustes › Lembretes.</p>
            ) : reminders.state !== 'unsupported' && (
              <button className="btn primary block" onClick={reminders.ask}>🔔 Ativar lembretes</button>
            )}
            <PermissionHelp state={reminders.state} />
            <BatteryTip />
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="ob-title">Meta de economia</h1>
            <p className="muted">Quer guardar dinheiro para algum objetivo? Reserva de emergência, viagem, carro… (opcional)</p>
            <section className="card ob-row">
              <Field label="Objetivo"><input value={goal.name} maxLength={60} placeholder="Ex.: Reserva de emergência" onChange={(e) => setGoal({ ...goal, name: e.target.value })} /></Field>
              <div className="row2">
                <Field label="Quanto quer juntar"><MoneyInput value={goal.target} onChange={(v) => setGoal({ ...goal, target: v })} /></Field>
                <Field label="Aporte por mês"><MoneyInput value={goal.monthly} onChange={(v) => setGoal({ ...goal, monthly: v })} /></Field>
              </div>
              <div className="row2">
                <Field label="Dia do aporte (opcional)">
                  <input type="number" inputMode="numeric" min={1} max={31} value={goal.day} onChange={(e) => setGoal({ ...goal, day: e.target.value })} />
                </Field>
                <Field label="Prazo (opcional)">
                  <input type="date" value={goal.date} min={addMonths(today(), 1)} onChange={(e) => setGoal({ ...goal, date: e.target.value })} />
                </Field>
              </div>
              {months && <p className="note">Guardando {money(goalMonthly)} por mês, você chega lá em <b>{months} {months === 1 ? 'mês' : 'meses'}</b>.</p>}
              {showErrors && (!goal.name.trim() || !(goalTarget > 0)) && <p className="bad-text small">Informe o objetivo e quanto quer juntar, ou toque em "Pular".</p>}
              {showErrors && goal.day.trim() && parseDay(goal.day) == null && <p className="bad-text small">O dia precisa ser de 1 a 31.</p>}
            </section>
          </>
        )}
      </main>

      <footer className="ob-foot">
        {step > 0 && step < 3 && <button className="btn ghost" disabled={busy} onClick={() => { setShowErrors(false); setStep(step - 1) }}>Voltar</button>}
        {step === 4 && <button className="btn ghost" disabled={busy} onClick={() => guard(finish)}>Pular</button>}
        <button className="btn primary grow" disabled={busy} onClick={next}>
          {busy ? 'Salvando…' : step === 2 ? 'Concluir'
            : step === 3 ? (reminders.state === 'granted' || reminders.state === 'unsupported' ? 'Continuar' : 'Agora não')
              : step === 4 ? 'Criar meta e começar' : 'Continuar'}
        </button>
      </footer>
    </div>
  )
}
