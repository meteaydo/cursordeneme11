const R2_WORKER_URL = import.meta.env.VITE_R2_WORKER_URL as string

/**
 * Worker'ın /upload endpoint'ini kullanarak dosyayı R2'ye yükler.
 * Presigned URL yerine server-side upload yapıldığı için CORS sorunu olmaz.
 */
export async function uploadToR2(file: Blob, key: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('key', key)

  const res = await fetch(`${R2_WORKER_URL}/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Dosya yüklenemedi: ${err}`)
  }

  const { publicUrl } = (await res.json()) as { publicUrl: string }
  return publicUrl
}

export async function deleteFromR2(key: string): Promise<void> {
  await fetch(`${R2_WORKER_URL}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  })
}
