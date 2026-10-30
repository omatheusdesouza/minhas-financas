import { App as CapApp } from '@capacitor/app'
import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Icon } from './components/Icon'
import { PaySheet } from './components/PaySheet'
import { TxEditor } from './components/TxEditor'
import { api } from './lib/api'
import { initNotifications, syncReminders } from './lib/notify'
import type { User } from './lib/backend'
import { Auth } from './screens/Auth'
import { Bills } from './screens/Bills'
import { FamilyScreen } from './screens/Family'
import { GoalDetailScreen, GoalsScreen } from './screens/Goals'
import { Home } from './screens/Home'
import { Onboarding } from './screens/Onboarding'
import { Reports } from './screens/Reports'
import { CategoriesScreen, PaymentMethodsScreen, ProfileScreen, Settings } from './screens/Settings'
import { Transactions } from './screens/Transactions'
import { LockProvider } from './lockContext'
import { AppProvider, useApp } from './store'

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    api.getUser().then(setUser).catch(() => setUser(null))
    return api.onAuthChange((u, event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setUser(u)
    })
  }, [])

  if (user === undefined) return <div className="splash"><div className="spinner" /></div>
  if (!user || recovering) return <Auth recovering={recovering} onRecoveryStart={() => setRecovering(true)} onRecovered={() => setRecovering(false)} />

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

  return (
    <div className="app">
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

      {payTarget && <PaySheet key={payTarget.id} tx={payTarget} onClose={closePay} />}
      {editor && <TxEditor key={editor.tx?.id ?? 'new'} initial={editor.tx} initialMode={editor.mode} onClose={closeEditor} />}
    </div>
  )
}
