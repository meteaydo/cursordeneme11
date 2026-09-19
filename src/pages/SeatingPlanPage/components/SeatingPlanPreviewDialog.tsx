import { useMemo } from 'react'
import type { SeatObject, Student } from '@/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet, Printer } from 'lucide-react'

const SIZES: Record<string, { w: number; h: number }> = {
  tahta: { w: 200, h: 40 },
  masa: { w: 120, h: 60 },
  empty_object: { w: 60, h: 60 },
  student: { w: 70, h: 70 },
  empty_desk: { w: 70, h: 70 },
}

function sizeOf(type: string) {
  return SIZES[type] ?? { w: 70, h: 70 }
}

interface PreviewBox {
  id: string
  type: string
  x: number
  y: number
  w: number
  h: number
  name: string
  no?: string
  pcNo?: string
}

function buildBoxes(objects: SeatObject[], students: Student[]): PreviewBox[] {
  const studentMap = new Map(students.map((s) => [s.id, s]))
  const pcByLink = new Map<string, string>()
  objects.forEach((o) => {
    if (o.type === 'pc_label' && o.linkedStudentId && o.pcNo) {
      pcByLink.set(o.linkedStudentId, o.pcNo)
    }
  })

  return objects
    .filter((o) => o.type !== 'pc_label')
    .map((o) => {
      const { w, h } = sizeOf(o.type)
      const student = o.studentId ? studentMap.get(o.studentId) : undefined
      const linkId = o.type === 'student' ? o.studentId : o.type === 'empty_desk' ? o.id : undefined
      const pcNo = (linkId && pcByLink.get(linkId)) || o.pcNo || student?.pcNo || ''

      if (o.type === 'student' && student) {
        return { id: o.id, type: o.type, x: o.x, y: o.y, w, h, name: student.adSoyad.toLocaleUpperCase('tr-TR'), no: student.no, pcNo }
      }
      if (o.type === 'empty_desk') {
        return { id: o.id, type: o.type, x: o.x, y: o.y, w, h, name: 'BOŞ', pcNo }
      }
      if (o.type === 'tahta') return { id: o.id, type: o.type, x: o.x, y: o.y, w, h, name: 'TAHTA' }
      if (o.type === 'masa') return { id: o.id, type: o.type, x: o.x, y: o.y, w, h, name: 'ÖĞRETMEN MASASI' }
      return { id: o.id, type: o.type, x: o.x, y: o.y, w, h, name: 'OBJE' }
    })
}

function layoutMetrics(boxes: PreviewBox[]) {
  if (boxes.length === 0) return { minX: 0, minY: 0, width: 400, height: 260 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  boxes.forEach((b) => {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  })
  return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function boxInnerHtml(box: PreviewBox) {
  const name = escapeHtml(box.name)
  const no = box.no ? `<div class="meta">${escapeHtml(box.no)}</div>` : ''
  const pc = box.pcNo ? `<div class="pc">PC ${escapeHtml(box.pcNo)}</div>` : ''
  return `<div class="name">${name}</div>${no}${pc}`
}

function boxClass(type: string) {
  if (type === 'tahta' || type === 'masa') return 'box furniture'
  if (type === 'empty_desk' || type === 'empty_object') return 'box empty'
  return 'box desk'
}

interface SeatingPlanPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  objects: SeatObject[]
  students: Student[]
  dersAdi: string
  sinifAdi: string
  onDownloadExcel: () => void
}

export function SeatingPlanPreviewDialog({
  open,
  onOpenChange,
  objects,
  students,
  dersAdi,
  sinifAdi,
  onDownloadExcel,
}: SeatingPlanPreviewDialogProps) {
  const boxes = useMemo(() => buildBoxes(objects, students), [objects, students])
  const metrics = useMemo(() => layoutMetrics(boxes), [boxes])
  const title = `${sinifAdi.toLocaleUpperCase('tr-TR')} SINIFI  ${dersAdi.toLocaleUpperCase('tr-TR')} DERSİ  OTURMA PLANI`
  const dateLabel = new Date().toLocaleDateString('tr-TR')

  const previewWidth = 920
  const scale = Math.min(previewWidth / (metrics.width + 24), 560 / (metrics.height + 24), 1.35)

  const handlePrint = () => {
    const printW = 1040
    const printScale = Math.min(printW / (metrics.width + 16), 620 / (metrics.height + 16), 1.4)
    const planW = (metrics.width + 16) * printScale
    const planH = (metrics.height + 16) * printScale

    const items = boxes.map((box) => {
      const left = (box.x - metrics.minX + 8) * printScale
      const top = (box.y - metrics.minY + 8) * printScale
      const w = box.w * printScale
      const h = box.h * printScale
      return `<div class="${boxClass(box.type)}" style="left:${left}px;top:${top}px;width:${w}px;height:${h}px">${boxInnerHtml(box)}</div>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; color: #111827; }
    .sheet { padding: 8px 12px; }
    h1 { font-size: 16px; text-align: center; margin: 0 0 4px; letter-spacing: 0.04em; }
    .date { text-align: center; font-size: 11px; font-style: italic; color: #4b5563; margin-bottom: 12px; }
    .plan { position: relative; margin: 0 auto; width: ${planW}px; height: ${planH}px; }
    .box { position: absolute; border: 1px solid #9ca3af; border-radius: 8px; background: #f9fafb; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 3px; overflow: hidden; }
    .furniture { background: #e5e7eb; border-width: 2px; }
    .empty { background: #fff; border-style: dashed; color: #6b7280; }
    .name { font-size: 9px; font-weight: 700; line-height: 1.15; }
    .meta { font-size: 8px; color: #4b5563; margin-top: 2px; }
    .pc { font-size: 8px; font-weight: 700; color: #1d4ed8; margin-top: 1px; }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>${escapeHtml(title)}</h1>
    <div class="date">${escapeHtml(dateLabel)}</div>
    <div class="plan">${items}</div>
  </div>
</body>
</html>`

    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)
    iframe.srcdoc = html
    iframe.onload = () => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => iframe.remove(), 1500)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,1080px)] p-4 sm:p-5">
        <DialogHeader>
          <DialogTitle className="text-base">Oturma planı önizleme</DialogTitle>
          <DialogDescription>
            Kontrol ettikten sonra yazdırıp PDF kaydedebilir veya Excel indirebilirsiniz.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-slate-100 p-3 overflow-auto max-h-[62vh]">
          <div className="text-center mb-3">
            <div className="text-[13px] font-bold tracking-wide text-slate-800">{title}</div>
            <div className="text-[11px] italic text-slate-500 mt-0.5">{dateLabel}</div>
          </div>
          <div
            className="relative mx-auto bg-white rounded-lg shadow-sm border"
            style={{
              width: (metrics.width + 24) * scale,
              height: (metrics.height + 24) * scale,
            }}
          >
            {boxes.map((box) => {
              const left = (box.x - metrics.minX + 12) * scale
              const top = (box.y - metrics.minY + 12) * scale
              const isFurniture = box.type === 'tahta' || box.type === 'masa'
              const isEmpty = box.type === 'empty_desk' || box.type === 'empty_object'
              return (
                <div
                  key={box.id}
                  className={`absolute flex flex-col items-center justify-center text-center overflow-hidden rounded-md border px-0.5 ${
                    isFurniture
                      ? 'bg-slate-200 border-slate-400'
                      : isEmpty
                        ? 'bg-white border-dashed border-slate-400 text-slate-500'
                        : 'bg-slate-50 border-slate-300'
                  }`}
                  style={{ left, top, width: box.w * scale, height: box.h * scale }}
                >
                  <span className="text-[9px] font-bold leading-tight text-slate-800">{box.name}</span>
                  {box.no ? <span className="text-[8px] text-slate-500 leading-tight">{box.no}</span> : null}
                  {box.pcNo ? <span className="text-[8px] font-bold text-blue-700 leading-tight">PC {box.pcNo}</span> : null}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Kapat</Button>
          <Button variant="outline" onClick={onDownloadExcel} className="gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Excel indir
          </Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="w-4 h-4" />
            Yazdır / PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
