import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'

export interface ParsedStudent {
  adSoyad: string
  no: string
  foto?: Blob
  row: number
  col: number
}

interface CellCandidate {
  row: number
  col: number
  adSoyad: string
  no: string
}

interface ImageAnchor {
  col: number
  row: number
  imageIndex: number
}

function extractStudentFromCell(value: string): { adSoyad: string; no: string } | null {
  const lines = value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length < 2) return null

  const lastLine = lines[lines.length - 1].replace(/\s+/g, '')
  const noMatch = lastLine.match(/^(?:no[:.]?)?(\d{1,11})\.?$/i)
  if (!noMatch) return null

  const adSoyad = lines.slice(0, -1).join(' ').trim()
  if (adSoyad.length < 2) return null

  return { adSoyad, no: noMatch[1] }
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
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function richTextOf(value: unknown): string {
  if (!value || typeof value !== 'object' || !('richText' in value)) return ''
  const parts = (value as ExcelJS.CellRichTextValue).richText
  if (!Array.isArray(parts)) return ''
  return parts.map((part) => part?.text ?? '').join('')
}

function getCellText(cell: ExcelJS.Cell): string {
  const fromValue = (() => {
    const v = cell.value
    if (v == null) return ''
    if (typeof v === 'string' || typeof v === 'number') return String(v)
    const rich = richTextOf(v)
    if (rich) return rich
    if (typeof v === 'object' && 'text' in v && typeof (v as { text: unknown }).text === 'string') {
      return (v as { text: string }).text
    }
    if (typeof v === 'object' && 'result' in v && (v as { result: unknown }).result != null) {
      return String((v as { result: unknown }).result)
    }
    return ''
  })()
  if (fromValue.trim()) return fromValue.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n')

  try {
    const shown = cell.text ?? ''
    if (shown && shown !== '[object Object]') return shown.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n')
  } catch {
    /* bazı birleşik hücrelerde text okunamaz */
  }
  return ''
}

function cleanNo(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, '').replace(/\.0$/, '')
  const m = t.match(/^(?:no[:.]?)?(\d{1,11})$/i)
  return m ? m[1] : null
}

type ColMap = { no: number; name?: number; first?: number; last?: number }

function headerRole(raw: string): 'no' | 'name' | 'first' | 'last' | null {
  const f = foldTr(raw)
  if (!f || f === 'sn' || f.includes('sira') || f.includes('sinif')) return null
  if (f === 'no' || f.includes('numara') || (f.includes('ogrenci') && f.includes('no')) || (f.includes('okul') && f.includes('no'))) {
    return 'no'
  }
  if (f === 'ad soyad' || f === 'adi soyadi' || f === 'ad soyadi' || f === 'adi soyad' || f === 'isim soyisim') {
    return 'name'
  }
  if (f === 'adi' || f === 'ad' || f === 'isim') return 'first'
  if (f === 'soyadi' || f === 'soyad') return 'last'
  return null
}

function mapHeaderRow(row: ExcelJS.Row): ColMap | null {
  const map: Partial<ColMap> = {}
  row.eachCell({ includeEmpty: false }, (cell) => {
    const role = headerRole(getCellText(cell))
    if (!role || map[role] != null) return
    map[role] = Number(cell.col)
  })
  if (map.no == null) return null
  if (map.name == null && (map.first == null || map.last == null)) return null
  return map as ColMap
}

function parseTableCandidates(worksheet: ExcelJS.Worksheet): CellCandidate[] {
  let headerRow = 0
  let map: ColMap | null = null
  const scanUntil = Math.min(worksheet.rowCount || 40, 40)
  for (let r = 1; r <= scanUntil; r++) {
    const found = mapHeaderRow(worksheet.getRow(r))
    if (found) {
      headerRow = r
      map = found
      break
    }
  }
  if (!map) return []

  const out: CellCandidate[] = []
  const seen = new Set<string>()
  let emptyRun = 0
  const lastRow = worksheet.rowCount || headerRow + 300
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const row = worksheet.getRow(r)
    const no = cleanNo(getCellText(row.getCell(map.no)))
    const name = (
      map.name != null
        ? getCellText(row.getCell(map.name))
        : `${getCellText(row.getCell(map.first!))} ${getCellText(row.getCell(map.last!))}`
    )
      .replace(/\s+/g, ' ')
      .trim()
    if (!no && name.length < 2) {
      emptyRun++
      if (emptyRun >= 8 && out.length > 0) break
      continue
    }
    emptyRun = 0
    if (!no || name.length < 2 || seen.has(no)) continue
    seen.add(no)
    out.push({ row: r, col: map.no, adSoyad: name, no })
  }
  return out
}

function isMasterCell(cell: ExcelJS.Cell): boolean {
  if (!cell.isMerged) return true
  const master = cell.master
  return master.address === cell.address
}

function cardCandidates(worksheet: ExcelJS.Worksheet): CellCandidate[] {
  const candidates: CellCandidate[] = []
  const seen = new Set<string>()

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (!isMasterCell(cell)) return

      const text = getCellText(cell)
      if (!text.includes('\n') && !text.includes('\r')) return

      const parsed = extractStudentFromCell(text)
      if (!parsed) return

      if (seen.has(parsed.no)) return
      seen.add(parsed.no)

      const col = typeof cell.col === 'number' ? cell.col : Number(cell.col)
      candidates.push({ row: rowNumber, col, ...parsed })
    })
  })

  return candidates
}

function isLegacyXls(fileName: string, buffer: ArrayBuffer): boolean {
  if (/\.xlsx$/i.test(fileName)) return false
  if (/\.xls$/i.test(fileName)) return true
  const bytes = new Uint8Array(buffer.slice(0, 4))
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
}

function readU16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readU32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

type XlsPhoto = { col: number; row: number; foto: Blob }

function jpegBlobFrom(bytes: Uint8Array, start: number, maxScan = 96_000): Blob | null {
  if (start < 0 || start + 1 >= bytes.length) return null
  if (bytes[start] !== 0xff || bytes[start + 1] !== 0xd8) return null
  const limit = Math.min(bytes.length, start + maxScan)
  for (let j = start + 2; j < limit - 1; j++) {
    if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
      return new Blob([bytes.slice(start, j + 2)], { type: 'image/jpeg' })
    }
  }
  return null
}

function photosFromXls(buffer: ArrayBuffer, studentCells: { c: number; r: number }[]): XlsPhoto[] {
  const bytes = new Uint8Array(buffer)
  const cellKeys = new Set(studentCells.map((s) => `${s.c},${s.r}`))
  const anchors: { col: number; row: number }[] = []
  const jpegs: { offset: number; foto: Blob }[] = []

  for (let i = 2; i < bytes.length - 24; i++) {
    const type = readU16(bytes, i)
    if (type === 0xf010 && readU32(bytes, i + 2) === 18) {
      const body = i + 6
      const col = readU16(bytes, body + 2)
      const row = readU16(bytes, body + 6)
      if (cellKeys.has(`${col},${row + 1}`)) anchors.push({ col, row })
    }
    if ((type === 0xf01d || type === 0xf02a) && readU16(bytes, i - 2) === 0x46a0) {
      const start = i + 23
      const foto = jpegBlobFrom(bytes, start)
      if (foto) jpegs.push({ offset: start, foto })
    }
  }

  anchors.sort((a, b) => a.row - b.row || a.col - b.col)
  jpegs.sort((a, b) => a.offset - b.offset)

  const photos: XlsPhoto[] = []
  const count = Math.min(anchors.length, jpegs.length)
  for (let i = 0; i < count; i++) photos.push({ ...anchors[i], foto: jpegs[i].foto })
  return photos
}

function studentsFromXls(buffer: ArrayBuffer): ParsedStudent[] {
  const book = XLSX.read(buffer, { type: 'array' })
  let best: (CellCandidate & { r: number; c: number })[] = []

  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name]
    if (!sheet) continue
    const found: (CellCandidate & { r: number; c: number })[] = []
    const seen = new Set<string>()
    for (const addr of Object.keys(sheet)) {
      if (addr.startsWith('!')) continue
      const cell = sheet[addr] as { w?: string; v?: unknown } | undefined
      const text = String(cell?.w ?? cell?.v ?? '')
      if (!text.includes('\n') && !text.includes('\r')) continue
      const parsed = extractStudentFromCell(text)
      if (!parsed || seen.has(parsed.no)) continue
      seen.add(parsed.no)
      const pos = XLSX.utils.decode_cell(addr)
      found.push({ row: pos.r + 1, col: pos.c + 1, r: pos.r, c: pos.c, adSoyad: parsed.adSoyad, no: parsed.no })
    }
    if (found.length > best.length) best = found
  }

  const photos = photosFromXls(
    buffer,
    best.map((s) => ({ c: s.c, r: s.r })),
  )
  const results: ParsedStudent[] = best.map((student) => {
    const photo = photos.find((item) => item.col === student.c && student.r === item.row + 1)
    return {
      adSoyad: student.adSoyad,
      no: student.no,
      row: student.row,
      col: student.col,
      foto: photo?.foto,
    }
  })
  results.sort((a, b) => Number(a.no) - Number(b.no) || a.no.localeCompare(b.no))
  return results
}

function mediaToBlob(buffer: unknown, mimeType: string): Blob | undefined {
  try {
    if (buffer instanceof ArrayBuffer) return new Blob([buffer], { type: mimeType })
    if (ArrayBuffer.isView(buffer)) {
      const view = buffer as ArrayBufferView
      const bytes = new Uint8Array(view.byteLength)
      bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
      return new Blob([bytes], { type: mimeType })
    }
  } catch {
    return undefined
  }
  return undefined
}

export async function parseStudentExcel(file: File): Promise<ParsedStudent[]> {
  const buffer = await file.arrayBuffer()
  if (isLegacyXls(file.name, buffer)) {
    const fromXls = studentsFromXls(buffer)
    if (fromXls.length === 0) {
      throw new Error(
        'Öğrenci satırı bulunamadı. Sütun başlıkları No ve Ad Soyad olmalı, ya da hücrede ad ile numara alt alta yazmalı.',
      )
    }
    return fromXls
  }

  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    throw new Error('Dosya açılamadı. .xlsx veya .xls olmalı.')
  }

  if (!workbook.worksheets.length) throw new Error('Excel dosyasında sayfa bulunamadı.')

  let worksheet = workbook.worksheets[0]
  let candidates: CellCandidate[] = []
  for (const sheet of workbook.worksheets) {
    const cards = cardCandidates(sheet)
    const table = cards.length > 0 ? [] : parseTableCandidates(sheet)
    const found = cards.length >= table.length ? cards : table
    if (found.length > candidates.length) {
      candidates = found
      worksheet = sheet
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      'Öğrenci satırı bulunamadı. Sütun başlıkları No ve Ad Soyad olmalı, ya da hücrede ad ile numara alt alta yazmalı.',
    )
  }

  const images = worksheet.getImages()
  // @ts-expect-error type override
  const media = (workbook.model as { media?: { name: string; extension: string; buffer: Buffer }[] }).media ?? []

  const anchors: ImageAnchor[] = images.map((img, idx) => {
    const range = img.range
    return {
      col: (range.tl as { col: number }).col,
      row: (range.tl as { row: number }).row,
      imageIndex: idx,
    }
  })

  const usedAnchors = new Set<number>()

  const results: ParsedStudent[] = candidates.map((c) => {
    const student: ParsedStudent = {
      adSoyad: c.adSoyad,
      no: c.no,
      row: c.row,
      col: c.col,
    }

    if (anchors.length === 0) return student

    let bestAnchorIdx = -1
    let bestDist = Infinity

    // ExcelJS: cell col is 1-based, anchor col is 0-based
    const cellCol0 = c.col - 1
    const cellRow0 = c.row - 1

    for (let ai = 0; ai < anchors.length; ai++) {
      if (usedAnchors.has(ai)) continue
      const anchor = anchors[ai]

      const colDist = Math.abs(anchor.col - cellCol0)
      if (colDist > 2) continue

      const rowDist = Math.abs(anchor.row - cellRow0)
      if (rowDist > 5) continue

      const dist = colDist * 10 + rowDist

      if (dist < bestDist) {
        bestDist = dist
        bestAnchorIdx = ai
      }
    }

    if (bestAnchorIdx >= 0) {
      usedAnchors.add(bestAnchorIdx)
      const img = images[bestAnchorIdx]
      const mediaItem = media[img.imageId as unknown as number]

      if (mediaItem?.buffer) {
        const ext = mediaItem.extension || 'jpeg'
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'
        student.foto = mediaToBlob(mediaItem.buffer, mimeType)
      }
    }

    return student
  })

  results.sort((a, b) => Number(a.no) - Number(b.no) || a.no.localeCompare(b.no))

  return results
}
