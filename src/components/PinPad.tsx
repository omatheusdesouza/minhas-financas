import { useEffect } from 'react'
import { Icon } from './Icon'

/** Teclado numérico com bolinhas do PIN. Também aceita o teclado físico. */
export function PinPad({ value, length, onChange, onComplete, disabled, extra, error }: {
  value: string
  length: number
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  disabled?: boolean
  /** botão do canto inferior esquerdo (ex.: biometria) */
  extra?: React.ReactNode
  error?: boolean
}) {
  const press = (d: string) => {
    if (disabled || value.length >= length) return
    const v = value + d
    onChange(v)
    if (v.length === length) onComplete?.(v)
  }
  const back = () => !disabled && onChange(value.slice(0, -1))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className={`pinpad ${disabled ? 'disabled' : ''}`}>
      <div className={`pin-dots ${error ? 'shake' : ''}`} aria-label={`${value.length} de ${length} números digitados`}>
        {Array.from({ length }, (_, i) => <span key={i} className={i < value.length ? 'on' : ''} />)}
      </div>
      <div className="pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} disabled={disabled}>{d}</button>
        ))}
        <div className="pin-extra">{extra}</div>
        <button type="button" onClick={() => press('0')} disabled={disabled}>0</button>
        <button type="button" className="pin-back" aria-label="Apagar" onClick={back} disabled={disabled || !value}>
          <Icon name="left" size={24} />
        </button>
      </div>
    </div>
  )
}
