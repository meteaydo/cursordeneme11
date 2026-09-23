import { useState } from 'react'
import { ChevronDown, Download, Eye, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { MebOgrenciBilgiFormu } from '@/types'
import {
  MEB_FOOTER,
  MEB_FAMILY_FIELDS,
  MEB_PARENT_FIELDS,
  MEB_STUDENT_FIELDS,
  buildMebFormLayout,
  type MebFieldDef,
} from '@/lib/mebBilgiFormuFields'
import { exportMebBilgiFormuExcel } from '@/lib/mebBilgiFormuPrint'
import { toast } from '@/hooks/use-toast'

function FieldBlock({
  field,
  value,
  onChange,
}: {
  field: MebFieldDef
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[11px] leading-tight text-muted-foreground font-medium">{field.label}</Label>
      {field.multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="min-h-[48px] text-sm py-1.5"
        />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
      )}
    </div>
  )
}

function FieldGroup({
  title,
  fields,
  data,
  onPatch,
}: {
  title: string
  fields: MebFieldDef[]
  data: MebOgrenciBilgiFormu
  onPatch: (key: keyof MebOgrenciBilgiFormu, value: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-teal-800/80">{title}</div>
      {fields.map((field) => (
        <FieldBlock
          key={field.key}
          field={field}
          value={data[field.key] ?? ''}
          onChange={(value) => onPatch(field.key, value)}
        />
      ))}
    </div>
  )
}

function PreviewLabel({ children }: { children: string }) {
  return <td className="py-1.5 px-2 border border-slate-200 align-top text-[10px] text-slate-500 w-[22%]">{children}</td>
}

function PreviewValue({ children, colSpan }: { children: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className="py-1.5 px-2 border border-slate-200 align-top text-sm whitespace-pre-wrap break-words">
      {children || '—'}
    </td>
  )
}

type MebBilgiFormuCardProps = {
  value?: MebOgrenciBilgiFormu
  onChange: (next: MebOgrenciBilgiFormu) => void
  adSoyad: string
  ogrenciNo: string
  sinifAdi: string
}

export function MebBilgiFormuCard({ value, onChange, adSoyad, ogrenciNo, sinifAdi }: MebBilgiFormuCardProps) {
  const [open, setOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const data = value ?? {}
  const filled = Object.values(data).some((v) => typeof v === 'string' && v.trim() !== '')
  const layoutRows = buildMebFormLayout(data)

  const patch = (key: keyof MebOgrenciBilgiFormu, nextValue: string) => {
    onChange({ ...data, [key]: nextValue })
  }

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      await exportMebBilgiFormuExcel({
        adSoyad,
        ogrenciNo,
        sinifAdi,
        data,
      })
    } catch {
      toast({ title: 'Excel indirilemedi', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card className="border-teal-400/80 border-2 bg-teal-50/10 shadow-md">
      <div
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left cursor-pointer"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold truncate">MEB Öğrenci Bilgi Formu</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPreviewOpen(true)
              }}
              className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md border border-teal-200 bg-white/80 text-teal-800 hover:bg-teal-50"
              aria-label="Önizleme göster"
              title="Göster"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void handleExport()
              }}
              disabled={exporting}
              className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md border border-teal-200 bg-white/80 text-teal-800 hover:bg-teal-50 disabled:opacity-60"
              aria-label="Formu Excel olarak indir"
              title="Excel indir"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {filled ? 'Kayıtlı bilgi var · düzenlemek için açın' : 'Gizli alan · tıklayınca açılır'}
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-teal-700 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <CardContent className="pt-0 pb-3 px-4 space-y-3">
          <FieldGroup title="Öğrenci bilgileri" fields={MEB_STUDENT_FIELDS} data={data} onPatch={patch} />
          <FieldGroup title="Veli bilgileri" fields={MEB_PARENT_FIELDS} data={data} onPatch={patch} />
          <FieldGroup title="Aile bilgisi" fields={MEB_FAMILY_FIELDS} data={data} onPatch={patch} />
          <p className="text-[9px] leading-[1.15] text-muted-foreground whitespace-pre-line">{MEB_FOOTER}</p>
        </CardContent>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[95vw] w-full p-4 gap-3">
          <DialogHeader>
            <DialogTitle>MEB Öğrenci Bilgi Formu</DialogTitle>
            <DialogDescription className="sr-only">Excel raporuyla aynı tablo görünümü</DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[min(70dvh,640px)] rounded-lg border border-border">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  <th colSpan={4} className="bg-[#1F4E78] text-white font-bold text-center py-3 px-3">
                    MEB Öğrenci Bilgi Formu
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-1.5 px-2 border border-slate-200 text-[10px] text-slate-500">Adı soyadı</td>
                  <td className="py-1.5 px-2 border border-slate-200 font-semibold">{adSoyad || '—'}</td>
                  <td className="py-1.5 px-2 border border-slate-200 text-[10px] text-slate-500">Öğrenci no</td>
                  <td className="py-1.5 px-2 border border-slate-200 font-semibold">{ogrenciNo || '—'}</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-2 border border-slate-200 text-[10px] text-slate-500">Sınıf</td>
                  <td colSpan={3} className="py-1.5 px-2 border border-slate-200 font-semibold">{sinifAdi || '—'}</td>
                </tr>
                {layoutRows.map((row, i) => {
                  if (row.kind === 'section') {
                    return (
                      <tr key={`s-${i}`}>
                        <th colSpan={4} className="bg-blue-500 text-white font-semibold text-left py-2 px-2 border border-blue-400/40">
                          {row.title}
                        </th>
                      </tr>
                    )
                  }
                  if (row.full || !row.right) {
                    return (
                      <tr key={`p-${i}`} className="odd:bg-white even:bg-slate-50/60">
                        <PreviewLabel>{row.left.label}</PreviewLabel>
                        <PreviewValue colSpan={3}>{row.left.value}</PreviewValue>
                      </tr>
                    )
                  }
                  return (
                    <tr key={`p-${i}`} className="odd:bg-white even:bg-slate-50/60">
                      <PreviewLabel>{row.left.label}</PreviewLabel>
                      <PreviewValue>{row.left.value}</PreviewValue>
                      <PreviewLabel>{row.right.label}</PreviewLabel>
                      <PreviewValue>{row.right.value}</PreviewValue>
                    </tr>
                  )
                })}
                <tr>
                  <td colSpan={4} className="py-2 px-2 border border-slate-200 text-[9px] leading-[1.15] text-slate-500 whitespace-pre-line">
                    {MEB_FOOTER}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Kapat</Button>
            <Button onClick={() => void handleExport()} disabled={exporting}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Excel İndir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
