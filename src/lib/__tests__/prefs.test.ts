import { describe, expect, it } from 'vitest'
import { activeNav, fullOrder, homeLayout, menuLayout, move, newest, tabLayout, WIDGETS } from '../prefs'

describe('personalização', () => {
  it('ordem salva: ignora ids velhos, sem repetir, e encaixa itens novos depois do vizinho padrão', () => {
    expect(fullOrder(['c', 'a', 'x', 'a'] as string[], ['a', 'c'])).toEqual(['c', 'a'])
    expect(fullOrder(undefined, ['a', 'b'])).toEqual(['a', 'b'])
    // o Caixa (novo) entra logo depois do Saldo, mesmo com a ordem personalizada
    expect(fullOrder(['fixos', 'saldo', 'gastos'], ['saldo', 'caixa', 'fixos', 'gastos'])).toEqual(['fixos', 'saldo', 'caixa', 'gastos'])
    expect(fullOrder(['b'], ['new', 'b'])).toEqual(['new', 'b'])
  })

  it('Início: padrão mostra tudo; ordem e blocos escondidos', () => {
    expect(homeLayout(undefined).map((w) => w.id)).toEqual(WIDGETS.map((w) => w.id))
    expect(homeLayout(undefined).every((w) => w.visible)).toBe(true)
    const l = homeLayout({ home: { order: ['gastos', 'saldo', 'fixos', 'limites', 'meta', 'reservas', 'destaques', 'contas', 'saude', 'ultimos'], hidden: ['saude'] } })
    expect(l.slice(0, 3).map((w) => w.id)).toEqual(['gastos', 'saldo', 'caixa'])
    expect(l.find((w) => w.id === 'saude')!.visible).toBe(false)
    expect(l.map((w) => w.position)).toEqual(l.map((_, i) => i))
  })

  it('barra de baixo: Início fixo + 3 escolhidos, sem repetir e completando com o padrão', () => {
    expect(tabLayout(undefined).map((n) => n.id)).toEqual(['inicio', 'lancamentos', 'contas', 'relatorios'])
    expect(tabLayout({ tabs: ['reservas', 'metas', 'cartoes'] }).map((n) => n.id)).toEqual(['inicio', 'reservas', 'metas', 'cartoes'])
    expect(tabLayout({ tabs: ['inicio', 'metas', 'metas'] }).map((n) => n.id)).toEqual(['inicio', 'metas', 'lancamentos', 'contas'])
  })

  it('menu lateral: extras escondidos por padrão; Início e Ajustes sempre visíveis', () => {
    const def = menuLayout(undefined)
    expect(def.filter((n) => n.visible).map((n) => n.id)).toEqual(['inicio', 'lancamentos', 'contas', 'relatorios', 'metas', 'reservas', 'caixa', 'ajustes'])
    const l = menuLayout({ menu: { order: ['ajustes', 'inicio'], hidden: ['inicio', 'ajustes', 'metas'] } })
    expect(l[0].id).toBe('ajustes')
    expect(l.find((n) => n.id === 'inicio')!.visible).toBe(true)
    expect(l.find((n) => n.id === 'metas')!.visible).toBe(false)
    expect(l.find((n) => n.id === 'cartoes')!.visible).toBe(true) // com menu salvo, só esconde o que foi escondido
  })

  it('mover e escolher a versão mais recente', () => {
    expect(move(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(move(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c'])
    expect(newest({ tabs: ['metas'], updatedAt: '2026-11-01T10:00:00Z' }, { tabs: ['contas'], updatedAt: '2026-11-01T09:00:00Z' }).tabs).toEqual(['metas'])
    expect(newest(null, { tabs: ['contas'] }).tabs).toEqual(['contas'])
    expect(newest(undefined, undefined)).toEqual({})
  })
})

describe('item aberto na navegação', () => {
  const items = [{ id: 'inicio', to: '/' }, { id: 'contas', to: '/contas' }, { id: 'cartoes', to: '/contas?tab=cartoes' }, { id: 'lanc', to: '/lancamentos' }, { id: 'imp', to: '/lancamentos/importar' }]
  it('o mais específico vence', () => {
    expect(activeNav('/', '', items)).toBe('inicio')
    expect(activeNav('/contas', '', items)).toBe('contas')
    expect(activeNav('/contas', '?tab=cartoes', items)).toBe('cartoes')
    expect(activeNav('/lancamentos/importar', '', items)).toBe('imp')
    expect(activeNav('/lancamentos', '?cat=x', items)).toBe('lanc')
    expect(activeNav('/metas/1', '', items)).toBeNull()
    expect(activeNav('/lancamentos/importar', '', items.filter((i) => i.id !== 'imp'))).toBe('lanc')
  })
})
