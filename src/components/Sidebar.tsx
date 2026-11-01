import { Link } from 'react-router-dom'
import type { NavInfo } from '../lib/prefs'
import { shortcutHelp, type NavShortcut } from '../lib/shortcuts'
import { useApp } from '../store'
import { MyAvatar } from './Avatar'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { SpaceSwitcher } from './SpaceSwitcher'
import { useIsAdmin } from './useIsAdmin'
import { useNav } from './useNav'

const ADMIN: NavInfo[] = [{ id: 'gestor' as NavInfo['id'], to: '/gestor', label: 'Gestor', short: 'Gestor', icon: 'user' }]

/** Menu lateral da versão para computador (no celular fica escondido e vale a barra de baixo). */
export function Sidebar({ onHelp }: { onHelp: () => void }) {
  const { profile, sync, openEditor, canEdit } = useApp()
  const admin = useIsAdmin()
  const { menu, activeMenu } = useNav(admin ? ADMIN : [])
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
        {menu.map((n) => (
          <Link key={n.id} to={n.to} className={activeMenu === n.id ? 'active' : ''} aria-current={activeMenu === n.id ? 'page' : undefined}
            title={n.key ? `${n.label} (${n.key})` : n.label}>
            <Icon name={n.icon} /> <span className="grow">{n.label}</span> {n.key && <kbd>{n.key}</kbd>}
          </Link>
        ))}
        <Link to="/ajustes/personalizar?aba=navegacao" className="side-customize" title="Escolher e ordenar os itens do menu"><Icon name="edit" size={16} /> Personalizar menu</Link>
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

export function ShortcutsSheet({ onClose, items }: { onClose: () => void; items: NavShortcut[] }) {
  return (
    <Sheet title="Atalhos de teclado" onClose={onClose}>
      <ul className="kv shortcuts">
        {shortcutHelp(items).map(([k, label]) => <li key={k}><span>{label}</span><kbd>{k}</kbd></li>)}
      </ul>
    </Sheet>
  )
}

