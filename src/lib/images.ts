/** Reduz uma foto antes de enviar (economiza dados e espaço). PDFs passam direto. */
export async function prepareUpload(file: File, maxSide: number, quality = 0.85): Promise<Blob> {
  if (file.type === 'application/pdf') return file
  if (!file.type.startsWith('image/')) throw new Error('Escolha uma foto (JPG ou PNG) ou um PDF.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => fail(new Error('Não foi possível abrir a imagem.'))
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((ok, fail) =>
      canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Falha ao processar a imagem.'))), 'image/jpeg', quality),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
