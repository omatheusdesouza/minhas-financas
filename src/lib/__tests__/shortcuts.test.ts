import { describe, expect, it } from 'vitest'
import { shortcutFor } from '../shortcuts'

describe('atalhos de teclado', () => {
  it('mapeia as teclas para as ações', () => {
    expect(shortcutFor({ key: 'n' })).toEqual({ type: 'new' })
    expect(shortcutFor({ key: 'N' })).toEqual({ type: 'new' })
    expect(shortcutFor({ key: '/' })).toEqual({ type: 'search' })
    expect(shortcutFor({ key: '?' })).toEqual({ type: 'help' })
    expect(shortcutFor({ key: '3' })).toEqual({ type: 'go', to: '/contas' })
    expect(shortcutFor({ key: 'x' })).toBeNull()
  })

  it('não atrapalha a digitação nem outros atalhos do navegador', () => {
    expect(shortcutFor({ key: 'n', targetTag: 'INPUT' })).toBeNull()
    expect(shortcutFor({ key: '1', targetTag: 'TEXTAREA' })).toBeNull()
    expect(shortcutFor({ key: '2', targetTag: 'SELECT' })).toBeNull()
    expect(shortcutFor({ key: 'n', targetEditable: true })).toBeNull()
    expect(shortcutFor({ key: 'n', ctrlKey: true })).toBeNull()
    expect(shortcutFor({ key: '1', metaKey: true })).toBeNull()
    expect(shortcutFor({ key: 'n', dialogOpen: true })).toBeNull()
  })
})
