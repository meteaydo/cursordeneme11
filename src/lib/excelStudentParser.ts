import ExcelJS from 'exceljs'

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

const STUDENT_NO_REGEX = /^\d{2,6}$/

function extractStudentFromCell(value: string): { adSoyad: string; no: string } | null {
  const lines = value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length < 2) return null

  const lastLine = lines[lines.length - 1]
  if (!STUDENT_NO_REGEX.test(lastLine)) return null

  const adSoyad = lines.slice(0, -1).join(' ').trim()
  if (adSoyad.length < 2) return null

  return { adSoyad, no: lastLine }
}

function getCellText(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object' && 'richText' in (v as ExcelJS.CellRichTextValue)) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('')
  }
  return String(v)
}

function isMasterCell(cell: ExcelJS.Cell): boolean {
  if (!cell.isMerged) return true
  const master = cell.master
  return master.address === cell.address
}

export async function parseStudentExcel(file: File): Promise<ParsedStudent[]> {
  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const worksheet = workbook.getWorksheet(1)
  if (!worksheet) throw new Error('Excel dosyasında sayfa bulunamadı.')

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

  if (candidates.length === 0) {
    throw new Error('Excel dosyasında öğrenci verisi bulunamadı. Beklenen format: "Ad Soyad\\nNumara"')
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
        student.foto = new Blob([mediaItem.buffer], { type: mimeType })
      }
    }

    return student
  })

  results.sort((a, b) => Number(a.no) - Number(b.no) || a.no.localeCompare(b.no))

  return results
}
