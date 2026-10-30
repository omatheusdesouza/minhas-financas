import { presetPeriod, periodLabel, shiftPeriod, today, type Period, type PeriodPreset } from '../lib/dates'
import { Icon } from './Icon'

export interface PeriodState {
  preset: PeriodPreset
  period: Period
}

export const initialPeriod = (preset: Exclude<PeriodPreset, 'personalizado'> = 'mes'): PeriodState => ({
  preset, period: presetPeriod(preset, today()),
})

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'semana', label: 'Semana' },
  { value: 'quinzena', label: 'Quinzena' },
  { value: 'mes', label: 'Mês' },
  { value: 'ano', label: 'Ano' },
  { value: 'personalizado', label: 'Escolher' },
]

export function PeriodPicker({ value, onChange, presets = true }: {
  value: PeriodState
  onChange: (v: PeriodState) => void
  presets?: boolean
}) {
  const { preset, period } = value
  return (
    <div className="period">
      {presets && (
        <div className="chips-scroll">
          {PRESETS.map((p) => (
            <button
              key={p.value} className={`chip-btn ${preset === p.value ? 'on' : ''}`}
              onClick={() =>
                onChange(p.value === 'personalizado'
                  ? { preset: 'personalizado', period }
                  : { preset: p.value, period: presetPeriod(p.value, period.from <= today() && today() <= period.to ? today() : period.from) })
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {preset === 'personalizado' ? (
        <div className="row2 custom-range">
          <label className="field"><span className="field-label">De</span>
            <input type="date" value={period.from} max={period.to}
              onChange={(e) => e.target.value && onChange({ preset, period: { ...period, from: e.target.value } })} />
          </label>
          <label className="field"><span className="field-label">Até</span>
            <input type="date" value={period.to} min={period.from}
              onChange={(e) => e.target.value && onChange({ preset, period: { ...period, to: e.target.value } })} />
          </label>
        </div>
      ) : (
        <div className="period-nav">
          <button className="icon-btn" aria-label="Período anterior" onClick={() => onChange({ preset, period: shiftPeriod(preset, period, -1) })}>
            <Icon name="left" />
          </button>
          <button className="period-label" onClick={() => onChange({ preset, period: presetPeriod(preset, today()) })} title="Voltar para hoje">
            {periodLabel(preset, period)}
          </button>
          <button className="icon-btn" aria-label="Próximo período" onClick={() => onChange({ preset, period: shiftPeriod(preset, period, 1) })}>
            <Icon name="right" />
          </button>
        </div>
      )}
    </div>
  )
}
