import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ClipboardList, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAttendanceHistory, type AttendanceSessionSummary } from '@/hooks/useClassAttendance'
import { useClassRoster, type ClassRosterRow } from '@/hooks/useClassRoster'
import { OfflineImage } from '@/components/ui/OfflineImage'
import { useBellSchedule } from '@/hooks/useTimetables'
import { toast } from '@/hooks/use-toast'
import type { AttendanceMark } from '@/types'
import { cn, formatClassName, getClassColor } from '@/lib/utils'

function formatTrDate(iso: string) {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}

type MarkPanel = {
  session: AttendanceSessionSummary
  mark: AttendanceMark
}

type PanelStudent = {
  no: string
  adSoyad: string
  foto?: string
  studentId?: string
}

function listedStudents(
  session: AttendanceSessionSummary,
  mark: AttendanceMark,
  rosterByNo: Map<string, ClassRosterRow>,
  courseId: string,
): PanelStudent[] {
  return Object.entries(session.marks)
    .filter(([, m]) => m === mark)
    .map(([no]) => {
      const row = rosterByNo.get(no)
      const canProfile = Boolean(courseId && row?.id && !row.id.startsWith('tpl-'))
      return {
        no,
        adSoyad: row?.adSoyad ?? `No ${no}`,
        foto: row?.foto,
        studentId: canProfile ? row!.id : undefined,
      }
    })
    .sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'))
}

export default function AttendanceHistoryPage() {
  const navigate = useNavigate()
  const { sinifAdi: raw = '' } = useParams()
  const sinifAdi = formatClassName(decodeURIComponent(raw))
  const { schedule: bellSchedule } = useBellSchedule()
  const { sessions, loading, deleteSession, removeStudentMark } = useAttendanceHistory(bellSchedule)
  const { rows: rosterRows, sourceCourseId } = useClassRoster(sinifAdi)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AttendanceSessionSummary | null>(null)
  const [markPanel, setMarkPanel] = useState<MarkPanel | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [removingNo, setRemovingNo] = useState<string | null>(null)
  const defterPath = `/classes/${encodeURIComponent(sinifAdi)}/yoklamalar`

  const panelSession = useMemo(() => {
    if (!markPanel) return null
    return sessions.find((s) => s.key === markPanel.session.key) ?? markPanel.session
  }, [markPanel, sessions])

  useEffect(() => {
    if (markPanel && !sessions.some((s) => s.key === markPanel.session.key)) {
      setMarkPanel(null)
    }
  }, [sessions, markPanel])

  const rosterByNo = useMemo(() => {
    const map = new Map<string, ClassRosterRow>()
    for (const r of rosterRows) map.set(r.no, r)
    return map
  }, [rosterRows])

  const panelStudents = useMemo(() => {
    if (!markPanel || !panelSession) return []
    return listedStudents(panelSession, markPanel.mark, rosterByNo, sourceCourseId)
  }, [markPanel, panelSession, rosterByNo, sourceCourseId])

  const openStudentProfile = (studentId: string) => {
    if (!sourceCourseId) return
    setMarkPanel(null)
    navigate(`/courses/${sourceCourseId}/students/${studentId}`)
  }

  const removeFromPanel = async (no: string) => {
    if (!panelSession) return
    setRemovingNo(no)
    try {
      await removeStudentMark(panelSession, no)
    } catch {
      toast({ title: 'İşaret kaldırılamadı', variant: 'destructive' })
    } finally {
      setRemovingNo(null)
    }
  }

  const classSessions = useMemo(
    () => sessions.filter((s) => formatClassName(s.sinifAdi) === sinifAdi),
    [sessions, sinifAdi],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return classSessions
    return classSessions.filter(
      (s) => formatTrDate(s.date).includes(q) || s.date.includes(q) || s.time.includes(q),
    )
  }, [classSessions, search])

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const s of filtered) {
      const list = map.get(s.date) ?? []
      list.push(s)
      map.set(s.date, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const openSession = (s: AttendanceSessionSummary) => {
    navigate(
      `/classes/${encodeURIComponent(s.sinifAdi)}/yoklama?tarih=${encodeURIComponent(s.date)}&saat=${encodeURIComponent(s.time)}`,
      { state: { from: defterPath } },
    )
  }

  const startNewAttendance = () => {
    navigate(`/classes/${encodeURIComponent(sinifAdi)}/yoklama`, { state: { from: defterPath } })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSession(deleteTarget.key)
      toast({ title: 'Yoklama silindi' })
      setDeleteTarget(null)
    } catch {
      toast({ title: 'Yoklama silinemedi', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Layout title={`${sinifAdi} yoklamaları`} showBack backTo="/classes" backTitle="Sınıflarım">
      <div className="space-y-6 pb-32">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tarih veya saat ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
            <p className="text-muted-foreground">
              {search ? 'Arama sonucu bulunamadı.' : 'Bu sınıfa ait yoklama kaydı yok.'}
            </p>
          </div>
        ) : (
          groups.map(([date, items]) => (
            <section key={date} className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">{formatTrDate(date)}</h2>
              {items.map((s) => (
                <Card
                  key={s.key}
                  className={`border-l-4 ${getClassColor(s.sinifAdi)}`}
                >
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        {s.lessonPeriod != null ? (
                          <span className="text-base font-semibold text-primary">{s.lessonPeriod}. ders</span>
                        ) : null}
                        <span
                          className={
                            s.lessonPeriod != null
                              ? 'text-sm font-normal text-muted-foreground tabular-nums'
                              : 'text-base font-semibold tabular-nums'
                          }
                        >
                          {s.time}
                        </span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setMarkPanel({ session: s, mark: 'D' })}
                        >
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-[10px] h-5 px-1.5 cursor-pointer hover:bg-destructive/15 hover:text-destructive',
                              s.dCount > 0 && 'border-destructive/30',
                            )}
                          >
                            {s.dCount} D
                          </Badge>
                        </button>
                        <button
                          type="button"
                          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setMarkPanel({ session: s, mark: 'G' })}
                        >
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-[10px] h-5 px-1.5 cursor-pointer hover:bg-amber-500/15 hover:text-amber-700 dark:hover:text-amber-400',
                              s.gCount > 0 && 'border-amber-500/30',
                            )}
                          >
                            {s.gCount} G
                          </Badge>
                        </button>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-foreground"
                        aria-label="Yoklamayı düzenle"
                        onClick={() => openSession(s)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        aria-label="Yoklamayı sil"
                        onClick={() => setDeleteTarget(s)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>
          ))
        )}
      </div>

      <Dialog open={!!markPanel} onOpenChange={(open) => !open && setMarkPanel(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {markPanel?.mark === 'D' ? 'Devamsızlar' : 'Geç gelenler'}
              {markPanel ? ` (${panelStudents.length})` : ''}
            </DialogTitle>
            <DialogDescription>
              {markPanel && panelSession
                ? `${formatTrDate(panelSession.date)}${
                    panelSession.lessonPeriod != null
                      ? ` · ${panelSession.lessonPeriod}. ders · ${panelSession.time}`
                      : ` · ${panelSession.time}`
                  }`
                : undefined}
            </DialogDescription>
          </DialogHeader>
          {panelStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              {markPanel?.mark === 'D' ? 'Devamsız işaretli öğrenci yok.' : 'Geç işaretli öğrenci yok.'}
            </p>
          ) : (
            <ul className="max-h-[min(50vh,320px)] overflow-y-auto divide-y rounded-md border">
              {panelStudents.map((st) => (
                <li key={st.no} className="px-3 py-2.5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
                    {st.foto ? (
                      st.foto.startsWith('blob:') ? (
                        <img src={st.foto} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <OfflineImage src={st.foto} alt="" className="w-full h-full object-cover" />
                      )
                    ) : (
                      <span className="text-primary font-semibold text-xs">
                        {st.adSoyad
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {st.studentId ? (
                      <button
                        type="button"
                        className="font-medium text-sm text-left text-primary hover:underline truncate block w-full"
                        onClick={() => openStudentProfile(st.studentId!)}
                      >
                        {st.adSoyad}
                      </button>
                    ) : (
                      <p className="font-medium text-sm truncate">{st.adSoyad}</p>
                    )}
                    <p className="text-xs text-muted-foreground">No {st.no}</p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 font-bold text-xs w-4',
                      markPanel?.mark === 'D' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400',
                    )}
                  >
                    {markPanel?.mark}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`${st.adSoyad} işaretini kaldır`}
                    disabled={removingNo === st.no}
                    onClick={() => void removeFromPanel(st.no)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <button
        type="button"
        onClick={startNewAttendance}
        className="fixed bottom-28 right-4 md:right-8 w-14 h-14 rounded-full transition-all duration-200 z-[110] bg-gradient-to-b from-blue-400 to-blue-600 text-white border-t border-blue-300/50 shadow-[inset_0_-4px_6px_rgba(0,0,0,0.3),inset_0_2px_4px_rgba(255,255,255,0.3),0_6px_12px_rgba(37,99,235,0.4)] hover:from-blue-400 hover:to-blue-500 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.4),0_2px_4px_rgba(37,99,235,0.4)] active:from-blue-500 active:to-blue-600 flex items-center justify-center"
        aria-label="Yeni yoklama"
      >
        <Plus size={28} strokeWidth={2.5} className="drop-shadow-md" />
      </button>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
        title="Yoklama silinsin mi?"
        description={
          deleteTarget
            ? `${formatTrDate(deleteTarget.date)} · ${deleteTarget.time} yoklaması kalıcı olarak silinir.`
            : undefined
        }
        confirmText={deleting ? 'Siliniyor…' : 'Sil'}
        variant="destructive"
        onConfirm={() => void confirmDelete()}
      />
    </Layout>
  )
}
