import type { ReactNode } from 'react'
import { useApp } from '../store'
import type { Kind } from '../lib/types'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function MoneyInput({ value, onChange, autoFocus, big }: {
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
  big?: boolean
}) {
  return (
    <div className={`money-input ${big ? 'big' : ''}`}>
      <span>R$</span>
      <input
        inputMode="decimal" placeholder="0,00" value={value} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^\d,.]/g, ''))}
      />
    </div>
  )
}

/** Seleção de categoria agrupada por categoria principal. */
export function CategorySelect({ kind, value, onChange, allowEmpty = true, includeId }: {
  kind: Kind
  value: string | null
  onChange: (id: string | null) => void
  allowEmpty?: boolean
  includeId?: string | null
}) {
  const { idx } = useApp()
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowEmpty && <option value="">Sem categoria</option>}
      {idx.roots(kind).map((root) => {
        const kids = idx.children(root.id).filter((c) => !c.archived || c.id === includeId)
        return kids.length ? (
          <optgroup key={root.id} label={`${root.icon} ${root.name}`}>
            <option value={root.id}>{root.icon} {root.name} (geral)</option>
            {kids.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </optgroup>
        ) : (
          <option key={root.id} value={root.id}>{root.icon} {root.name}</option>
        )
      })}
    </select>
  )
}

export function PaymentSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { paymentMethods } = useApp()
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Não informado</option>
      {paymentMethods.filter((p) => !p.archived || p.id === value).map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string; className?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value} type="button" role="tab" aria-selected={value === o.value}
          className={`${value === o.value ? 'on' : ''} ${o.className ?? ''}`} onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      <span>{label}</span>
    </label>
  )
}
