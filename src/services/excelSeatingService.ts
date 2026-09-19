import ExcelJS from 'exceljs'
import type { SeatObject, Student } from '@/types'

const FONT = 'Arial'
const GRID = 10
const PAD_COLS = 2
const PAD_ROWS = 6

const SIZES: Record<string, { w: number; h: number }> = {
  tahta: { w: 200, h: 40 },
  masa: { w: 120, h: 60 },
  empty_object: { w: 60, h: 60 },
  student: { w: 70, h: 70 },
  empty_desk: { w: 70, h: 70 },
}

function getObjSize(type: string) {
  return SIZES[type] ?? { w: 70, h: 70 }
}

function colLetter(ws: ExcelJS.Worksheet, col: number) {
  return ws.getColumn(Math.max(1, col)).letter
}

function rangeKey(r: number, c: number) {
  return `${r}:${c}`
}

function markOccupied(used: Set<string>, r1: number, c1: number, r2: number, c2: number) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) used.add(rangeKey(r, c))
  }
}

function isFree(used: Set<string>, r1: number, c1: number, r2: number, c2: number) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      if (used.has(rangeKey(r, c))) return false
    }
  }
  return true
}

function findFreeBlock(
  used: Set<string>,
  startRow: number,
  startCol: number,
  spanRow: number,
  spanCol: number,
  maxRow: number,
  maxCol: number,
) {
  const candidates = [
    [0, 0],
    [0, 1], [1, 0], [0, -1], [-1, 0],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
    [0, 2], [2, 0], [0, -2], [-2, 0],
  ]
  for (const [dr, dc] of candidates) {
    const r1 = startRow + dr
    const c1 = startCol + dc
    const r2 = r1 + spanRow
    const c2 = c1 + spanCol
    if (r1 < PAD_ROWS || c1 < 1 || r2 > maxRow || c2 > maxCol) continue
    if (isFree(used, r1, c1, r2, c2)) return { r1, c1, r2, c2 }
  }
  return null
}

function pcMapForDesks(objects: SeatObject[]) {
  const map = new Map<string, string>()
  for (const obj of objects) {
    if (obj.type !== 'pc_label' || !obj.linkedStudentId || !obj.pcNo) continue
    map.set(obj.linkedStudentId, obj.pcNo)
  }
  return map
}

function deskLinkId(obj: SeatObject) {
  if (obj.type === 'student') return obj.studentId
  if (obj.type === 'empty_desk') return obj.id
  return undefined
}

export const generateSeatingPlanExcel = async (
  objects: SeatObject[],
  students: Student[],
  dersAdi: string,
  sinifAdi: string,
) => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Oturma Düzeni')

  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    margins: { left: 0.4, right: 0.4, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    verticalCentered: true,
  }

  const drawable = objects.filter((o) => o.type !== 'pc_label')
  if (drawable.length === 0) {
    throw new Error('İndirilecek oturma planı nesnesi yok.')
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  drawable.forEach((obj) => {
    const { w, h } = getObjSize(obj.type)
    minX = Math.min(minX, obj.x)
    minY = Math.min(minY, obj.y)
    maxX = Math.max(maxX, obj.x + w)
    maxY = Math.max(maxY, obj.y + h)
  })

  const totalCols = Math.ceil((maxX - minX) / GRID) + PAD_COLS * 2
  const totalRows = Math.ceil((maxY - minY) / GRID) + PAD_ROWS + 4
  const maxCol = Math.max(totalCols, 24)
  const maxRow = Math.max(totalRows, 20)

  for (let i = 1; i <= maxCol; i++) worksheet.getColumn(i).width = 2.1
  for (let i = 1; i <= maxRow; i++) worksheet.getRow(i).height = 11

  const lastCol = colLetter(worksheet, maxCol)
  worksheet.mergeCells(`A1:${lastCol}2`)
  const titleCell = worksheet.getCell('A1')
  titleCell.value = `${sinifAdi.toLocaleUpperCase('tr-TR')} SINIFI  ${dersAdi.toLocaleUpperCase('tr-TR')} DERSİ  OTURMA PLANI`
  titleCell.font = { name: FONT, size: 14, bold: true, color: { argb: 'FF111827' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  worksheet.getRow(1).height = 18
  worksheet.getRow(2).height = 18

  worksheet.mergeCells(`A3:${lastCol}3`)
  const dateCell = worksheet.getCell('A3')
  dateCell.value = new Date().toLocaleDateString('tr-TR')
  dateCell.font = { name: FONT, size: 10, italic: true, color: { argb: 'FF4B5563' } }
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' }
  worksheet.getRow(3).height = 16

  const studentMap = new Map(students.map((s) => [s.id, s]))
  const pcByLink = pcMapForDesks(objects)
  const used = new Set<string>()
  markOccupied(used, 1, 1, 3, maxCol)

  const ordered = [...drawable].sort((a, b) => {
    const sa = getObjSize(a.type)
    const sb = getObjSize(b.type)
    return sb.w * sb.h - sa.w * sa.h
  })

  for (const obj of ordered) {
    const { w, h } = getObjSize(obj.type)
    const spanCol = Math.max(3, Math.round(w / GRID) - 1)
    const spanRow = Math.max(2, Math.round(h / GRID) - 1)
    const startCol = Math.floor((obj.x - minX) / GRID) + PAD_COLS
    const startRow = Math.floor((obj.y - minY) / GRID) + PAD_ROWS

    const block = findFreeBlock(used, startRow, startCol, spanRow, spanCol, maxRow, maxCol)
    if (!block) continue

    const { r1, c1, r2, c2 } = block
    const startStr = `${colLetter(worksheet, c1)}${r1}`
    const endStr = `${colLetter(worksheet, c2)}${r2}`

    try {
      if (startStr !== endStr) worksheet.mergeCells(`${startStr}:${endStr}`)
    } catch {
      continue
    }

    markOccupied(used, r1, c1, r2, c2)
    const cell = worksheet.getCell(startStr)
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, shrinkToFit: false }

    if (obj.type === 'student' || obj.type === 'empty_desk') {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
        left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
        bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
        right: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }

      const student = obj.studentId ? studentMap.get(obj.studentId) : undefined
      const linkId = deskLinkId(obj)
      const pcNo = (linkId && pcByLink.get(linkId)) || obj.pcNo || student?.pcNo || ''

      if (student) {
        const adSoyad = student.adSoyad.toLocaleUpperCase('tr-TR')
        const lines: ExcelJS.RichText[] = [
          { font: { name: FONT, size: 9, bold: true, color: { argb: 'FF111827' } }, text: adSoyad },
        ]
        if (student.no) {
          lines.push({ font: { name: FONT, size: 8, color: { argb: 'FF4B5563' } }, text: `\n${student.no}` })
        }
        if (pcNo) {
          lines.push({ font: { name: FONT, size: 8, bold: true, color: { argb: 'FF1D4ED8' } }, text: `\nPC ${pcNo}` })
        }
        cell.value = { richText: lines }
      } else {
        const lines: ExcelJS.RichText[] = [
          { font: { name: FONT, size: 9, bold: true, color: { argb: 'FF6B7280' } }, text: 'BOŞ' },
        ]
        if (pcNo) {
          lines.push({ font: { name: FONT, size: 8, bold: true, color: { argb: 'FF1D4ED8' } }, text: `\nPC ${pcNo}` })
        }
        cell.value = { richText: lines }
      }
    } else if (obj.type === 'tahta') {
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF6B7280' } },
        left: { style: 'medium', color: { argb: 'FF6B7280' } },
        bottom: { style: 'medium', color: { argb: 'FF6B7280' } },
        right: { style: 'medium', color: { argb: 'FF6B7280' } },
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
      cell.value = 'TAHTA'
      cell.font = { name: FONT, size: 9, bold: true, color: { argb: 'FF374151' } }
    } else if (obj.type === 'masa') {
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF6B7280' } },
        left: { style: 'medium', color: { argb: 'FF6B7280' } },
        bottom: { style: 'medium', color: { argb: 'FF6B7280' } },
        right: { style: 'medium', color: { argb: 'FF6B7280' } },
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
      cell.value = { richText: [{ font: { name: FONT, size: 9, bold: true, color: { argb: 'FF374151' } }, text: 'ÖĞRETMEN\nMASASI' }] }
    } else if (obj.type === 'empty_object') {
      cell.border = {
        top: { style: 'dashed', color: { argb: 'FF9CA3AF' } },
        left: { style: 'dashed', color: { argb: 'FF9CA3AF' } },
        bottom: { style: 'dashed', color: { argb: 'FF9CA3AF' } },
        right: { style: 'dashed', color: { argb: 'FF9CA3AF' } },
      }
      cell.value = 'OBJE'
      cell.font = { name: FONT, size: 8, bold: true, color: { argb: 'FF6B7280' } }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${dersAdi.replace(/\s+/g, '_')}_Oturma_Plani.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
