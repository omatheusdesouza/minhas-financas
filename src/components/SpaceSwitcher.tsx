import { useState } from 'react'
import { useApp } from '../store'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

/** Troca entre as próprias finanças e as compartilhadas (modo família). */
export function SpaceSwitcher() {
  const { spaces, space, setSpace } = useApp()
  const [open, setOpen] = useState(false)
  if (spaces.length < 2) return null
  return (
    <>
      <button className={`space-chip ${space.role ? 'shared' : ''}`} onClick={() => setOpen(true)}>
        <span>{space.role ? `Finanças de ${space.name}` : 'Minhas finanças'}</span>
        {space.role === 'viewer' && <span className="chip">só visualizar</span>}
        <Icon name="down" size={14} />
      </button>
      {open && (
        <Sheet title="Qual espaço abrir?" onClose={() => setOpen(false)}>
          <div className="space-list">
            {spaces.map((s) => (
              <button key={s.ownerId} className={`space-item ${s.ownerId === space.ownerId ? 'on' : ''}`}
                onClick={() => { setSpace(s.ownerId); setOpen(false) }}>
                <Avatar size={40} emoji={s.avatarEmoji ?? (s.role ? null : '🏠')} name={s.name} />
                <span className="grow">
                  <b>{s.role ? `Finanças de ${s.name}` : 'Minhas finanças'}</b>
                  <span className="muted small">{s.role === 'editor' ? 'Você pode editar' : s.role === 'viewer' ? 'Você só visualiza' : 'Suas contas pessoais'}</span>
                </span>
                {s.ownerId === space.ownerId && <Icon name="check" />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}
