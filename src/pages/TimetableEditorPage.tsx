import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, ClipboardPaste, Copy, Loader2, Pencil, Trash2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TimeInput24 } from '@/components/ui/time-input-24'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
import { useCourses } from '@/hooks/useCourses'
import { deleteTimetable, saveTimetable, useTimetable } from '@/hooks/useTimetables'
import {
  DEFAULT_TIMETABLE,
  TIMETABLE_DAYS,
  buildDaySlots,
  cellKey,
  fillEmptyCells,
  findLessonPeriodForTime,
  type FillAxis,
} from '@/lib/timetable'
import type { Course } from '@/types'
import { cn, formatClassName, formatTitleCase } from '@/lib/utils'

const CELL_GRADES = ['9', '10', '11', '12']
const CELL_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

function parseCellLesson(text: string) {
  const trimmed = text.trim()
  const match = trimmed.match(/^(.*?)(?:\s*[-–]\s*|\s+)(9|10|11|12)\s*([A-G])$/i)
  if (!match) return { name: trimmed, grade: '', section: '' }
  const section = match[3].toLocaleUpperCase('tr-TR')
  if (!CELL_SECTIONS.includes(section)) return { name: trimmed, grade: '', section: '' }
  return { name: match[1].trim(), grade: match[2], section }
}

function formatCellLesson(name: string, grade: string, section: string) {
  const title = name.trim()
  const klass = grade && section ? `${grade}${section}` : ''
  if (title && klass) return `${title} - ${klass}`
  return title || klass
}

function courseListTitle(course: Course) {
  return [course.dersAdi, course.sinifAdi].map((part) => (part ?? '').trim()).filter(Boolean).join(' - ')
}

function findCourseIdForCell(text: string, courses: Course[]): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const exact = courses.find((c) => courseListTitle(c) === trimmed)
  if (exact) return exact.id

  const parsed = parseCellLesson(trimmed)
  const cellClass = parsed.grade && parsed.section ? `${parsed.grade}${parsed.section}` : ''
  if (!parsed.name || !cellClass) return null

  const match = courses.find(
    (c) =>
      (c.dersAdi ?? '').trim().localeCompare(parsed.name, 'tr', { sensitivity: 'base' }) === 0 &&
      formatClassName(c.sinifAdi ?? '') === formatClassName(cellClass),
  )
  return match?.id ?? null
}

function saveFailReason(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  if (code.includes('permission-denied')) {
    return 'Sunucu bu kayda izin vermiyor.'
  }
  if (code.includes('unauthenticated')) return 'Oturum kapalı. Tekrar giriş yapın.'
  if (code.includes('unavailable')) return 'Bağlantı kurulamadı.'
  if (error instanceof Error && error.message) return error.message
  return 'Bilinmeyen bir hata.'
}

type FormState = {
  teacherName: string
  startTime: string
  lessonMinutes: number
  breakMinutes: number
  lunchMinutes: number
  lessonsPerDay: number
  cells: Record<string, string>
}

type FillDrag = {
  sourceDay: number
  sourcePeriod: number
  axis: FillAxis | null
  targetDay: number
  targetPeriod: number
}

type FillSession = FillDrag & {
  pointerId: number
  startX: number
  startY: number
  cancelled: boolean
}

function formSnapshot(form: FormState) {
  const cells: Record<string, string> = {}
  for (const [key, value] of Object.entries(form.cells)) {
    const text = value.trim()
    if (text) cells[key] = text
  }
  return JSON.stringify({
    teacherName: form.teacherName.trim(),
    startTime: form.startTime,
    lessonMinutes: form.lessonMinutes,
    breakMinutes: form.breakMinutes,
    lunchMinutes: form.lunchMinutes,
    lessonsPerDay: form.lessonsPerDay,
    cells,
  })
}

function SettingField({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function clamp(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function TimetableSettingsFields({
  form,
  setForm,
}: {
  form: FormState
  setForm: Dispatch<SetStateAction<FormState>>
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
      <SettingField label="Öğretmen adı" htmlFor="ogretmen-dialog" className="col-span-2 sm:col-span-3">
        <Input
          id="ogretmen-dialog"
          className="h-9"
          value={form.teacherName}
          onChange={(e) => setForm((f) => ({ ...f, teacherName: e.target.value }))}
          placeholder="İsteğe bağlı"
        />
      </SettingField>
      <SettingField label="Başlangıç" htmlFor="baslangic-dialog">
        <TimeInput24
          id="baslangic-dialog"
          className="w-full [&_button]:h-9 [&_button]:px-2"
          value={form.startTime}
          onChange={(startTime) => setForm((f) => ({ ...f, startTime }))}
        />
      </SettingField>
      <SettingField label="Süre (dk)" htmlFor="sure-dialog">
        <Input
          id="sure-dialog"
          className="h-9 px-2 tabular-nums"
          type="number"
          min={1}
          max={180}
          value={form.lessonMinutes}
          onChange={(e) =>
            setForm((f) => ({ ...f, lessonMinutes: clamp(Number(e.target.value), 1, 180, 40) }))
          }
        />
      </SettingField>
      <SettingField label="Teneffüs" htmlFor="teneffus-dialog">
        <Input
          id="teneffus-dialog"
          className="h-9 px-2 tabular-nums"
          type="number"
          min={0}
          max={60}
          value={form.breakMinutes}
          onChange={(e) =>
            setForm((f) => ({ ...f, breakMinutes: clamp(Number(e.target.value), 0, 60, 10) }))
          }
        />
      </SettingField>
      <SettingField label="Öğle (dk)" htmlFor="ogle-dialog">
        <Input
          id="ogle-dialog"
          className="h-9 px-2 tabular-nums"
          type="number"
          min={0}
          max={180}
          value={form.lunchMinutes}
          onChange={(e) =>
            setForm((f) => ({ ...f, lunchMinutes: clamp(Number(e.target.value), 0, 180, 60) }))
          }
        />
      </SettingField>
      <SettingField label="Günlük ders" htmlFor="adet-dialog">
        <Input
          id="adet-dialog"
          className="h-9 px-2 tabular-nums"
          type="number"
          min={1}
          max={14}
          value={form.lessonsPerDay}
          onChange={(e) =>
            setForm((f) => ({ ...f, lessonsPerDay: clamp(Number(e.target.value), 1, 14, 10) }))
          }
        />
      </SettingField>
    </div>
  )
}

function cellFromPoint(x: number, y: number) {
  const list =
    typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(x, y)
      : [document.elementFromPoint(x, y)].filter((node): node is Element => node instanceof Element)
  for (const node of list) {
    if (!(node instanceof Element)) continue
    const cell = node.closest('[data-timetable-cell]')
    if (!(cell instanceof HTMLElement)) continue
    const day = Number(cell.dataset.day)
    const period = Number(cell.dataset.period)
    if (!Number.isInteger(day) || !Number.isInteger(period)) continue
    return { day, period }
  }
  return null
}

export default function TimetableEditorPage() {
  const { id } = useParams()
  const isNew = !id || id === 'yeni'
  const navigate = useNavigate()
  const { user } = useAuth()
  const { courses } = useCourses()
  const { item, loading } = useTimetable(isNew ? undefined : id)
  const [form, setForm] = useState<FormState>({
    teacherName: '',
    ...DEFAULT_TIMETABLE,
    cells: {},
  })
  const [saving, setSaving] = useState(false)
  const [savedSnap, setSavedSnap] = useState(() =>
    formSnapshot({
      teacherName: '',
      ...DEFAULT_TIMETABLE,
      cells: {},
    }),
  )
  const [hasSaved, setHasSaved] = useState(false)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | undefined>(isNew ? undefined : id)
  const [cellOpen, setCellOpen] = useState<{ day: number; period: number } | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftGrade, setDraftGrade] = useState('')
  const [draftSection, setDraftSection] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cellMenu, setCellMenu] = useState<{ x: number; y: number; day: number; period: number } | null>(
    null,
  )
  const [copiedLesson, setCopiedLesson] = useState<string | null>(null)
  const [drag, setDrag] = useState<FillDrag | null>(null)
  const hydrated = useRef(false)
  const formRef = useRef(form)
  const dragRef = useRef<FillSession | null>(null)
  const draggedRef = useRef(false)
  const menuOpenedRef = useRef(false)
  const dragToken = useRef(0)
  const saveSeq = useRef(0)
  const stopDragListeners = useRef<(() => void) | null>(null)
  formRef.current = form

  useEffect(() => {
    if (isNew || !item || hydrated.current) return
    hydrated.current = true
    const next = {
      teacherName: item.teacherName,
      startTime: item.startTime,
      lessonMinutes: item.lessonMinutes,
      breakMinutes: item.breakMinutes,
      lunchMinutes: item.lunchMinutes,
      lessonsPerDay: item.lessonsPerDay,
      cells: item.cells ?? {},
    }
    setForm(next)
    setSavedSnap(formSnapshot(next))
    setHasSaved(true)
    setOwnerId(item.ownerId)
    setSavedId(item.id)
  }, [isNew, item])

  const slots = useMemo(() => buildDaySlots(form), [form])
  const [nowTick, setNowTick] = useState(() => new Date())

  useEffect(() => {
    const tick = () => setNowTick(new Date())
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [])

  const activeDayIndex = useMemo(() => {
    const weekday = nowTick.getDay()
    if (weekday < 1 || weekday > 5) return null
    return weekday - 1
  }, [nowTick])

  const activeLessonPeriod = useMemo(() => {
    if (activeDayIndex == null) return null
    const time = `${pad(nowTick.getHours())}:${pad(nowTick.getMinutes())}`
    return findLessonPeriodForTime(form, time)
  }, [nowTick, form, activeDayIndex])
  const lessonNames = useMemo(() => {
    const names = new Set<string>()
    for (const course of courses) {
      const title = [course.dersAdi, course.sinifAdi].map((part) => (part ?? '').trim()).filter(Boolean).join(' - ')
      if (title) names.add(title)
    }
    for (const value of Object.values(form.cells)) {
      const text = value.trim()
      if (text) names.add(text)
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'tr'))
  }, [courses, form.cells])

  const persist = async (next: FormState, quiet = false) => {
    if (!user) return null
    const seq = ++saveSeq.current
    setSaving(true)
    try {
      const nextId = await saveTimetable(savedId, ownerId || user.uid, {
        teacherName: next.teacherName.trim(),
        startTime: next.startTime,
        lessonMinutes: next.lessonMinutes,
        breakMinutes: next.breakMinutes,
        lunchMinutes: next.lunchMinutes,
        lessonsPerDay: next.lessonsPerDay,
        cells: next.cells,
      })
      if (seq !== saveSeq.current) return nextId
      setSavedId(nextId)
      if (!ownerId) setOwnerId(user.uid)
      setSavedSnap(formSnapshot(next))
      setHasSaved(true)
      hydrated.current = true
      if (isNew) navigate(`/ders-programlari/${nextId}`, { replace: true })
      return nextId
    } catch (error) {
      console.error(error)
      if (!quiet) {
        toast({
          title: 'Program kaydedilemedi',
          description: saveFailReason(error),
          variant: 'destructive',
          duration: 6000,
        })
      }
      return null
    } finally {
      if (seq === saveSeq.current) setSaving(false)
    }
  }

  const openCell = (day: number, period: number) => {
    const parsed = parseCellLesson(form.cells[cellKey(day, period)] ?? '')
    setDraftName(parsed.name)
    setDraftGrade(parsed.grade)
    setDraftSection(parsed.section)
    setCellOpen({ day, period })
  }

  const saveCell = async () => {
    if (!cellOpen) return
    const key = cellKey(cellOpen.day, cellOpen.period)
    const cells = { ...form.cells }
    const text = formatCellLesson(draftName, draftGrade, draftSection)
    if (text) cells[key] = text
    else delete cells[key]
    const next = { ...form, cells }
    setForm(next)
    setCellOpen(null)
  }

  const persistRef = useRef(persist)
  persistRef.current = persist

  const writeCell = async (day: number, period: number, text: string) => {
    const base = formRef.current
    const cells = { ...base.cells }
    const value = text.trim()
    const key = cellKey(day, period)
    if (value) cells[key] = value
    else delete cells[key]
    if (cells[key] === base.cells[key]) return
    const next = { ...base, cells }
    formRef.current = next
    setForm(next)
  }

  useEffect(() => {
    if (formSnapshot(form) === savedSnap) return
    const timer = window.setTimeout(() => {
      void persistRef.current(formRef.current, true)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [form, savedSnap])

  const openCellMenu = (event: React.MouseEvent, day: number, period: number) => {
    event.preventDefault()
    const text = formRef.current.cells[cellKey(day, period)] ?? ''
    if (!text && !copiedLesson) return
    menuOpenedRef.current = true
    window.setTimeout(() => {
      menuOpenedRef.current = false
    }, 400)
    const width = 176
    const height = text && copiedLesson ? 132 : 88
    setCellMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height)),
      day,
      period,
    })
  }

  useEffect(() => {
    if (!cellMenu) return
    const close = () => setCellMenu(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [cellMenu])

  const fillPreview = useMemo(() => {
    if (!drag?.axis) return null
    const text = form.cells[cellKey(drag.sourceDay, drag.sourcePeriod)] ?? ''
    if (!text) return null
    const filled = fillEmptyCells(
      form.cells,
      drag.sourceDay,
      drag.sourcePeriod,
      drag.targetDay,
      drag.targetPeriod,
      drag.axis,
    )
    if (filled === form.cells) return { text, keys: new Set<string>() }
    const keys = new Set<string>()
    for (const key of Object.keys(filled)) {
      if (!form.cells[key]) keys.add(key)
    }
    return { text, keys }
  }, [drag, form.cells])

  useEffect(() => {
    return () => stopDragListeners.current?.()
  }, [])

  const dragCursor = !drag
    ? null
    : drag.axis === 'h'
      ? 'ew-resize'
      : drag.axis === 'v'
        ? 'ns-resize'
        : 'grabbing'

  useEffect(() => {
    if (!dragCursor) return
    const previousCursor = document.body.style.cursor
    const previousSelect = document.body.style.userSelect
    document.body.style.cursor = dragCursor
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousSelect
    }
  }, [dragCursor])

  const onFillPointerDown = (event: React.PointerEvent<HTMLElement>, day: number, period: number) => {
    if (event.button !== 0) return
    if (!formRef.current.cells[cellKey(day, period)]) return
    stopDragListeners.current?.()
    const origin = event.currentTarget

    const session: FillSession = {
      pointerId: event.pointerId,
      sourceDay: day,
      sourcePeriod: period,
      startX: event.clientX,
      startY: event.clientY,
      axis: null,
      targetDay: day,
      targetPeriod: period,
      cancelled: false,
    }
    dragRef.current = session

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== session.pointerId || session.cancelled) return
      const dx = ev.clientX - session.startX
      const dy = ev.clientY - session.startY
      if (!session.axis) {
        if (Math.hypot(dx, dy) < 10) return
        session.axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
        dragToken.current += 1
        draggedRef.current = true
        try {
          origin.setPointerCapture(ev.pointerId)
        } catch {
          /* pencere dinleyicileri sürüklemeyi sürdürür */
        }
      }
      const hit = cellFromPoint(ev.clientX, ev.clientY)
      if (hit) {
        if (session.axis === 'h') session.targetDay = hit.day
        else session.targetPeriod = hit.period
      }
      const nextDrag: FillDrag = {
        sourceDay: session.sourceDay,
        sourcePeriod: session.sourcePeriod,
        axis: session.axis,
        targetDay: session.targetDay,
        targetPeriod: session.targetPeriod,
      }
      setDrag((prev) =>
        prev &&
        prev.axis === nextDrag.axis &&
        prev.targetDay === nextDrag.targetDay &&
        prev.targetPeriod === nextDrag.targetPeriod
          ? prev
          : nextDrag,
      )
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      session.cancelled = true
      setDrag(null)
    }

    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== session.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('keydown', onKey)
      stopDragListeners.current = null
      const current = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (current?.axis) {
        const token = dragToken.current
        window.setTimeout(() => {
          if (dragToken.current === token) draggedRef.current = false
        }, 300)
      }
      if (ev.type === 'pointercancel' || !current || current.cancelled || !current.axis) return
      const base = formRef.current
      const cells = fillEmptyCells(
        base.cells,
        current.sourceDay,
        current.sourcePeriod,
        current.targetDay,
        current.targetPeriod,
        current.axis,
      )
      if (cells === base.cells) return
      const next = { ...base, cells }
      formRef.current = next
      setForm(next)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('keydown', onKey)
    stopDragListeners.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('keydown', onKey)
    }
  }

  const dirty = formSnapshot(form) !== savedSnap

  if (!isNew && loading && !hydrated.current) {
    return (
      <Layout title="Ders programı" showBack backTo="/ders-programlari" backTitle="Programlar">
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    )
  }

  if (!isNew && !loading && !item) {
    return (
      <Layout title="Ders programı" showBack backTo="/ders-programlari" backTitle="Programlar">
        <p className="text-sm text-muted-foreground py-8 text-center">Program bulunamadı.</p>
      </Layout>
    )
  }

  return (
    <Layout
      title={isNew ? 'Yeni program' : form.teacherName || 'Ders programı'}
      showBack
      backTo="/ders-programlari"
      backTitle="Programlar"
      wide
      rightAction={
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {hasSaved && !dirty && !saving && (
            <Check className="h-4 w-4 text-emerald-600 shrink-0" aria-label="Kaydedildi" />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label="Düzenle">
                <Pencil className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>Program ayarları</DropdownMenuItem>
              <DropdownMenuItem disabled={!dirty || saving} onSelect={() => void persist(form)}>
                Kaydet
              </DropdownMenuItem>
              {savedId ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setConfirmDelete(true)}
                  >
                    Programı sil
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table
            className={cn(
              'w-full table-fixed border-collapse select-none text-xs',
              drag?.axis === 'h' && 'cursor-ew-resize [&_button]:cursor-ew-resize',
              drag?.axis === 'v' && 'cursor-ns-resize [&_button]:cursor-ns-resize',
            )}
          >
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-9 bg-background border px-0.5 py-1.5 text-left text-[11px] font-medium sm:w-10 sm:p-1.5 sm:text-xs">
                  Saat
                </th>
                {TIMETABLE_DAYS.map((day) => (
                  <th key={day} className="border px-0.5 py-1.5 text-center text-[11px] font-medium sm:p-2 sm:text-xs">
                    {day.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) =>
                slot.kind === 'lunch' ? (
                  <tr key="lunch" className="h-7">
                    <td className="sticky left-0 z-10 bg-amber-50 border px-0.5 py-0.5 text-amber-900 text-[11px] font-medium leading-none">
                      Öğle
                    </td>
                    <td
                      colSpan={5}
                      className="border bg-amber-50 px-1 py-0.5 text-center text-amber-900 text-[11px] leading-none"
                    >
                      <span className="font-medium">Öğle arası</span>
                      <span className="ml-2 tabular-nums text-[10px] font-normal">{slot.start}</span>
                      <span className="ml-1 tabular-nums text-[10px] font-normal">{slot.end}</span>
                    </td>
                  </tr>
                ) : (
                  <tr key={slot.period}>
                    <td className="sticky left-0 z-10 border px-0.5 py-1 bg-background">
                      <div className="font-medium">{slot.period}</div>
                      <div className="text-[9px] leading-[1.15] text-muted-foreground tabular-nums sm:text-[10px]">
                        <div>{slot.start}</div>
                        <div>{slot.end}</div>
                      </div>
                    </td>
                    {TIMETABLE_DAYS.map((day, dayIndex) => {
                      const key = cellKey(dayIndex, slot.period)
                      const text = form.cells[key] ?? ''
                      const willFill = fillPreview?.keys.has(key) ?? false
                      const isSource =
                        drag?.sourceDay === dayIndex && drag.sourcePeriod === slot.period && !!drag.axis
                      const isNowLesson =
                        activeDayIndex === dayIndex &&
                        activeLessonPeriod === slot.period &&
                        Boolean(text.trim())
                      return (
                        <td
                          key={day}
                          data-timetable-cell=""
                          data-day={dayIndex}
                          data-period={slot.period}
                          className={cn(
                            'relative border p-0.5 align-top',
                            isSource && 'bg-primary/5 ring-2 ring-inset ring-primary',
                            willFill && 'bg-primary/10',
                          )}
                        >
                          <button
                            type="button"
                            title={
                              isNowLesson
                                ? 'Derse git'
                                : text
                                  ? 'Sürükleyerek yay'
                                  : undefined
                            }
                            className={cn(
                              'w-full min-h-10 rounded px-0.5 py-1 text-left text-[11px] leading-tight break-words hover:bg-muted sm:px-1.5',
                              text ? 'cursor-grab font-medium touch-none' : 'text-muted-foreground',
                              isNowLesson && 'timetable-now-slot ring-1 ring-primary/40 cursor-pointer',
                              willFill && !text && 'font-medium text-primary',
                            )}
                            onPointerDown={(event) => onFillPointerDown(event, dayIndex, slot.period)}
                            onContextMenu={(event) => openCellMenu(event, dayIndex, slot.period)}
                            onClick={() => {
                              if (draggedRef.current || menuOpenedRef.current) {
                                draggedRef.current = false
                                menuOpenedRef.current = false
                                return
                              }
                              if (isNowLesson && text.trim()) {
                                const courseId = findCourseIdForCell(text, courses)
                                if (courseId) {
                                  navigate(`/courses/${courseId}`)
                                  return
                                }
                                toast({
                                  title: 'Ders bulunamadı',
                                  description: 'Derslerim listesinde eşleşen kayıt yok.',
                                  variant: 'destructive',
                                })
                                return
                              }
                              openCell(dayIndex, slot.period)
                            }}
                          >
                            {text || (willFill ? fillPreview?.text : '') || '—'}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Program ayarları</DialogTitle>
          </DialogHeader>
          <TimetableSettingsFields form={form} setForm={setForm} />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
              Kapat
            </Button>
            <Button
              type="button"
              disabled={!dirty || saving}
              onClick={() => {
                void persist(form)
                setSettingsOpen(false)
              }}
            >
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cellOpen} onOpenChange={(open) => !open && setCellOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {cellOpen ? `${TIMETABLE_DAYS[cellOpen.day]} · ${cellOpen.period}. ders` : 'Ders'}
            </DialogTitle>
          </DialogHeader>
          {lessonNames.length > 0 && (
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {lessonNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium hover:bg-muted"
                  onClick={() => {
                    if (!cellOpen) return
                    setCellOpen(null)
                    void writeCell(cellOpen.day, cellOpen.period, name)
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ders-adi">Ders adı</Label>
            <Input
              id="ders-adi"
              value={draftName}
              autoFocus
              placeholder="Örn. Bilişim"
              onChange={(e) => setDraftName(formatTitleCase(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  saveCell()
                }
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={draftGrade || undefined} onValueChange={setDraftGrade}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Sınıf" />
              </SelectTrigger>
              <SelectContent>
                {CELL_GRADES.map((grade) => (
                  <SelectItem key={grade} value={grade}>
                    {grade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={draftSection || undefined} onValueChange={setDraftSection}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Şube" />
              </SelectTrigger>
              <SelectContent>
                {CELL_SECTIONS.map((section) => (
                  <SelectItem key={section} value={section}>
                    {section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            {cellOpen && form.cells[cellKey(cellOpen.day, cellOpen.period)] && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraftName('')
                  setDraftGrade('')
                  setDraftSection('')
                  const key = cellKey(cellOpen.day, cellOpen.period)
                  const cells = { ...form.cells }
                  delete cells[key]
                  const next = { ...form, cells }
                  setForm(next)
                  setCellOpen(null)
                }}
              >
                Sil
              </Button>
            )}
            <Button type="button" onClick={saveCell}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {cellMenu && (
        <>
          <div className="fixed inset-0 z-[250]" onPointerDown={() => setCellMenu(null)} />
          <div
            className="fixed z-[260] min-w-[168px] rounded-xl border bg-background py-1 shadow-lg"
            style={{ left: cellMenu.x, top: cellMenu.y }}
            onContextMenu={(event) => event.preventDefault()}
          >
            {form.cells[cellKey(cellMenu.day, cellMenu.period)] && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  const text = form.cells[cellKey(cellMenu.day, cellMenu.period)]
                  if (!text) return
                  setCopiedLesson(text)
                  void navigator.clipboard?.writeText(text).catch(() => {})
                  setCellMenu(null)
                  toast({ title: 'Ders kopyalandı' })
                }}
              >
                <Copy className="h-4 w-4 shrink-0" />
                Kopyala
              </button>
            )}
            {copiedLesson && copiedLesson !== form.cells[cellKey(cellMenu.day, cellMenu.period)] && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  const { day, period } = cellMenu
                  setCellMenu(null)
                  void writeCell(day, period, copiedLesson)
                }}
              >
                <ClipboardPaste className="h-4 w-4 shrink-0" />
                Yapıştır
              </button>
            )}
            {form.cells[cellKey(cellMenu.day, cellMenu.period)] && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  const { day, period } = cellMenu
                  setCellMenu(null)
                  void writeCell(day, period, '')
                }}
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                Sil
              </button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Program silinsin mi?"
        description="Bu ders programı kalıcı olarak silinir."
        confirmText="Sil"
        variant="destructive"
        onConfirm={async () => {
          if (!savedId) return
          await deleteTimetable(savedId)
          navigate('/ders-programlari')
        }}
      />
    </Layout>
  )
}
