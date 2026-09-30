import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Loader2, Search, X } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { LessonSlotHeader } from '@/components/LessonSlotHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OfflineImage } from '@/components/ui/OfflineImage'
import { useClassRoster } from '@/hooks/useClassRoster'
import { useFuseStudentSearch } from '@/hooks/useFuseStudentSearch'
import {
  attendanceSessionKey,
  findPreviousLessonSession,
  normalizeTime,
  useAttendanceHistory,
  useClassAttendance,
} from '@/hooks/useClassAttendance'
import { useProgramLessonNavigation } from '@/hooks/useProgramLessonNavigation'
import { toast } from '@/hooks/use-toast'
import { useBellSchedule } from '@/hooks/useTimetables'
import { formatClassName } from '@/lib/utils'
import { cn } from '@/lib/utils'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function nowLocal() {
  const d = new Date()
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

export default function ClassAttendancePage() {
  const navigate = useNavigate()
  const { sinifAdi: raw = '' } = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const sinifAdi = formatClassName(decodeURIComponent(raw))
  const now = useMemo(() => nowLocal(), [])
  const dateParam = searchParams.get('tarih')
  const timeParam = searchParams.get('saat')
  const [date, setDate] = useState(dateParam || now.date)
  const [time, setTime] = useState(timeParam ? normalizeTime(timeParam) : now.time)
  const fromHistory = (location.state as { from?: string } | null)?.from
  const historyBack = fromHistory?.includes('/yoklamalar') ? fromHistory : ''
  useEffect(() => {
    if (dateParam) setDate(dateParam)
    if (timeParam) setTime(normalizeTime(timeParam))
  }, [dateParam, timeParam])

  const { rows, loading: rosterLoading } = useClassRoster(sinifAdi)
  const { schedule: bellSchedule } = useBellSchedule()
  const { sessions: historySessions, loading: historyLoading } = useAttendanceHistory(bellSchedule)
  const { marks, loading: marksLoading, setMark, replaceMarks, lessonPeriod } = useClassAttendance(
    sinifAdi,
    date,
    time,
    bellSchedule,
  )
  const [copyingPrevious, setCopyingPrevious] = useState(false)

  const currentSessionKey = useMemo(
    () => attendanceSessionKey(sinifAdi, date, time),
    [sinifAdi, date, time],
  )

  const previousLessonSession = useMemo(
    () =>
      findPreviousLessonSession(
        historySessions,
        sinifAdi,
        date,
        time,
        lessonPeriod,
        currentSessionKey,
        bellSchedule,
      ),
    [historySessions, sinifAdi, date, time, lessonPeriod, currentSessionKey, bellSchedule],
  )

  const programNav = useProgramLessonNavigation({
    sinifAdi,
    date,
    time,
    lessonPeriod,
  })

  const goToAttendanceSlot = (slot: { date: string; time: string }) => {
    navigate(
      `/classes/${encodeURIComponent(sinifAdi)}/yoklama?tarih=${encodeURIComponent(slot.date)}&saat=${encodeURIComponent(normalizeTime(slot.time))}`,
      { replace: true, state: location.state },
    )
  }

  const applyPreviousLesson = async () => {
    if (!previousLessonSession) return
    setCopyingPrevious(true)
    try {
      await replaceMarks({ ...previousLessonSession.marks })
      const label =
        previousLessonSession.lessonPeriod != null
          ? `${previousLessonSession.lessonPeriod}. ders`
          : previousLessonSession.time
      toast({ title: `${label} yoklaması uygulandı` })
    } catch {
      toast({ title: 'Yoklama kopyalanamadı', variant: 'destructive' })
    } finally {
      setCopyingPrevious(false)
    }
  }

  const { query: studentSearch, setQuery: setStudentSearch, filtered: displayedRows } =
    useFuseStudentSearch(rows)

  const dCount = Object.values(marks).filter((m) => m === 'D').length
  const gCount = Object.values(marks).filter((m) => m === 'G').length
  const loading = rosterLoading || marksLoading

  return (
    <Layout
      title={`${sinifAdi} yoklama`}
      showBack
      backTo={historyBack || '/classes'}
      backTitle={historyBack ? 'Yoklama defteri' : 'Sınıflarım'}
    >
      <div className="space-y-4 pb-32">
        <LessonSlotHeader
          lessonPeriod={lessonPeriod}
          date={date}
          time={time}
          onDateChange={setDate}
          onTimeChange={setTime}
          onPrevLesson={() => programNav.prev && goToAttendanceSlot(programNav.prev)}
          onNextLesson={() => programNav.next && goToAttendanceSlot(programNav.next)}
          prevLessonDisabled={!programNav.prev}
          nextLessonDisabled={!programNav.next}
          prevLessonLabel={programNav.prev?.label}
          nextLessonLabel={programNav.next?.label}
        />

        <div className={!loading && rows.length > 0 ? 'space-y-1' : undefined}>
          {!loading && rows.length > 0 ? (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Akıllı arama (ad, no, PC)..."
                className="pl-9 pr-9"
                autoComplete="off"
              />
              {studentSearch ? (
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setStudentSearch('')}
                  aria-label="Aramayı temizle"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ) : null}

          <p className="text-sm text-muted-foreground">
            {rows.length} öğrenci
            {!loading && (dCount > 0 || gCount > 0) ? ` · ${dCount} D · ${gCount} G` : ''}
            {!loading && studentSearch.trim() ? ` · ${displayedRows.length} eşleşme` : ''}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              Bu sınıfa ait kayıtlı öğrenci listesi yok.
            </CardContent>
          </Card>
        ) : displayedRows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              Aramanızla eşleşen öğrenci yok.
            </CardContent>
          </Card>
        ) : (
          <div>
            <div className="flex items-center gap-3 py-0 mb-1">
              <div className="w-10 shrink-0" aria-hidden />
              <div className="flex-1 min-w-0" />
              <button
                type="button"
                disabled={!previousLessonSession || copyingPrevious || historyLoading}
                title={
                  previousLessonSession
                    ? 'Önceki dersin D/G işaretlerini bu yoklamaya kopyalar'
                    : 'Bu sınıf için önceki ders yoklaması bulunamadı'
                }
                className="shrink-0 p-0 h-auto text-[10px] leading-none whitespace-nowrap text-primary underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                onClick={() => void applyPreviousLesson()}
              >
                {copyingPrevious ? '…' : 'Önceki Dersi Uygula'}
              </button>
            </div>
            <div className="space-y-2">
            {displayedRows.map((s) => {
              const mark = marks[s.no]
              return (
                <Card key={s.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
                      {s.foto ? (
                        s.foto.startsWith('blob:') ? (
                          <img src={s.foto} alt={s.adSoyad} className="w-full h-full object-cover" />
                        ) : (
                          <OfflineImage src={s.foto} alt={s.adSoyad} className="w-full h-full object-cover" />
                        )
                      ) : (
                        <span className="text-primary font-semibold text-xs">
                          {s.adSoyad.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{s.adSoyad}</p>
                      <p className="text-xs text-muted-foreground">
                        No: {s.no}
                        {s.pcNo ? ` · ${s.pcNo}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        size="icon"
                        variant={mark === 'D' ? 'destructive' : 'outline'}
                        className="h-9 w-9 text-xs font-bold"
                        onClick={() => setMark(s.no, 'D')}
                        title="Devamsız"
                      >
                        D
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className={cn(
                          'h-9 w-9 text-xs font-bold',
                          mark === 'G' && 'bg-amber-500 text-white border-amber-500 hover:bg-amber-500/90 hover:text-white',
                        )}
                        onClick={() => setMark(s.no, 'G')}
                        title="Geç"
                      >
                        G
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            </div>
          </div>
        )}
      </div>

    </Layout>
  )
}
