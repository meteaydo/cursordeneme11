import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteField, doc, updateDoc } from 'firebase/firestore'
import { CalendarDays, Loader2, Plus, Trash2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { AnnualPlanBanner } from '@/components/AnnualPlanBanner'
import { useCourses } from '@/hooks/useCourses'
import { db } from '@/lib/firebase'
import { parseAnnualPlanDocx, findPlanItemForDate, formatPlanRange } from '@/lib/annualPlanParser'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { AnnualPlan } from '@/types'

type PlanContextMenuState = { x: number; y: number; courseId: string }

const planAddButtonClass =
  'shrink-0 w-10 h-10 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 text-white border border-blue-500/30 shadow-[0_4px_10px_rgba(37,99,235,0.45)] hover:from-blue-400 hover:to-blue-500 active:from-blue-500 active:to-blue-600 active:shadow-[0_2px_6px_rgba(37,99,235,0.4)] flex items-center justify-center'

export default function AnnualPlansPage() {
  const navigate = useNavigate()
  const { courses, loading, updateCourse } = useCourses()
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [weekIndex, setWeekIndex] = useState(0)
  const [parsing, setParsing] = useState(false)
  const [planContextMenu, setPlanContextMenu] = useState<PlanContextMenuState | null>(null)
  const [deletePlanCourseId, setDeletePlanCourseId] = useState<string | null>(null)
  const [deletingPlan, setDeletingPlan] = useState(false)

  const sortedCourses = useMemo(
    () =>
      [...courses].sort((a, b) => {
        const aPlan = a.annualPlan?.items.length ? 0 : 1
        const bPlan = b.annualPlan?.items.length ? 0 : 1
        if (aPlan !== bPlan) return aPlan - bPlan
        const classCmp = (a.sinifAdi || '').localeCompare(b.sinifAdi || '', 'tr', { numeric: true })
        if (classCmp !== 0) return classCmp
        return a.dersAdi.localeCompare(b.dersAdi, 'tr')
      }),
    [courses],
  )

  useEffect(() => {
    if (!sortedCourses.length) {
      setSelectedId(null)
      return
    }
    if (selectedId && sortedCourses.some((c) => c.id === selectedId)) return
    const withPlan = sortedCourses.find((c) => c.annualPlan?.items.length)
    setSelectedId((withPlan ?? sortedCourses[0]).id)
  }, [sortedCourses, selectedId])

  const selected = sortedCourses.find((c) => c.id === selectedId)
  const plan = selected?.annualPlan
  const items = plan?.items ?? []

  const todayIndex = useMemo(() => {
    const match = findPlanItemForDate(plan)
    if (!match || !plan) return 0
    const i = plan.items.findIndex(
      (row) => row.tarihBas === match.item.tarihBas && row.hafta === match.item.hafta,
    )
    return i >= 0 ? i : 0
  }, [plan])

  useEffect(() => {
    setWeekIndex(todayIndex)
  }, [selectedId, todayIndex])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selected) return
    setParsing(true)
    try {
      const parsed: AnnualPlan = await parseAnnualPlanDocx(file)
      await updateCourse(selected.id, { annualPlan: parsed })
      toast({ title: 'Yıllık plan kaydedildi', description: `${parsed.items.length} hafta · ${parsed.yil}` })
    } catch (err) {
      toast({
        title: 'Yıllık plan okunamadı',
        description: err instanceof Error ? err.message : 'Word belgesi beklenen MEB şablonunda değil.',
        variant: 'destructive',
      })
    } finally {
      setParsing(false)
    }
  }

  const openPlanContextMenu = (e: React.MouseEvent, courseId: string, hasPlan: boolean) => {
    if (!hasPlan) return
    e.preventDefault()
    e.stopPropagation()
    setPlanContextMenu({ x: e.clientX, y: e.clientY, courseId })
  }

  const requestDeletePlan = (courseId: string) => {
    setPlanContextMenu(null)
    setDeletePlanCourseId(courseId)
  }

  const confirmDeletePlan = async () => {
    if (!deletePlanCourseId) return
    setDeletingPlan(true)
    try {
      await updateDoc(doc(db, 'courses', deletePlanCourseId), { annualPlan: deleteField() })
      toast({ title: 'Yıllık plan silindi' })
      setDeletePlanCourseId(null)
    } catch {
      toast({ title: 'Silinemedi', variant: 'destructive' })
    } finally {
      setDeletingPlan(false)
    }
  }

  const triggerPlanUpload = () => {
    if (!selected) {
      toast({ title: 'Önce bir ders seçin', variant: 'destructive' })
      return
    }
    fileRef.current?.click()
  }

  const deletePlanCourse = deletePlanCourseId
    ? sortedCourses.find((c) => c.id === deletePlanCourseId)
    : undefined

  return (
    <Layout
      title="Yıllık Planlar"
      showBack={!!selected}
      backTitle="Uygulamaya Git"
      onBackClick={() => {
        if (!selected) return
        navigate(`/courses/${selected.id}`, {
          state: { courseName: selected.dersAdi, className: selected.sinifAdi },
        })
      }}
    >
      {parsing && (
        <div className="fixed inset-0 z-[600] bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="bg-card text-card-foreground p-6 rounded-2xl shadow-xl flex flex-col items-center max-w-sm w-full text-center space-y-4 border border-border">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold tracking-tight">Yıllık plan okunuyor</h3>
              <p className="text-sm text-muted-foreground">Word belgesindeki haftalık kazanımlar çıkarılıyor...</p>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleFile}
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : sortedCourses.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Henüz ders yok. Önce Derslerim’den bir ders ekleyin.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="-mx-4 px-4 py-1.5 -mt-4 border-b border-border/40">
            <div className="relative min-h-11 w-full">
              <div className="flex items-center gap-2 overflow-x-auto min-w-0 pr-11 [scrollbar-width:thin]">
                {sortedCourses.map((course) => {
                  const hasPlan = !!course.annualPlan?.items.length
                  const active = course.id === selectedId
                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => setSelectedId(course.id)}
                      onContextMenu={(e) => openPlanContextMenu(e, course.id, hasPlan)}
                      className={cn(
                        'shrink-0 text-left px-3 py-2 rounded-xl border text-sm transition-all',
                        active
                          ? 'bg-primary text-primary-foreground border-primary shadow-md'
                          : hasPlan
                            ? 'bg-white border-border hover:border-primary/50'
                            : 'bg-white/60 border-dashed border-border text-muted-foreground',
                      )}
                    >
                      <div className="font-medium truncate max-w-[140px]">{course.dersAdi}</div>
                      <div className={cn('text-[11px] mt-0.5 truncate', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                        {course.sinifAdi}
                        {hasPlan ? '' : ' · plansız'}
                      </div>
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={triggerPlanUpload}
                className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 ${planAddButtonClass} transition-all duration-200 hover:-translate-y-[calc(50%+2px)] active:translate-y-[calc(-50%+2px)]`}
                aria-label="Yıllık plan ekle"
              >
                <Plus size={24} strokeWidth={2.5} className="drop-shadow-md" />
              </button>
            </div>
          </div>

          {items.length > 0 ? (
            <>
              <div onContextMenu={(e) => selected && openPlanContextMenu(e, selected.id, true)}>
              <AnnualPlanBanner plan={plan} index={weekIndex} onIndexChange={setWeekIndex} />
              <div className="space-y-2 pb-4">
                {items.map((row, i) => (
                  <button
                    key={`${row.hafta}-${row.tarihBas}`}
                    type="button"
                    onClick={() => setWeekIndex(i)}
                    className={cn(
                      'w-full text-left rounded-lg border px-3 py-2.5 transition-colors',
                      i === weekIndex
                        ? 'bg-sky-100 border-sky-300 shadow-sm'
                        : 'bg-card border-border hover:bg-muted/40',
                    )}
                  >
                    <div className="text-[11px] font-semibold text-muted-foreground">
                      {row.hafta} · {formatPlanRange(row)}
                    </div>
                    <div className="text-sm font-medium mt-0.5">{row.konu || row.unite}</div>
                    {row.kazanim && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{row.kazanim}</div>
                    )}
                  </button>
                ))}
              </div>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 flex flex-col items-center text-center gap-3">
                <CalendarDays className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Bu derse henüz plan yüklenmedi.</p>
                <p className="text-xs text-muted-foreground">Üstteki + ile Word yükleyin.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {planContextMenu && (
        <>
          <div className="fixed inset-0 z-[250]" onPointerDown={() => setPlanContextMenu(null)} />
          <div
            className="fixed z-[260] min-w-[160px] rounded-xl border border-slate-200 bg-white shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-150"
            style={{ left: planContextMenu.x, top: planContextMenu.y }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 text-left"
              onClick={() => requestDeletePlan(planContextMenu.courseId)}
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              Planı sil
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!deletePlanCourseId}
        onOpenChange={(open) => {
          if (!open && !deletingPlan) setDeletePlanCourseId(null)
        }}
        title="Yıllık planı sil"
        description={
          deletePlanCourse
            ? `${deletePlanCourse.dersAdi} (${deletePlanCourse.sinifAdi}) dersindeki yıllık plan kaldırılacak.`
            : 'Bu dersin yıllık planı kaldırılacak.'
        }
        confirmText={deletingPlan ? 'Siliniyor…' : 'Sil'}
        variant="destructive"
        onConfirm={confirmDeletePlan}
      />
    </Layout>
  )
}
