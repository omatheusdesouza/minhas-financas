import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Donut, SliceList } from '../components/Charts'
import { Segmented } from '../components/Fields'
import { Icon } from '../components/Icon'
import { PeriodPicker, initialPeriod } from '../components/PeriodPicker'
import { TxRow } from '../components/TxRow'
import { api } from '../lib/api'
import { addDays, diffDays, fmt, periodLabel, previousPeriod } from '../lib/dates'
import { csv, saveFile, shareText } from '../lib/exporter'
import { money, pct } from '../lib/format'
import { byCategory, sumBy, type Slice } from '../lib/services'
import type { Kind, Transaction } from '../lib/types'
import { useApp, useLoad } from '../store'

const NATURE_LABEL = { essencial: 'Essenciais', superfluo: 'Supérfluos', investimento: 'Investimentos' } as const
const NATURE_COLOR = { essencial: '#0ea5e9', superfluo: '#ec4899', investimento: '#16a34a' } as const

export function Reports() {
  const { idx, paymentMethods, toast } = useApp()
  const [p, setP] = useState(initialPeriod('mes'))
  const [kind, setKind] = useState<Kind>('expense')
  const [drill, setDrill] = useState<Slice | null>(null)
  const prev = previousPeriod(p.preset, p.period)

  const { data } = useLoad(async () => {
    const [cur, before] = await Promise.all([
      api.listTransactions(p.period.from, p.period.to),
      api.listTransactions(prev.from, prev.to),
    ])
    return { cur, before }
  }, [p.period.from, p.period.to])

  const r = useMemo(() => {
    if (!data) return null
    const { cur, before } = data
    const income = sumBy(cur, 'income')
    const expense = sumBy(cur, 'expense')
    const pIncome = sumBy(before, 'income')
    const pExpense = sumBy(before, 'expense')
    const days = diffDays(p.period.from, p.period.to) + 1
    const slices = byCategory(cur, idx, kind)
    const sub = drill ? byCategory(cur, idx, kind, drill.id) : null

    const natures = (['essencial', 'superfluo', 'investimento'] as const).map((n) => ({
      id: n, name: NATURE_LABEL[n], icon: n === 'essencial' ? '🏠' : n === 'superfluo' ? '🍔' : '🐷', color: NATURE_COLOR[n],
      total: cur.filter((t) => t.kind === 'expense' && idx.nature(t.category_id) === n).reduce((s, t) => s + t.amount, 0),
    })).filter((x) => x.total > 0)

    const byPm = new Map<string, number>()
    for (const t of cur) if (t.kind === 'expense') {
      const name = paymentMethods.find((m) => m.id === t.payment_method_id)?.name ?? 'Não informado'
      byPm.set(name, (byPm.get(name) ?? 0) + t.amount)
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
      if (t.kind === 'income') b.Ganhos += t.amount
      else b.Gastos += t.amount
      buckets.set(key, b)
    }
    const series = [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v)

    const top = cur.filter((t) => t.kind === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5)
    const pending = cur.filter((t) => !t.paid && t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
    return { cur, income, expense, pIncome, pExpense, days, slices, sub, natures, byPm, series, top, pending }
  }, [data, idx, kind, drill, p.period, paymentMethods])

  const label = periodLabel(p.preset, p.period)

  function rowsFor(txs: Transaction[]) {
    return [
      ['Data', 'Tipo', 'Descrição', 'Categoria', 'Subcategoria', 'Forma de pagamento', 'Valor', 'Situação', 'Observações'],
      ...[...txs].reverse().map((t) => {
        const c = idx.get(t.category_id)
        const root = idx.root(t.category_id)
        return [
          fmt.day(t.date), t.kind === 'expense' ? 'Gasto' : 'Ganho', t.description,
          root?.name ?? 'Sem categoria', c && c.parent_id ? c.name : '',
          paymentMethods.find((m) => m.id === t.payment_method_id)?.name ?? '',
          t.kind === 'expense' ? -t.amount : t.amount, t.paid ? 'Pago' : 'Pendente', t.notes ?? '',
        ]
      }),
    ]
  }

  async function exportCsv() {
    if (!r) return
    try { await saveFile(`fynvault_${p.period.from}_a_${p.period.to}.csv`, csv(rowsFor(r.cur)), 'text/csv') }
    catch (e: any) { toast(e.message, 'error') }
  }

  async function exportHtml() {
    if (!r) return
    try { await saveFile(`fynvault_relatorio_${p.period.from}_a_${p.period.to}.html`, reportHtml(), 'text/html') }
    catch (e: any) { toast(e.message, 'error') }
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
    ]
    try { await shareText('Resumo financeiro', lines.join('\n')) }
    catch (e: any) { toast(e.message) }
  }

  function reportHtml() {
    if (!r) return ''
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
    const cats = byCategory(r.cur, idx, 'expense')
    const incs = byCategory(r.cur, idx, 'income')
    const table = (s: Slice[], total: number) => s.map((x) =>
      `<tr><td>${x.icon} ${esc(x.name)}</td><td class="n">${money(x.total)}</td><td class="n">${pct(x.total / (total || 1))}</td></tr>`).join('')
    const txs = rowsFor(r.cur).slice(1).map((row) =>
      `<tr>${row.map((v, i) => `<td${i === 6 ? ' class="n"' : ''}>${typeof v === 'number' ? money(v) : esc(String(v ?? ''))}</td>`).join('')}</tr>`).join('')
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório financeiro — ${esc(label)}</title><style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#0f172a}h1{margin:0 0 4px}h2{margin-top:28px;font-size:18px}
.k{display:flex;gap:12px;flex-wrap:wrap}.k div{border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;min-width:140px}.k b{display:block;font-size:20px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left}.n{text-align:right;white-space:nowrap}
.muted{color:#64748b}@media print{body{margin:0}}</style></head><body>
<h1>Relatório financeiro</h1><p class="muted">${esc(label)} · ${fmt.day(p.period.from)} a ${fmt.day(p.period.to)}</p>
<div class="k"><div>Ganhos<b>${money(r.income)}</b></div><div>Gastos<b>${money(r.expense)}</b></div><div>Saldo<b>${money(r.income - r.expense)}</b></div><div>Média de gasto/dia<b>${money(r.expense / r.days)}</b></div></div>
<h2>Gastos por categoria</h2><table><tr><th>Categoria</th><th class="n">Valor</th><th class="n">%</th></tr>${table(cats, r.expense)}</table>
<h2>Ganhos por categoria</h2><table><tr><th>Categoria</th><th class="n">Valor</th><th class="n">%</th></tr>${table(incs, r.income)}</table>
<h2>Lançamentos</h2><table><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Sub</th><th>Pagamento</th><th class="n">Valor</th><th>Situação</th><th>Obs.</th></tr>${txs}</table>
<p class="muted">Gerado em ${new Date().toLocaleString('pt-BR')} pelo app Fynvault. Para salvar em PDF, use Imprimir › Salvar como PDF.</p>
</body></html>`
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
          <section className="kpis">
            <div className="card kpi"><span className="muted small">Ganhos</span><strong className="pos">{money(r.income)}</strong>{delta(r.income, r.pIncome, true)}</div>
            <div className="card kpi"><span className="muted small">Gastos</span><strong className="neg">{money(r.expense)}</strong>{delta(r.expense, r.pExpense, false)}</div>
            <div className="card kpi"><span className="muted small">Saldo</span><strong className={r.income - r.expense < 0 ? 'neg' : ''}>{money(r.income - r.expense)}</strong>
              <span className="muted small">{r.income > 0 ? `${pct((r.income - r.expense) / r.income)} da renda` : ''}</span></div>
            <div className="card kpi"><span className="muted small">Gasto médio/dia</span><strong>{money(r.expense / r.days)}</strong>
              {r.pending > 0 && <span className="muted small">{money(r.pending)} pendente</span>}</div>
          </section>
          <p className="muted small center">Setas comparam com o período anterior ({periodLabel(p.preset, prev)}).</p>

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
              <button className="btn ghost" onClick={exportHtml}><Icon name="download" size={18} /> Relatório completo (abre e salva em PDF)</button>
              <button className="btn ghost" onClick={exportCsv}><Icon name="download" size={18} /> Planilha (CSV para Excel)</button>
              <button className="btn ghost" onClick={shareSummary}><Icon name="share" size={18} /> Compartilhar resumo (WhatsApp, e-mail…)</button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
