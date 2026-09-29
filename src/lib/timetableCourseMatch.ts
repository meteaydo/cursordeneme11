import {
  buildDaySlots,
  cellKey,
  findLessonPeriodForTime,
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
