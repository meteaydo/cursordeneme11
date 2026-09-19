import JSZip from 'jszip'
import type { AnnualPlan, AnnualPlanItem } from '@/types'

const MONTHS: Record<string, number> = {
  ocak: 0,
  subat: 1,
  şubat: 1,
  mart: 2,
  nisan: 3,
  mayis: 4,
  mayıs: 4,
  haziran: 5,
  temmuz: 6,
  agustos: 7,
  ağustos: 7,
  eylul: 8,
  eylül: 8,
  ekim: 9,
  kasim: 10,
  kasım: 10,
  aralik: 11,
  aralık: 11,
}

function foldTr(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`
}

function yearForMonth(monthIndex: number, startYear: number): number {
  return monthIndex >= 8 ? startYear : startYear + 1
}

function parseMonthName(raw: string): number | null {
  const key = foldTr(raw.trim())
  if (key in MONTHS) return MONTHS[key]
  return null
}

export function parseAcademicYear(text: string): string | null {
  const m = text.match(/(\d{4})\s*[-–]\s*(\d{4})/)
  if (!m) return null
  return `${m[1]}-${m[2]}`
}

/** "1. Hafta:14-18 Eylül" veya "3. Hafta:28 Eylül-02 Ekim" */
export function parseHaftaCell(
  cell: string,
  academicYear: string,
): { label: string; tarihBas: string; tarihBit: string } | null {
  const startYear = Number(academicYear.split('-')[0])
  if (!Number.isFinite(startYear)) return null

  const m = cell.match(/(\d{1,2})\s*\.\s*Hafta\s*:?\s*(.+)/i)
  if (!m) return null
  const label = `${m[1]}. Hafta`
  const range = m[2].replace(/\s+/g, ' ').trim()

  const cross = range.match(/^(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*[-–]\s*(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)$/)
  if (cross) {
    const monthA = parseMonthName(cross[2])
    const monthB = parseMonthName(cross[4])
    if (monthA == null || monthB == null) return null
    return {
      label,
      tarihBas: isoDate(yearForMonth(monthA, startYear), monthA, Number(cross[1])),
      tarihBit: isoDate(yearForMonth(monthB, startYear), monthB, Number(cross[3])),
    }
  }

  const same = range.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)$/)
  if (same) {
    const month = parseMonthName(same[3])
    if (month == null) return null
    const y = yearForMonth(month, startYear)
    return {
      label,
      tarihBas: isoDate(y, month, Number(same[1])),
      tarihBit: isoDate(y, month, Number(same[2])),
    }
  }

  return null
}

function localChildren(el: Element, name: string): Element[] {
  return [...el.children].filter((c) => c.localName === name)
}

function cellText(tc: Element): string {
  const parts: string[] = []
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) return
    if (n.nodeType !== Node.ELEMENT_NODE) return
    const e = n as Element
    if (e.localName === 't') parts.push(e.textContent ?? '')
    else if (e.localName === 'br' || e.localName === 'tab') parts.push(' ')
    else for (const c of [...e.childNodes]) walk(c)
  }
  walk(tc)
  return parts.join('').replace(/\s+/g, ' ').trim()
}

function tableRows(tbl: Element): string[][] {
  return localChildren(tbl, 'tr').map((tr) => localChildren(tr, 'tc').map(cellText))
}

function headerIndex(row: string[]): { hafta: number; unite: number; konu: number; kazanim: number } | null {
  const folded = row.map((c) => foldTr(c))
  const hafta = folded.findIndex((c) => c === 'hafta')
  const kazanim = folded.findIndex((c) => c === 'kazanim' || c.startsWith('kazanim'))
  if (hafta < 0 || kazanim < 0) return null
  return {
    hafta,
    unite: folded.findIndex((c) => c === 'unite'),
    konu: folded.findIndex((c) => c === 'konu'),
    kazanim,
  }
}

export function planFromTables(xml: string, fileName?: string): AnnualPlan {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parseErr = doc.querySelector('parsererror')
  if (parseErr) throw new Error('Word belgesi okunamadı.')

  const year = parseAcademicYear(doc.documentElement.textContent ?? '') ?? ''
  if (!year) throw new Error('Eğitim-öğretim yılı bulunamadı (ör. 2026-2027).')

  const tables = [...doc.getElementsByTagNameNS(
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'tbl',
  )]
  if (tables.length === 0) {
    tables.push(...[...doc.getElementsByTagName('*')].filter((el) => el.localName === 'tbl') as Element[])
  }
  let header: ReturnType<typeof headerIndex> = null
  let dataRows: string[][] = []

  for (const tbl of tables) {
    const rows = tableRows(tbl)
    for (let i = 0; i < rows.length; i++) {
      const idx = headerIndex(rows[i])
      if (idx) {
        header = idx
        dataRows = rows.slice(i + 1)
        break
      }
    }
    if (header) break
  }

  if (!header) throw new Error('Hafta / Kazanım sütunları bulunamadı. MEB e-Yıllık Plan belgesi bekleniyor.')

  const items: AnnualPlanItem[] = []
  let lastUnite = ''

  for (const row of dataRows) {
    const haftaRaw = row[header.hafta] ?? ''
    const parsed = parseHaftaCell(haftaRaw, year)
    if (!parsed) continue

    let unite = header.unite >= 0 ? (row[header.unite] ?? '').trim() : ''
    if (unite) lastUnite = unite
    else unite = lastUnite

    items.push({
      hafta: parsed.label,
      tarihBas: parsed.tarihBas,
      tarihBit: parsed.tarihBit,
      unite,
      konu: header.konu >= 0 ? (row[header.konu] ?? '').trim() : '',
      kazanim: (row[header.kazanim] ?? '').trim(),
    })
  }

  if (items.length === 0) throw new Error('Tabloda hafta satırı bulunamadı.')

  return { yil: year, kaynakDosya: fileName, items }
}

export async function parseAnnualPlanDocx(file: File | Blob, fileName?: string): Promise<AnnualPlan> {
  const zip = await JSZip.loadAsync(file)
  const xmlFile = zip.file('word/document.xml')
  if (!xmlFile) throw new Error('Geçerli bir .docx dosyası değil.')
  const xml = await xmlFile.async('string')
  const name = fileName ?? (file instanceof File ? file.name : undefined)
  return planFromTables(xml, name)
}

export type PlanDayMatch = { item: AnnualPlanItem; kind: 'current' | 'upcoming' | 'past' }

export function findPlanItemForDate(plan: AnnualPlan | undefined, date = new Date()): PlanDayMatch | null {
  if (!plan?.items.length) return null
  const day = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  const current = plan.items.find((i) => i.tarihBas <= day && day <= i.tarihBit)
  if (current) return { item: current, kind: 'current' }
  const upcoming = plan.items.find((i) => i.tarihBas > day)
  if (upcoming) return { item: upcoming, kind: 'upcoming' }
  const past = [...plan.items].reverse().find((i) => i.tarihBit < day)
  return past ? { item: past, kind: 'past' } : null
}

export function formatPlanRange(item: AnnualPlanItem): string {
  const a = item.tarihBas.slice(8)
  const b = item.tarihBit.slice(8)
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  const m1 = Number(item.tarihBas.slice(5, 7)) - 1
  const m2 = Number(item.tarihBit.slice(5, 7)) - 1
  if (m1 === m2) return `${Number(a)}–${Number(b)} ${months[m1]}`
  return `${Number(a)} ${months[m1]} – ${Number(b)} ${months[m2]}`
}
