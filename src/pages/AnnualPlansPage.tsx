import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Loader2, Upload } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AnnualPlanBanner } from '@/components/AnnualPlanBanner'
import { useCourses } from '@/hooks/useCourses'
import { parseAnnualPlanDocx, findPlanItemForDate, formatPlanRange } from '@/lib/annualPlanParser'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { AnnualPlan } from '@/types'

export default function AnnualPlansPage() {
  const navigate = useNavigate()
  const { courses, loading, updateCourse } = useCourses()
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [weekIndex, setWeekIndex] = useState(0)
  const [parsing, setParsing] = useState(false)

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
          <div className="-mx-4 px-4 overflow-x-auto [scrollbar-width:thin]">
            <div className="flex items-center gap-2 pb-1">
              {sortedCourses.map((course) => {
                const hasPlan = !!course.annualPlan?.items.length
                const active = course.id === selectedId
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => setSelectedId(course.id)}
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
          </div>

          {items.length > 0 ? (
            <>
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
            </>
          ) : (
            <Card>
              <CardContent className="py-8 flex flex-col items-center text-center gap-3">
                <CalendarDays className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Bu derse henüz plan yüklenmedi.</p>
                <Button type="button" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Word yükle
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </Layout>
  )
}
