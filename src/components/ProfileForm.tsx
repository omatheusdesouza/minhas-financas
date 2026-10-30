import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { prepareUpload } from '../lib/images'
import type { Profile } from '../lib/types'
import { useApp } from '../store'
import { Avatar } from './Avatar'
import { Field } from './Fields'

const EMOJIS = ['😀', '😎', '🤓', '🧑‍💼', '👩‍💼', '👨‍💼', '🦁', '🐯', '🦊', '🐼', '🦉', '🌻', '⭐', '💎', '👑', '🚀']

export interface ProfileDraft {
  display_name: string
  avatar_emoji: string | null
  avatar_path: string | null
  /** link para pré-visualizar a foto escolhida */
  preview: string | null
}

export const draftFrom = (p: Profile | null, url: string | null): ProfileDraft => ({
  display_name: p?.display_name ?? '',
  avatar_emoji: p?.avatar_emoji ?? null,
  avatar_path: p?.avatar_path ?? null,
  preview: url,
})

export const nameError = (n: string) =>
  !n.trim() ? 'Informe seu nome ou apelido.' : n.trim().length > 40 ? 'Use no máximo 40 letras.' : null

/** Grava o perfil e apaga a foto antiga do armazenamento se ela foi trocada. */
export async function saveProfileDraft(d: ProfileDraft, previous: Profile | null, extra: Partial<Profile> = {}) {
  const saved = await api.saveProfile({
    display_name: d.display_name.trim(),
    avatar_emoji: d.avatar_path ? null : d.avatar_emoji,
    avatar_path: d.avatar_path,
    reminder_time: previous?.reminder_time ?? '09:00',
    onboarding_completed_at: previous?.onboarding_completed_at ?? null,
    ...extra,
  })
  if (previous?.avatar_path && previous.avatar_path !== d.avatar_path) {
    await api.removeFile('avatars', previous.avatar_path).catch(() => {})
  }
  return saved
}

export function ProfileForm({ value, onChange, showErrors }: {
  value: ProfileDraft
  onChange: (d: ProfileDraft) => void
  showErrors?: boolean
}) {
  const { run } = useApp()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const err = nameError(value.display_name)

  async function pickPhoto(f: File) {
    setUploading(true)
    const path = await run(async () => api.uploadFile('avatars', 'avatar', await prepareUpload(f, 512, 0.85)))
    if (path) onChange({ ...value, avatar_path: path, avatar_emoji: null, preview: await api.fileUrl('avatars', path) })
    setUploading(false)
  }

  return (
    <div className="profile-form">
      <div className="profile-avatar">
        <Avatar size={96} url={value.preview} emoji={value.avatar_emoji} name={value.display_name} />
        <div className="btn-row center-row">
          <button type="button" className="btn ghost" disabled={uploading} onClick={() => input.current?.click()}>
            {uploading ? 'Enviando…' : value.avatar_path ? 'Trocar foto' : 'Usar uma foto'}
          </button>
          {value.avatar_path && (
            <button type="button" className="btn ghost" onClick={() => onChange({ ...value, avatar_path: null, preview: null })}>Remover foto</button>
          )}
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) pickPhoto(f)
        }} />
      </div>

      <Field label="Ou escolha um emoji">
        <div className="icon-grid">
          {EMOJIS.map((em) => (
            <button key={em} type="button" className={!value.avatar_path && value.avatar_emoji === em ? 'on' : ''}
              onClick={() => onChange({ ...value, avatar_emoji: em, avatar_path: null, preview: null })}>{em}</button>
          ))}
        </div>
      </Field>

      <Field label="Nome ou apelido *">
        <input value={value.display_name} maxLength={40} autoComplete="nickname" placeholder="Como quer ser chamado?"
          onChange={(e) => onChange({ ...value, display_name: e.target.value })} />
      </Field>
      {showErrors && err && <p className="bad-text small">{err}</p>}
    </div>
  )
}
