import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/** Salva/compartilha um arquivo: no celular abre o menu de compartilhar; no navegador baixa. */
export async function saveFile(filename: string, content: string | Blob, mime: string) {
  if (Capacitor.isNativePlatform()) {
    const res = typeof content === 'string'
      ? await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 })
      : await Filesystem.writeFile({ path: filename, data: await blobToBase64(content), directory: Directory.Cache })
    await Share.share({ title: filename, files: [res.uri] })
    return
  }
  const blob = typeof content === 'string' ? new Blob([content], { type: `${mime};charset=utf-8` }) : content
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1] ?? '')
    r.onerror = () => fail(new Error('Não foi possível preparar o arquivo.'))
    r.readAsDataURL(blob)
  })
}
