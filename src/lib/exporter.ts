import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/** Salva/compartilha um arquivo: no celular abre o menu de compartilhar; no navegador baixa. */
export async function saveFile(filename: string, content: string, mime: string) {
  if (Capacitor.isNativePlatform()) {
    const res = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: filename, files: [res.uri] })
    return
  }
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function shareText(title: string, text: string) {
  if (Capacitor.isNativePlatform() || navigator.share) {
    try {
      await (Capacitor.isNativePlatform() ? Share.share({ title, text }) : navigator.share({ title, text }))
      return
    } catch (e: any) {
      if (e?.name === 'AbortError' || /cancel/i.test(String(e?.message))) return
    }
  }
  await navigator.clipboard.writeText(text)
  throw new Error('Resumo copiado para a área de transferência.')
}

export function csv(rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    if (v == null) return ''
    const s = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // Ponto e vírgula + BOM: abre direto no Excel em português
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n')
}
