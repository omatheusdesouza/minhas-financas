import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { money, pct } from '../lib/format'
import type { Slice } from '../lib/services'

export function Donut({ data, total, label }: { data: Slice[]; total: number; label: string }) {
  if (!data.length) return null
  return (
    <div className="donut">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="total" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false}>
            {data.map((s) => <Cell key={s.id} fill={s.color} />)}
          </Pie>
          <Tooltip
            formatter={(v: number, n: string) => [`${money(v)} (${pct(v / total)})`, n]}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <span className="muted small">{label}</span>
        <strong>{money(total)}</strong>
      </div>
    </div>
  )
}

export function SliceList({ data, total, budgets, onPick }: {
  data: Slice[]
  total: number
  budgets?: Map<string, number>
  onPick?: (s: Slice) => void
}) {
  return (
    <ul className="slices">
      {data.map((s) => {
        const budget = budgets?.get(s.id)
        const ratio = budget ? s.total / budget : s.total / (total || 1)
        return (
          <li key={s.id}>
            <button className="slice" onClick={() => onPick?.(s)} disabled={!onPick}>
              <span className="slice-icon" style={{ background: `${s.color}22` }}>{s.icon}</span>
              <span className="slice-body">
                <span className="slice-top">
                  <span className="slice-name">{s.name}</span>
                  <span className="slice-val">{money(s.total)}</span>
                </span>
                <span className="bar"><span style={{ width: `${Math.min(100, ratio * 100)}%`, background: budget && ratio > 1 ? 'var(--bad)' : s.color }} /></span>
                <span className="slice-sub muted small">
                  {pct(s.total / (total || 1))} do total
                  {budget != null && (
                    <span className={ratio > 1 ? 'bad-text' : ratio > 0.8 ? 'warn-text' : ''}>
                      {' · '}limite {money(budget)} {ratio > 1 ? `(estourou ${money(s.total - budget)})` : `(resta ${money(budget - s.total)})`}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function ScoreRing({ score, color, size = 96 }: { score: number; color: string; size?: number }) {
  const r = 42
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="ring" role="img" aria-label={`Índice ${score} de 100`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
      <circle
        cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 50 50)"
      />
      <text x="50" y="56" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--text)">{score}</text>
    </svg>
  )
}
