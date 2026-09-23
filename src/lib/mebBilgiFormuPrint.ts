import ExcelJS from 'exceljs'
import type { MebOgrenciBilgiFormu } from '@/types'
import { MEB_FOOTER, buildMebFormLayout } from '@/lib/mebBilgiFormuFields'

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
}

function safeFilePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'ogrenci'
}

function dash(value?: string): string {
  const t = value?.trim()
  return t || ''
}

function styleLabel(cell: ExcelJS.Cell) {
  cell.font = { size: 8, color: { argb: 'FF374151' } }
  cell.alignment = { vertical: 'top', wrapText: true }
  cell.border = THIN
}

function styleValue(cell: ExcelJS.Cell) {
  cell.font = { size: 10 }
  cell.alignment = { vertical: 'top', wrapText: true }
  cell.border = THIN
}

function addLayoutPair(
  ws: ExcelJS.Worksheet,
  left: { label: string; value: string },
  right?: { label: string; value: string },
  full = false,
) {
  if (full || !right) {
    const row = ws.addRow([left.label, dash(left.value), '', ''])
    ws.mergeCells(row.number, 2, row.number, 4)
    styleLabel(row.getCell(1))
    styleValue(row.getCell(2))
    row.getCell(3).border = THIN
    row.getCell(4).border = THIN
    row.height = full ? 36 : 22
    return
  }

  const row = ws.addRow([left.label, dash(left.value), right.label, dash(right.value)])
  styleLabel(row.getCell(1))
  styleValue(row.getCell(2))
  styleLabel(row.getCell(3))
  styleValue(row.getCell(4))
  row.height = 22
}

export async function exportMebBilgiFormuExcel(opts: {
  adSoyad: string
  ogrenciNo: string
  sinifAdi: string
  data?: MebOgrenciBilgiFormu
}): Promise<void> {
  const data = opts.data ?? {}
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Bilgi Formu', {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    properties: { defaultRowHeight: 18 },
  })

  ws.columns = [
    { width: 34 },
    { width: 22 },
    { width: 34 },
    { width: 22 },
  ]

  ws.mergeCells(1, 1, 1, 4)
  const title = ws.getCell(1, 1)
  title.value = 'MEB Öğrenci Bilgi Formu'
  title.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  title.alignment = { vertical: 'middle', horizontal: 'center' }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }
  ws.getRow(1).height = 28

  const meta = ws.addRow(['Adı soyadı', opts.adSoyad || '', 'Öğrenci no', opts.ogrenciNo || ''])
  styleLabel(meta.getCell(1))
  styleValue(meta.getCell(2))
  meta.getCell(2).font = { size: 11, bold: true }
  styleLabel(meta.getCell(3))
  styleValue(meta.getCell(4))
  meta.getCell(4).font = { size: 11, bold: true }
  meta.height = 22

  const sinifRow = ws.addRow(['Sınıf', opts.sinifAdi || '', '', ''])
  ws.mergeCells(sinifRow.number, 2, sinifRow.number, 4)
  styleLabel(sinifRow.getCell(1))
  styleValue(sinifRow.getCell(2))
  sinifRow.getCell(2).font = { size: 11, bold: true }
  sinifRow.getCell(3).border = THIN
  sinifRow.getCell(4).border = THIN
  sinifRow.height = 22

  for (const row of buildMebFormLayout(data)) {
    if (row.kind === 'section') {
      const head = ws.addRow([row.title, '', '', ''])
      ws.mergeCells(head.number, 1, head.number, 4)
      head.getCell(1).font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      head.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' }
      head.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } }
      head.height = 20
      for (let c = 1; c <= 4; c++) head.getCell(c).border = THIN
      continue
    }
    addLayoutPair(ws, row.left, row.right, row.full)
  }

  const footer = ws.addRow([MEB_FOOTER, '', '', ''])
  ws.mergeCells(footer.number, 1, footer.number, 4)
  footer.getCell(1).font = { size: 7, color: { argb: 'FF6B7280' } }
  footer.getCell(1).alignment = { vertical: 'top', wrapText: true }
  footer.height = 78

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  const name = safeFilePart(opts.adSoyad)
  const klass = safeFilePart(opts.sinifAdi)
  anchor.download = `${name}_${klass}_MEB_ogrenci_bilgi_formu.xlsx`
  anchor.click()
  window.URL.revokeObjectURL(url)
}
