import { describe, expect, it } from 'vitest'
import { cspReport, isFramed, passwordProblem } from '../security'

describe('segurança', () => {
  it('senha: 8+ caracteres, letras e números', () => {
    expect(passwordProblem('abc123')).toMatch(/8 caracteres/)
    expect(passwordProblem('abcdefgh')).toMatch(/letras e números/)
    expect(passwordProblem('12345678')).toMatch(/letras e números/)
    expect(passwordProblem('aaaaaaa1')).toMatch(/fácil/)
    expect(passwordProblem('minhaSenha2026')).toBeNull()
    expect(passwordProblem('ção12345')).toBeNull()
    expect(passwordProblem('a1'.repeat(40))).toMatch(/72/)
  })

  it('detecta o site aberto dentro de outra página', () => {
    const w = {}
    expect(isFramed({ top: w, self: w })).toBe(false)
    expect(isFramed({ top: {}, self: w })).toBe(true)
    expect(isFramed({ get top(): unknown { throw new Error('cross-origin') }, self: w })).toBe(true)
  })

  it('bloqueios da política: ignora extensões e repetições', () => {
    const seen = new Set<string>()
    const v = { blockedURI: 'https://evil.example/x.js?a=1', violatedDirective: 'script-src-elem' }
    expect(cspReport(v, seen)).toBe('script-src-elem bloqueou https://evil.example')
    expect(cspReport(v, seen)).toBeNull()
    expect(cspReport({ blockedURI: 'chrome-extension://abc/x.js', violatedDirective: 'script-src' }, seen)).toBeNull()
    expect(cspReport({ blockedURI: 'inline', violatedDirective: 'script-src-elem' }, seen)).toBe('script-src-elem bloqueou inline')
  })
})
