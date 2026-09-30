import {
  buildDaySlots,
  cellKey,
  closestSchoolDateForDayIndex,
  findLessonPeriodForTime,
  TIMETABLE_DAYS,
  type BellSchedule,
} from '@/lib/timetable'
import { formatClassName } from '@/lib/utils'
import type { Course } from '@/types'

const CELL_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

function parseCellLesson(text: string) {
  const trimmed = text.trim()
  const match = trimmed.match(/^(.*?)(?:\s*[-–]\s*|\s+)(9|10|11|12)\s*([A-G])$/i)
  if (!match) return { name: trimmed, grade: '', section: '' }
  const section = match[3].toLocaleUpperCase('tr-TR')
  if (!CELL_SECTIONS.includes(section)) return { name: trimmed, grade: '', section: '' }
  return { name: match[1].trim(), grade: match[2], section }
}

function courseListTitle(course: Course) {
  return [course.dersAdi, course.sinifAdi].map((part) => (part ?? '').trim()).filter(Boolean).join(' - ')
}

export function findCourseForTimetableCell(text: string, courses: Course[]): Course | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const exact = courses.find((c) => courseListTitle(c) === trimmed)
  if (exact) return exact

  const parsed = parseCellLesson(trimmed)
  const cellClass = parsed.grade && parsed.section ? `${parsed.grade}${parsed.section}` : ''
  if (!parsed.name || !cellClass) return null

  return (
    courses.find(
      (c) =>
        (c.dersAdi ?? '').trim().localeCompare(parsed.name, 'tr', { sensitivity: 'base' }) === 0 &&
        formatClassName(c.sinifAdi ?? '') === formatClassName(cellClass),
    ) ?? null
  )
}

/** Şu anki ders hücresi; boşsa sıradaki dolu hücre metni. */
export function timetableCellForNowOrNext(
  cells: Record<string, string>,
  schedule: BellSchedule,
  now: Date = new Date(),
): string | null {
  const weekday = now.getDay()
  const activeDayIndex = weekday >= 1 && weekday <= 5 ? weekday - 1 : null

  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const activeLessonPeriod = activeDayIndex != null ? findLessonPeriodForTime(schedule, time) : null

  if (activeDayIndex != null && activeLessonPeriod != null) {
    const current = cells[cellKey(activeDayIndex, activeLessonPeriod)] ?? ''
    if (current.trim()) return current.trim()
  }

  const slots = buildDaySlots(schedule)
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const lessons = slots.filter((slot) => slot.kind === 'lesson')
  const startDay = activeDayIndex ?? 0

  for (let offset = 0; offset < 5; offset++) {
    const day = (startDay + offset) % 5
    for (const slot of lessons) {
      if (day === activeDayIndex) {
        const [h, m] = slot.start.split(':').map(Number)
        if (h * 60 + m <= nowMins) continue
      }
      const text = cells[cellKey(day, slot.period)] ?? ''
      if (text.trim()) return text.trim()
    }
  }
  return null
}

export function findCourseForNowOrNextLesson(
  courses: Course[],
  cells: Record<string, string>,
  schedule: BellSchedule,
  now: Date = new Date(),
): Course | null {
  const cell = timetableCellForNowOrNext(cells, schedule, now)
  if (!cell) return null
  return findCourseForTimetableCell(cell, courses)
}

const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'] as const

function normalizeTime(value: string) {
  const [h = '00', m = '00'] = value.split(':')
  return `${String(Number(h) || 0).padStart(2, '0')}:${String(Number(m) || 0).padStart(2, '0')}`
}

function schoolDayIndexFromDate(isoDate: string): number | null {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return null
  const weekday = new Date(y, m - 1, d).getDay()
  if (weekday >= 1 && weekday <= 5) return weekday - 1
  return null
}

export type TimetableLessonNavSlot = {
  date: string
  time: string
  dayIndex: number
  period: number
  label: string
}

export type TimetableLessonNav = {
  prev: TimetableLessonNavSlot | null
  next: TimetableLessonNavSlot | null
}

function slotLabel(dayIndex: number, period: number) {
  const day = DAY_SHORT[dayIndex] ?? TIMETABLE_DAYS[dayIndex] ?? ''
  return `${day} · ${period}. ders`
}

function cellMatchesCourse(text: string, course: Course) {
  return findCourseForTimetableCell(text, [course])?.id === course.id
}

export function cellTextMatchesClass(cellText: string, sinifAdi: string): boolean {
  const parsed = parseCellLesson(cellText.trim())
  const cellClass = parsed.grade && parsed.section ? `${parsed.grade}${parsed.section}` : ''
  if (!cellClass) return false
  return formatClassName(cellClass) === formatClassName(sinifAdi)
}

function listProgramSlots(
  cells: Record<string, string>,
  schedule: BellSchedule,
  refDate: string,
  matches: (cellText: string) => boolean,
): TimetableLessonNavSlot[] {
  const ref = new Date(`${refDate}T12:00:00`)
  const lessonSlots = buildDaySlots(schedule).filter((s) => s.kind === 'lesson')
  const out: TimetableLessonNavSlot[] = []

  for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
    for (const slot of lessonSlots) {
      const text = cells[cellKey(dayIndex, slot.period)] ?? ''
      if (!text.trim() || !matches(text)) continue
      out.push({
        date: closestSchoolDateForDayIndex(dayIndex, ref),
        time: slot.start,
        dayIndex,
        period: slot.period,
        label: slotLabel(dayIndex, slot.period),
      })
    }
  }

  out.sort((a, b) => a.dayIndex * 100 + a.period - (b.dayIndex * 100 + b.period))
  return out
}

function findCurrentProgramSlotIndex(
  slots: TimetableLessonNavSlot[],
  date: string,
  time: string,
  lessonPeriod?: number,
): number {
  const dayIdx = schoolDayIndexFromDate(date)
  if (dayIdx != null && lessonPeriod != null) {
    const i = slots.findIndex((s) => s.dayIndex === dayIdx && s.period === lessonPeriod)
    if (i >= 0) return i
  }
  const clock = normalizeTime(time)
  const byClock = slots.findIndex((s) => s.date === date && s.time === clock)
  if (byClock >= 0) return byClock
  return -1
}

function adjacentFromIndex(slots: TimetableLessonNavSlot[], index: number): TimetableLessonNav {
  if (index < 0) return { prev: null, next: null }
  return {
    prev: index > 0 ? slots[index - 1]! : null,
    next: index < slots.length - 1 ? slots[index + 1]! : null,
  }
}

/** Programda bu derse ait önceki / sonraki ders saati (başka ders/sınıf saatleri atlanır). */
export function findAdjacentCourseLessonInTimetable(
  course: Course,
  cells: Record<string, string>,
  schedule: BellSchedule,
  date: string,
  time: string,
  lessonPeriod?: number,
): TimetableLessonNav {
  const slots = listProgramSlots(cells, schedule, date, (text) => cellMatchesCourse(text, course))
  const index = findCurrentProgramSlotIndex(slots, date, time, lessonPeriod)
  return adjacentFromIndex(slots, index)
}

/** Programda bu sınıfa ait önceki / sonraki ders saati. */
export function findAdjacentClassLessonInTimetable(
  sinifAdi: string,
  cells: Record<string, string>,
  schedule: BellSchedule,
  date: string,
  time: string,
  lessonPeriod?: number,
): TimetableLessonNav {
  const slots = listProgramSlots(cells, schedule, date, (text) => cellTextMatchesClass(text, sinifAdi))
  const index = findCurrentProgramSlotIndex(slots, date, time, lessonPeriod)
  return adjacentFromIndex(slots, index)
}
