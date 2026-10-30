import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Segmented } from '../components/Fields'
import { Icon } from '../components/Icon'
import { PeriodPicker, initialPeriod, type PeriodState } from '../components/PeriodPicker'
import { TxRow } from '../components/TxRow'
import { api } from '../lib/api'
import { fmt } from '../lib/dates'
import { money } from '../lib/format'
import { sumBy } from '../lib/services'
import type { Transaction } from '../lib/types'
import { useApp, useLoad } from '../store'

type KindFilter = 'all' | 'expense' | 'income'
type StatusFilter = 'all' | 'paid' | 'pending'

export function Transactions() {
  const { idx, paymentMethods } = useApp()
  const [params] = useSearchParams()
  const [p, setP] = useState<PeriodState>(() => {
    const from = params.get('from')
    const to = params.get('to')
    return from && to ? { preset: 'personalizado', period: { from, to } } : initialPeriod('mes')
  })
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [cat, setCat] = useState(params.get('cat') ?? '')
  const [pm, setPm] = useState('')
  const [showFilters, setShowFilters] = useState(Boolean(params.get('cat')))

  const { data, loading } = useLoad(() => api.listTransactions(p.period.from, p.period.to), [p.period.from, p.period.to])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (data ?? []).filter((t) => {
      if (kind !== 'all' && t.kind !== kind) return false
      if (status === 'paid' && !t.paid) return false
      if (status === 'pending' && t.paid) return false
      if (pm && t.payment_method_id !== pm) return false
      if (cat) {
        if (cat === 'none') { if (t.category_id) return false }
        else if (t.category_id !== cat && idx.root(t.category_id)?.id !== cat) return false
      }
      if (s && !`${t.description} ${idx.label(t.category_id)} ${t.notes ?? ''}`.toLowerCase().includes(s)) return false
      return true
    })
  }, [data, q, kind, status, cat, pm, idx])

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>()
    for (const t of filtered) m.set(t.date, [...(m.get(t.date) ?? []), t])
    return [...m.entries()]
  }, [filtered])

  const income = sumBy(filtered, 'income')
  const expense = sumBy(filtered, 'expense')
  const activeFilters = [kind !== 'all', status !== 'all', cat, pm].filter(Boolean).length

  return (
    <div className="screen">
      <header className="top"><h1>Lançamentos</h1></header>
      <PeriodPicker value={p} onChange={setP} />

      <div className="search-row">
        <label className="search">
          <Icon name="search" size={18} />
          <input placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button className={`btn ghost ${activeFilters ? 'on' : ''}`} onClick={() => setShowFilters((v) => !v)}>
          Filtros{activeFilters ? ` (${activeFilters})` : ''}
        </button>
      </div>

      {showFilters && (
        <div className="card filters">
          <Segmented value={kind} onChange={setKind} options={[
            { value: 'all', label: 'Todos' }, { value: 'expense', label: 'Gastos' }, { value: 'income', label: 'Ganhos' },
          ]} />
          <Segmented value={status} onChange={setStatus} options={[
            { value: 'all', label: 'Qualquer' }, { value: 'paid', label: 'Pagos' }, { value: 'pending', label: 'Pendentes' },
          ]} />
          <div className="row2">
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              <option value="none">Sem categoria</option>
              {(['expense', 'income'] as const).map((k) => (
                <optgroup key={k} label={k === 'expense' ? 'Gastos' : 'Ganhos'}>
                  {idx.roots(k, true).flatMap((r) => [
                    <option key={r.id} value={r.id}>{r.icon} {r.name}</option>,
                    ...idx.children(r.id, true).map((c) => <option key={c.id} value={c.id}>&nbsp;&nbsp;&nbsp;{c.icon} {c.name}</option>),
                  ])}
                </optgroup>
              ))}
            </select>
            <select value={pm} onChange={(e) => setPm(e.target.value)} aria-label="Forma de pagamento">
              <option value="">Todas as formas</option>
              {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {activeFilters > 0 && (
            <button className="link" onClick={() => { setKind('all'); setStatus('all'); setCat(''); setPm('') }}>Limpar filtros</button>
          )}
        </div>
      )}

      <div className="totals-bar">
        <span>Ganhos <b className="pos">{money(income)}</b></span>
        <span>Gastos <b className="neg">{money(expense)}</b></span>
        <span>Saldo <b className={income - expense < 0 ? 'neg' : 'pos'}>{money(income - expense)}</b></span>
      </div>

      {loading && !data ? <div className="skeleton tall" /> : groups.length === 0 ? (
        <p className="empty">Nenhum lançamento encontrado.</p>
      ) : groups.map(([day, txs]) => (
        <section key={day} className="day-group">
          <div className="day-head">
            <span>{fmt.weekday(day)}</span>
            <span className="muted small">{money(sumBy(txs, 'income') - sumBy(txs, 'expense'))}</span>
          </div>
          <div className="card flush">{txs.map((t) => <TxRow key={t.id} t={t} />)}</div>
        </section>
      ))}
    </div>
  )
}
