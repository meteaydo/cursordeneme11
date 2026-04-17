import { parseStudentExcel, type ParsedStudent } from '@/lib/excelStudentParser'

// Varsayılan public URL (env'den alınır)
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL || 'https://pub-r2.yourdomain.com'

let cachedClassList: string[] | null = null

/**
 * Cloudflare R2'den sınıf listesini (JSON) çeker.
 */
export async function fetchClassList(): Promise<string[]> {
  if (cachedClassList) return cachedClassList

  try {
    const res = await fetch(`${R2_PUBLIC_URL}/class-templates/classes.json`, { cache: 'no-store' })
    if (!res.ok) {
      if (res.status === 404) return [] // Dosya daha oluşturulmamış olabilir
      throw new Error('Sınıf listesi çekilemedi.')
    }
    const data = await res.json()
    if (Array.isArray(data)) {
      cachedClassList = data
      return data
    }
    return []
  } catch (error) {
    console.error('fetchClassList error:', error)
    return []
  }
}

/**
 * Cloudflare R2'den belirtilen sınıfın Excel dosyasını (ör. 9A.xlsx) indirir.
 */
export async function fetchClassExcel(sinifAdi: string): Promise<File> {
  const sanitizedName = sinifAdi.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase()
  const fileName = `${sanitizedName}.xlsx`
  
  const res = await fetch(`${R2_PUBLIC_URL}/class-templates/${fileName}`, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`"${sinifAdi}" sınıfının Excel dosyası sunucuda bulunamadı. (${res.status})`)
  }

  const blob = await res.blob()
  const file = new File([blob], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  return file
}

/**
 * Excel'i indirir ve mevcut parser ile öğrenci objelerine çevirir.
 */
export async function parseClassTemplate(sinifAdi: string): Promise<ParsedStudent[]> {
  try {
    const file = await fetchClassExcel(sinifAdi)
    const result = await parseStudentExcel(file)
    return result
  } catch (error) {
    console.error('parseClassTemplate error:', error)
    throw error
  }
}
