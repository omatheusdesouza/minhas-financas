import { useApp } from '../store'

/** Foto de perfil em círculo; sem foto, mostra o emoji ou a inicial do nome. */
export function Avatar({ size = 44, url, emoji, name }: { size?: number; url?: string | null; emoji?: string | null; name?: string }) {
  const style = { width: size, height: size, fontSize: size * 0.5 }
  if (url) return <img className="avatar-img" src={url} alt="" style={style} />
  return (
    <span className="avatar-fallback" style={style} aria-hidden="true">
      {emoji || (name?.trim()[0]?.toUpperCase() ?? '•')}
    </span>
  )
}

export function MyAvatar({ size }: { size?: number }) {
  const { profile, avatarUrl } = useApp()
  return <Avatar size={size} url={avatarUrl} emoji={profile?.avatar_emoji} name={profile?.display_name} />
}
