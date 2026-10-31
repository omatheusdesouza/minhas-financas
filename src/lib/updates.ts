/**
 * Versão web: busca a versão nova do site, espera ela terminar de baixar e ficar ativa, e recarrega.
 * (Recarregar antes disso abriria de novo a cópia antiga guardada no aparelho.)
 */
export async function updateApp(): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
  if (reg) {
    await reg.update().catch(() => {})
    const sw = reg.installing ?? reg.waiting
    if (sw) {
      await new Promise<void>((done) => {
        const limit = setTimeout(done, 30000)
        const check = () => {
          if (sw.state === 'activated' || sw.state === 'redundant') { clearTimeout(limit); done() }
        }
        sw.addEventListener('statechange', check)
        check()
      })
    }
  }
  location.reload()
}
