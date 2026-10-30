import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Donut, SliceList } from '../components/Charts'
import { Segmented } from '../components/Fields'
import { Icon } from '../components/Icon'
import { PeriodPicker, initialPeriod } from '../components/PeriodPicker'
import { TxRow } from '../components/TxRow'
import { api } from '../lib/api'
import { compareSpending, insights } from '../lib/compare'
import { addDays, addMonths, diffDays, endOfMonth, fmt, periodLabel, previousPeriod, startOfMonth } from '../lib/dates'
import { saveFile, shareText } from '../lib/exporter'
import { reportFileName, type ReportData } from '../lib/report'
import { money, pct } from '../lib/format'
import { byCategory, sumBy, type Slice } from '../lib/services'
import { amt, type Kind } from '../lib/types'
import { useApp, useLoad } from '../store'

const NATURE_LABEL = { essencial: 'Essenciais', superfluo: 'Supérfluos', investimento: 'Investimentos' } as const
const NATURE_COLOR = { essencial: '#1F5F7A', superfluo: '#B07F8C', investimento: '#6E8B4E' } as const

export function Reports() {
  const { idx, paymentMethods, toast, profile } = useApp()
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null)
  const [p, setP] = useState(initialPeriod('mes'))
  const [kind, setKind] = useState<Kind>('expense')
  const [drill, setDrill] = useState<Slice | null>(null)
  const prev = previousPeriod(p.preset, p.period)

  const { data } = useLoad(async () => {
    const sixFrom = startOfMonth(addMonths(p.period.to, -5))
    const [cur, before, six] = await Promise.all([
      api.listTransactions(p.period.from, p.period.to),
      api.listTransactions(prev.from, prev.to),
      api.listTransactions(sixFrom, endOfMonth(p.period.to)),
    ])
    return { cur, before, six, sixFrom }
  }, [p.period.from, p.period.to])

  const r = useMemo(() => {
    if (!data) return null
    const { cur, before, six, sixFrom } = data
    const income = sumBy(cur, 'income')
    const expense = sumBy(cur, 'expense')
    const pIncome = sumBy(before, 'income')
    const pExpense = sumBy(before, 'expense')
    const days = diffDays(p.period.from, p.period.to) + 1
    const slices = byCategory(cur, idx, kind)
    const sub = drill ? byCategory(cur, idx, kind, drill.id) : null

    const natures = (['essencial', 'superfluo', 'investimento'] as const).map((n) => ({
      id: n, name: NATURE_LABEL[n], icon: n === 'essencial' ? '🏠' : n === 'superfluo' ? '🍔' : '🐷', color: NATURE_COLOR[n],
      total: cur.filter((t) => t.kind === 'expense' && idx.nature(t.category_id) === n).reduce((s, t) => s + amt(t), 0),
    })).filter((x) => x.total > 0)

    const byPm = new Map<string, number>()
    for (const t of cur) if (t.kind === 'expense') {
      const name = paymentMethods.find((m) => m.id === t.payment_method_id)?.name ?? 'Não informado'
      byPm.set(name, (byPm.get(name) ?? 0) + amt(t))
    }

    // Evolução: por dia em períodos curtos, por mês em períodos longos
    const monthly = days > 62
    const buckets = new Map<string, { label: string; Ganhos: number; Gastos: number }>()
    if (!monthly) for (let i = 0; i < days; i++) {
      const d = addDays(p.period.from, i)
      buckets.set(d, { label: d.slice(8) + '/' + d.slice(5, 7), Ganhos: 0, Gastos: 0 })
    }
    for (const t of [...cur].reverse()) {
      const key = monthly ? t.date.slice(0, 7) : t.date
      const b = buckets.get(key) ?? { label: monthly ? fmt.month(key + '-01').slice(0, 3) + '/' + key.slice(2, 4) : key, Ganhos: 0, Gastos: 0 }
      if (t.kind === 'income') b.Ganhos += amt(t)
      else b.Gastos += amt(t)
      buckets.set(key, b)
    }
    const series = [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v)

    const top = cur.filter((t) => t.kind === 'expense').sort((a, b) => amt(b) - amt(a)).slice(0, 5)
    const pending = cur.filter((t) => !t.paid && t.kind === 'expense').reduce((s, t) => s + amt(t), 0)
    const changes = compareSpending(cur, before, idx)
    const highlights = insights(changes, 5)
    // Últimos 6 meses (até o mês do fim do período)
    const months = Array.from({ length: 6 }, (_, i) => addMonths(sixFrom, i))
    const sixSeries = months.map((m) => {
      const inMonth = six.filter((t) => t.date.slice(0, 7) === m.slice(0, 7))
      return { label: fmt.month(m).slice(0, 3) + '/' + m.slice(2, 4), Ganhos: sumBy(inMonth, 'income'), Gastos: sumBy(inMonth, 'expense') }
    })
    return { cur, income, expense, pIncome, pExpense, days, slices, sub, natures, byPm, series, top, pending, changes, highlights, sixSeries }
  }, [data, idx, kind, drill, p.period, paymentMethods])

  const label = periodLabel(p.preset, p.period)

  function reportData(): ReportData | null {
    if (!r) return null
    return {
      periodLabel: label, from: p.period.from, to: p.period.to, prevLabel: periodLabel(p.preset, prev),
      userName: profile?.display_name ?? '', generatedAt: new Date(),
      kpis: {
        income: r.income, expense: r.expense, balance: r.income - r.expense, avgDay: r.expense / r.days,
        pending: r.pending, prevIncome: r.pIncome, prevExpense: r.pExpense,
      },
      expenseByCategory: byCategory(r.cur, idx, 'expense'),
      incomeByCategory: byCategory(r.cur, idx, 'income'),
      natures: r.natures.map((n) => ({ name: n.name, total: n.total })),
      changes: r.changes, highlights: r.highlights,
      transactions: [...r.cur].reverse().map((t) => {
        const c = idx.get(t.category_id)
        return {
          date: t.date, kind: t.kind === 'expense' ? 'Gasto' : 'Ganho', description: t.description,
          category: idx.root(t.category_id)?.name ?? 'Sem categoria', subcategory: c && c.parent_id ? c.name : '',
          payment: paymentMethods.find((m) => m.id === t.payment_method_id)?.name ?? '',
          amount: t.amount == null ? null : t.kind === 'expense' ? -t.amount : t.amount,
          status: t.paid ? 'Pago' : 'Pendente', notes: t.notes ?? '', receipt: Boolean(t.receipt_path),
        }
      }),
    }
  }

  async function exportFile(type: 'pdf' | 'xlsx') {
    const d = reportData()
    if (!d || exporting) return
    setExporting(type)
    try {
      if (type === 'pdf') {
        const { buildPdf, svgToImage } = await import('../lib/exportPdf')
        const logo = await svgToImage('./brand/logo-horizontal-dark.svg', 900)
        await saveFile(reportFileName(d, 'pdf'), buildPdf(d, logo), 'application/pdf')
      } else {
        const { buildXlsx } = await import('../lib/exportXlsx')
        await saveFile(reportFileName(d, 'xlsx'), await buildXlsx(d), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      }
    } catch (e: any) {
      toast(e?.message ?? String(e), 'error')
    } finally {
      setExporting(null)
    }
  }

  async function shareSummary() {
    if (!r) return
    const lines = [
      `📊 Fynvault — ${label}`,
      `Ganhos: ${money(r.income)}`,
      `Gastos: ${money(r.expense)}`,
      `Saldo: ${money(r.income - r.expense)}`,
      '',
      'Maiores gastos por categoria:',
      ...byCategory(r.cur, idx, 'expense').slice(0, 8).map((s) => `• ${s.icon} ${s.name}: ${money(s.total)} (${pct(s.total / (r.expense || 1))})`),
      ...(r.highlights.length ? ['', `Comparado com ${periodLabel(p.preset, prev)}:`, ...r.highlights.map((h) => `• ${h}`)] : []),
    ]
    try { await shareText('Resumo financeiro', lines.join('\n')) }
    catch (e: any) { toast(e.message) }
  }

  const delta = (cur: number, before: number, goodWhenUp: boolean) => {
    if (!before) return null
    const d = (cur - before) / before
    const good = goodWhenUp ? d >= 0 : d <= 0
    return <span className={`delta ${good ? 'pos' : 'neg'}`}><Icon name={d >= 0 ? 'up' : 'down'} size={12} /> {pct(Math.abs(d))}</span>
  }

  return (
    <div className="screen">
      <header className="top"><h1>Relatórios</h1></header>
      <PeriodPicker value={p} onChange={(v) => { setP(v); setDrill(null) }} />

      {!r ? <div className="skeleton tall" /> : (
        <>
          <section className="kpis kpis-4">
            <div className="card kpi"><span className="muted small">Ganhos</span><strong className="pos">{money(r.income)}</strong>{delta(r.income, r.pIncome, true)}</div>
            <div className="card kpi"><span className="muted small">Gastos</span><strong className="neg">{money(r.expense)}</strong>{delta(r.expense, r.pExpense, false)}</div>
            <div className="card kpi"><span className="muted small">Saldo</span><strong className={r.income - r.expense < 0 ? 'neg' : ''}>{money(r.income - r.expense)}</strong>
              <span className="muted small">{r.income > 0 ? `${pct((r.income - r.expense) / r.income)} da renda` : ''}</span></div>
            <div className="card kpi"><span className="muted small">Gasto médio/dia</span><strong>{money(r.expense / r.days)}</strong>
              {r.pending > 0 && <span className="muted small">{money(r.pending)} pendente</span>}</div>
          </section>
          <p className="muted small center">Setas comparam com o período anterior ({periodLabel(p.preset, prev)}).</p>
          <div className="report-grid">

            <section className="card">
              <div className="card-title">
                <h3>{drill ? <button className="link" onClick={() => setDrill(null)}>← {drill.icon} {drill.name}</button> : 'Por categoria'}</h3>
              </div>
              {!drill && <Segmented value={kind} onChange={(k) => { setKind(k); setDrill(null) }} options={[
                { value: 'expense', label: 'Gastos' }, { value: 'income', label: 'Ganhos' },
              ]} />}
              {(drill ? r.sub! : r.slices).length ? (
                <>
                  <Donut data={drill ? r.sub! : r.slices} total={drill ? drill.total : kind === 'expense' ? r.expense : r.income} label={drill ? drill.name : kind === 'expense' ? 'Gastos' : 'Ganhos'} />
                  <SliceList
                    data={drill ? r.sub! : r.slices}
                    total={drill ? drill.total : kind === 'expense' ? r.expense : r.income}
                    onPick={drill ? undefined : (s) => s.id !== 'none' && idx.children(s.id, true).length > 0 && setDrill(s)}
                  />
                  {!drill && r.slices.some((s) => idx.children(s.id, true).length > 0) && (
                    <p className="muted small">Toque numa categoria para ver as subcategorias.</p>
                  )}
                </>
              ) : <p className="empty">Sem lançamentos neste período.</p>}
            </section>

            <section className="card">
              <div className="card-title"><h3>Comparado com {periodLabel(p.preset, prev).toLowerCase()}</h3></div>
              {r.highlights.length ? (
                <ul className="insights">{r.highlights.map((h) => (
                  <li key={h} className={/subiu|novo gasto/.test(h) ? 'up' : 'down'}>{h}</li>
                ))}</ul>
              ) : <p className="empty">Sem mudanças relevantes nos gastos.</p>}
              {r.changes.length > 0 && (
                <details className="rules-box">
                  <summary>Ver todas as variações ({r.changes.length})</summary>
                  {r.changes.map((c) => (
                    <div key={c.key} className="change-row">
                      <span>{c.icon} {c.label}</span>
                      <span className={c.delta > 0 ? 'neg' : 'pos'}>{c.delta > 0 ? '+' : ''}{money(c.delta)}{c.pct != null && ` (${c.delta > 0 ? '+' : ''}${Math.round(c.pct * 100)}%)`}</span>
                      <span className="muted small">{money(c.previous)} → {money(c.current)}</span>
                    </div>
                  ))}
                </details>
              )}
            </section>

            {r.natures.length > 0 && (
              <section className="card">
                <div className="card-title"><h3>Essencial × supérfluo</h3></div>
                <div className="stack-bar">
                  {r.natures.map((n) => <span key={n.id} style={{ width: `${(n.total / r.expense) * 100}%`, background: n.color }} title={n.name} />)}
                </div>
                <SliceList data={r.natures} total={r.expense} />
              </section>
            )}

            <section className="card">
              <div className="card-title"><h3>Evolução</h3></div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={r.series} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={56}
                      tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v))} />
                    <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: 'var(--line)', opacity: 0.4 }}
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Ganhos" fill="var(--good)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="Gastos" fill="var(--bad)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="card">
              <div className="card-title"><h3>Últimos 6 meses</h3></div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={r.sixSeries} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={56}
                      tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v))} />
                    <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: 'var(--line)', opacity: 0.4 }}
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Ganhos" fill="var(--good)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="Gastos" fill="var(--bad)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {r.byPm.size > 0 && (
              <section className="card">
                <div className="card-title"><h3>Gastos por forma de pagamento</h3></div>
                <ul className="kv">
                  {[...r.byPm.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => (
                    <li key={n}><span>{n}</span><span>{money(v)} <span className="muted small">({pct(v / (r.expense || 1))})</span></span></li>
                  ))}
                </ul>
              </section>
            )}

            {r.top.length > 0 && (
              <section className="card">
                <div className="card-title"><h3>Maiores gastos</h3></div>
                {r.top.map((t) => <TxRow key={t.id} t={t} showDate />)}
              </section>
            )}

            <section className="card">
              <div className="card-title"><h3>Exportar relatório</h3></div>
              <div className="btn-col">
                <button className="btn ghost" disabled={!!exporting} onClick={() => exportFile('pdf')}>
                  <Icon name="download" size={18} /> {exporting === 'pdf' ? 'Gerando PDF…' : 'Relatório em PDF'}
                </button>
                <button className="btn ghost" disabled={!!exporting} onClick={() => exportFile('xlsx')}>
                  <Icon name="download" size={18} /> {exporting === 'xlsx' ? 'Gerando planilha…' : 'Planilha Excel (.xlsx)'}
                </button>
                <button className="btn ghost" onClick={shareSummary}><Icon name="share" size={18} /> Compartilhar resumo (WhatsApp, e-mail…)</button>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
