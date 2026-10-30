import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Icon } from './components/Icon'
import { TxEditor } from './components/TxEditor'
import { api } from './lib/api'
import type { User } from './lib/backend'
import { Auth } from './screens/Auth'
import { Bills } from './screens/Bills'
import { Home } from './screens/Home'
import { Reports } from './screens/Reports'
import { CategoriesScreen, PaymentMethodsScreen, Settings } from './screens/Settings'
import { Transactions } from './screens/Transactions'
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
    <AppProvider user={user}>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AppProvider>
  )
}

function Shell() {
  const { editor, openEditor, closeEditor } = useApp()
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="tabbar" aria-label="Navegação principal">
        <NavLink to="/" end><Icon name="home" /><span>Início</span></NavLink>
        <NavLink to="/lancamentos"><Icon name="list" /><span>Lançamentos</span></NavLink>
        <button className="fab" onClick={() => openEditor()} aria-label="Novo lançamento"><Icon name="plus" size={28} /></button>
        <NavLink to="/contas"><Icon name="bills" /><span>Contas</span></NavLink>
        <NavLink to="/relatorios"><Icon name="chart" /><span>Relatórios</span></NavLink>
      </nav>

      {editor && <TxEditor key={editor.tx?.id ?? 'new'} initial={editor.tx} initialMode={editor.mode} onClose={closeEditor} />}
    </div>
  )
}
