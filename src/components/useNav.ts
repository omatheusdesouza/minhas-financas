import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { activeNav, menuLayout, tabLayout, type NavInfo } from '../lib/prefs'
import { navShortcuts } from '../lib/shortcuts'
import { useApp } from '../store'

/** Navegação personalizada: itens do menu lateral (com atalhos 1–9), da barra de baixo e qual está aberto. */
export function useNav(extra: NavInfo[] = []) {
  const { prefs } = useApp()
  const { pathname, search } = useLocation()
  return useMemo(() => {
    const menu = [...menuLayout(prefs).filter((n) => n.visible), ...extra]
    const tabs = tabLayout(prefs)
    const shortcuts = navShortcuts(menu)
    return {
      menu: menu.map((n) => ({ ...n, key: shortcuts.find((s) => s.to === n.to)?.key ?? null })),
      tabs,
      shortcuts,
      activeMenu: activeNav(pathname, search, menu),
      activeTab: activeNav(pathname, search, tabs),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, pathname, search, extra.length])
}
