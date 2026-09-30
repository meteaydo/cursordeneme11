import { parseStudentExcel, type ParsedStudent } from '@/lib/excelStudentParser'
import { formatClassName } from '@/lib/utils'

// Varsayılan public URL (env'den alınır)
const R2_PUBLIC_URL = import.meta.env.VITE_R2_WORKER_URL || import.meta.env.VITE_R2_PUBLIC_URL || 'https://pub-r2.yourdomain.com'

/** R2 sınıf kodunu tek biçime getirir (9A, 10B …) */
export function normalizeClassTemplateKey(name: string): string {
  return formatClassName(name)
}

export function normalizeClassList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const unique = [...new Set(raw.map((x) => normalizeClassTemplateKey(String(x))).filter(Boolean))]
  unique.sort((a, b) => {
    const ma = a.match(/^(\d+)([A-Z]*)$/)
    const mb = b.match(/^(\d+)([A-Z]*)$/)
    if (!ma || !mb) return a.localeCompare(b, 'tr')
    const gradeDiff = Number(ma[1]) - Number(mb[1])
    if (gradeDiff !== 0) return gradeDiff
    return (ma[2] || '').localeCompare(mb[2] || '', 'tr')
  })
  return unique
}

export function classListIncludes(list: string[], sinifAdi: string): boolean {
  const key = normalizeClassTemplateKey(sinifAdi)
  return list.some((item) => normalizeClassTemplateKey(item) === key)
}

/** Yalnızca R2 listesinde gerçekten olan kademeler */
export function gradesFromClassNames(list: string[]) {
  const grades = new Set<string>()
  for (const name of list) {
    const grade = normalizeClassTemplateKey(name).match(/^(\d+)/)?.[1]
    if (grade) grades.add(grade)
  }
  return [...grades].sort((a, b) => Number(a) - Number(b))
}

export function sectionsForGrade(list: string[], grade: string): string[] {
  const g = grade.trim()
  const sections = new Set<string>()
  for (const name of list) {
    const m = normalizeClassTemplateKey(name).match(/^(\d+)([A-Z]+)$/)
    if (m && m[1] === g) sections.add(m[2])
  }
  return [...sections].sort((a, b) => a.localeCompare(b, 'tr'))
}

export async function fetchClassList(): Promise<string[]> {
  try {
    const res = await fetch(`${R2_PUBLIC_URL}/class-templates/classes.json`, { cache: 'no-store' })
    if (!res.ok) {
      if (res.status === 404) return []
      throw new Error('Sınıf listesi çekilemedi.')
    }
    const data = await res.json()
    return normalizeClassList(data)
  } catch (error) {
    console.error('fetchClassList error:', error)
    return []
  }
}

/**
 * Cloudflare R2'den belirtilen sınıfın Excel dosyasını (ör. 9A.xlsx) indirir.
 */
export async function fetchClassExcel(sinifAdi: string): Promise<File> {
  const sanitizedName = normalizeClassTemplateKey(sinifAdi)
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

/** R2 şablonu ve elle yüklenen Excel aynı ayrıştırıcıdan geçer. */
export function parseClassExcelFile(file: File): Promise<ParsedStudent[]> {
  return parseStudentExcel(file)
}

/**
 * Excel'i indirir ve mevcut parser ile öğrenci objelerine çevirir.
 */
export async function parseClassTemplate(sinifAdi: string): Promise<ParsedStudent[]> {
  try {
    const file = await fetchClassExcel(sinifAdi)
    return await parseClassExcelFile(file)
  } catch (error) {
    console.error('parseClassTemplate error:', error)
    throw error
  }
}
