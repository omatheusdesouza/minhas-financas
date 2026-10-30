import { App as CapApp } from '@capacitor/app'
import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Icon } from './components/Icon'
import { TermsGate } from './components/Legal'
import { PaySheet } from './components/PaySheet'
import { ShortcutsSheet, Sidebar } from './components/Sidebar'
import { TxEditor } from './components/TxEditor'
import { api } from './lib/api'
import { LEGAL_VERSION } from './lib/legal'
import { initNotifications, syncReminders } from './lib/notify'
import { shortcutFor } from './lib/shortcuts'
import type { User } from './lib/backend'
import { Auth } from './screens/Auth'
import { Bills } from './screens/Bills'
import { FamilyScreen } from './screens/Family'
import { GoalDetailScreen, GoalsScreen } from './screens/Goals'
import { Home } from './screens/Home'
import { Onboarding } from './screens/Onboarding'
import { Reports } from './screens/Reports'
import { ReserveDetailScreen, ReservesScreen } from './screens/Reserves'
import { CategoriesScreen, PaymentMethodsScreen, ProfileScreen, Settings } from './screens/Settings'
import { Transactions } from './screens/Transactions'
import { LockProvider } from './lockContext'
import { AppProvider, useApp } from './store'

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [recovering, setRecovering] = useState(false)
  // sem internet não dá para registrar o aceite: libera nesta sessão e pede de novo na próxima
  const [termsSkipped, setTermsSkipped] = useState(false)

  useEffect(() => {
    api.getUser().then(setUser).catch(() => setUser(null))
    return api.onAuthChange((u, event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setUser(u)
    })
  }, [])

  if (user === undefined) return <div className="splash"><div className="spinner" /></div>
  if (!user || recovering) return <Auth recovering={recovering} onRecoveryStart={() => setRecovering(true)} onRecovered={() => setRecovering(false)} />

  if (user.termsVersion !== LEGAL_VERSION && !termsSkipped) return <TermsGate user={user} onSkip={() => setTermsSkipped(true)} />

  return (
    <AppProvider user={user} onboarding={<Onboarding />}>
      <LockProvider>
        <HashRouter>
          <Shell />
        </HashRouter>
      </LockProvider>
    </AppProvider>
  )
}

function Shell() {
  const { editor, openEditor, closeEditor, payTarget, closePay, version, bump, canEdit } = useApp()
  const navigate = useNavigate()
  const [help, setHelp] = useState(false)

  // Lembretes: abrir a tela certa ao tocar na notificação
  useEffect(() => {
    initNotifications((route) => navigate(route)).catch(() => {})
  }, [navigate])

  // Recalcula a agenda depois de qualquer mudança (pagar, editar, excluir...)
  useEffect(() => {
    const t = setTimeout(() => { syncReminders().catch(() => {}) }, 1200)
    return () => clearTimeout(t)
  }, [version])

  // Ao voltar para o app: atualiza os dados (e, com eles, a agenda)
  useEffect(() => {
    const h = CapApp.addListener('resume', () => {
      bump()
      api.sync?.().catch(() => {})
    })
    return () => { h.then((x) => x.remove()).catch(() => {}) }
  }, [bump])

  // Atalhos de teclado (computador)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const action = shortcutFor({
        key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
        targetTag: el?.tagName, targetEditable: el?.isContentEditable,
        dialogOpen: !!document.querySelector('.sheet-backdrop'),
      })
      if (!action) return
      e.preventDefault()
      if (action.type === 'new') { if (canEdit) openEditor() }
      else if (action.type === 'help') setHelp(true)
      else if (action.type === 'go') navigate(action.to)
      else {
        navigate('/lancamentos')
        setTimeout(() => document.querySelector<HTMLInputElement>('.search input')?.focus(), 50)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navigate, openEditor, canEdit])

  return (
    <div className="app">
      <Sidebar onHelp={() => setHelp(true)} />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lancamentos" element={<Transactions />} />
          <Route path="/contas" element={<Bills />} />
          <Route path="/relatorios" element={<Reports />} />
          <Route path="/ajustes" element={<Settings />} />
          <Route path="/ajustes/categorias" element={<CategoriesScreen />} />
          <Route path="/ajustes/pagamentos" element={<PaymentMethodsScreen />} />
          <Route path="/ajustes/perfil" element={<ProfileScreen />} />
          <Route path="/ajustes/familia" element={<FamilyScreen />} />
          <Route path="/metas" element={<GoalsScreen />} />
          <Route path="/metas/:id" element={<GoalDetailScreen />} />
          <Route path="/reservas" element={<ReservesScreen />} />
          <Route path="/reservas/:id" element={<ReserveDetailScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="tabbar" aria-label="Navegação principal">
        <NavLink to="/" end><Icon name="home" /><span>Início</span></NavLink>
        <NavLink to="/lancamentos"><Icon name="list" /><span>Lançamentos</span></NavLink>
        {canEdit
          ? <button className="fab" onClick={() => openEditor()} aria-label="Novo lançamento"><Icon name="plus" size={28} /></button>
          : <span className="fab-off" aria-hidden="true" />}
        <NavLink to="/contas"><Icon name="bills" /><span>Contas</span></NavLink>
        <NavLink to="/relatorios"><Icon name="chart" /><span>Relatórios</span></NavLink>
      </nav>

      {help && <ShortcutsSheet onClose={() => setHelp(false)} />}
      {payTarget && <PaySheet key={payTarget.id} tx={payTarget} onClose={closePay} />}
      {editor && <TxEditor key={editor.tx?.id ?? 'new'} initial={editor.tx} initialMode={editor.mode} onClose={closeEditor} />}
    </div>
  )
}
