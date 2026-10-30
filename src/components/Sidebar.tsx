import { Link, NavLink } from 'react-router-dom'
import { NAV_ITEMS, SHORTCUT_HELP } from '../lib/shortcuts'
import { useApp } from '../store'
import { MyAvatar } from './Avatar'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { SpaceSwitcher } from './SpaceSwitcher'

/** Menu lateral da versão para computador (no celular fica escondido e vale a barra de baixo). */
export function Sidebar({ onHelp }: { onHelp: () => void }) {
  const { profile, sync, openEditor, canEdit } = useApp()
  const syncText = !sync ? null
    : sync.state === 'offline' ? 'Sem internet'
      : sync.state === 'syncing' ? 'Sincronizando…'
        : sync.pending ? `${sync.pending} alteração(ões) aguardando`
          : 'Tudo sincronizado'
  const syncTone = !sync ? '' : sync.state === 'offline' ? 'off' : sync.pending || sync.state === 'syncing' ? 'wait' : 'ok'

  return (
    <aside className="sidebar" aria-label="Menu">
      <Link to="/" className="side-brand" aria-label="Fynvault · Início">
        <img className="logo-light" src="./brand/logo-horizontal.svg" alt="" />
        <img className="logo-dark" src="./brand/logo-horizontal-dark.svg" alt="" />
      </Link>

      {canEdit && (
        <button className="side-new" onClick={() => openEditor()} title="Novo lançamento (N)">
          <Icon name="plus" size={20} /> Novo lançamento <kbd>N</kbd>
        </button>
      )}

      <nav className="side-nav" aria-label="Navegação principal">
        {NAV_ITEMS.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} title={`${n.label} (${n.key})`}>
            <Icon name={n.icon} /> <span className="grow">{n.label}</span> <kbd>{n.key}</kbd>
          </NavLink>
        ))}
      </nav>

      <div className="side-foot">
        <SpaceSwitcher />
        <Link to="/ajustes/perfil" className="side-profile" title="Meu perfil">
          <MyAvatar size={40} />
          <span className="grow">
            <b>{profile?.display_name}</b>
            {syncText && <span className="muted small"><span className={`sync-dot inline ${syncTone}`} /> {syncText}</span>}
          </span>
        </Link>
        <button className="side-help" onClick={onHelp}><kbd>?</kbd> Atalhos de teclado</button>
      </div>
    </aside>
  )
}

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Atalhos de teclado" onClose={onClose}>
      <ul className="kv shortcuts">
        {SHORTCUT_HELP.map(([k, label]) => <li key={k}><span>{label}</span><kbd>{k}</kbd></li>)}
      </ul>
    </Sheet>
  )
}

