import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { money, pct } from '../lib/format'
import type { Slice } from '../lib/services'

export default function Donut({ data, total, label }: { data: Slice[]; total: number; label: string }) {
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
