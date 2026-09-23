export const TIMETABLE_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'] as const

export const LUNCH_AFTER_PERIOD = 5

export const DEFAULT_TIMETABLE = {
  startTime: '08:30',
  lessonMinutes: 40,
  breakMinutes: 10,
  lunchMinutes: 60,
  lessonsPerDay: 10,
}

export type TimetableSlot =
  | { kind: 'lesson'; period: number; start: string; end: string }
  | { kind: 'lunch'; start: string; end: string }

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function minutesFromTime(value: string) {
  const [h = '0', m = '0'] = value.split(':')
  return (Number(h) || 0) * 60 + (Number(m) || 0)
}

export function timeFromMinutes(total: number) {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`
}

export function cellKey(dayIndex: number, period: number) {
  return `${dayIndex}-${period}`
}

export type FillAxis = 'h' | 'v'

export function fillEmptyCells(
  cells: Record<string, string>,
  sourceDay: number,
  sourcePeriod: number,
  targetDay: number,
  targetPeriod: number,
  axis: FillAxis,
): Record<string, string> {
  const text = cells[cellKey(sourceDay, sourcePeriod)]
  if (!text) return cells

  const next: Record<string, string> = { ...cells }
  let changed = false
  const write = (key: string) => {
    if (next[key]) return
    next[key] = text
    changed = true
  }

  if (axis === 'h') {
    const from = Math.min(sourceDay, targetDay)
    const to = Math.max(sourceDay, targetDay)
    for (let day = from; day <= to; day += 1) {
      if (day !== sourceDay) write(cellKey(day, sourcePeriod))
    }
  } else {
    const from = Math.min(sourcePeriod, targetPeriod)
    const to = Math.max(sourcePeriod, targetPeriod)
    for (let period = from; period <= to; period += 1) {
      if (period !== sourcePeriod) write(cellKey(sourceDay, period))
    }
  }

  return changed ? next : cells
}

export function buildDaySlots(settings: {
  startTime: string
  lessonMinutes: number
  breakMinutes: number
  lunchMinutes: number
  lessonsPerDay: number
}): TimetableSlot[] {
  const lessonMinutes = Math.max(1, settings.lessonMinutes)
  const breakMinutes = Math.max(0, settings.breakMinutes)
  const lunchMinutes = Math.max(0, settings.lunchMinutes)
  const count = Math.max(1, Math.min(14, settings.lessonsPerDay))
  let cursor = minutesFromTime(settings.startTime)
  const slots: TimetableSlot[] = []

  for (let period = 1; period <= count; period++) {
    const start = cursor
    const end = cursor + lessonMinutes
    slots.push({
      kind: 'lesson',
      period,
      start: timeFromMinutes(start),
      end: timeFromMinutes(end),
    })
    cursor = end
    if (period >= count) break
    if (period === LUNCH_AFTER_PERIOD && count > LUNCH_AFTER_PERIOD) {
      const lunchEnd = cursor + lunchMinutes
      slots.push({
        kind: 'lunch',
        start: timeFromMinutes(cursor),
        end: timeFromMinutes(lunchEnd),
      })
      cursor = lunchEnd
    } else {
      cursor += breakMinutes
    }
  }

  return slots
}

export type BellSchedule = {
  startTime: string
  lessonMinutes: number
  breakMinutes: number
  lunchMinutes: number
  lessonsPerDay: number
}

export function bellScheduleFromDefaults(): BellSchedule {
  return { ...DEFAULT_TIMETABLE }
}

export function findLessonPeriodForTime(schedule: BellSchedule, time: string): number | null {
  const mins = minutesFromTime(time)
  for (const slot of buildDaySlots(schedule)) {
    if (slot.kind !== 'lesson') continue
    const start = minutesFromTime(slot.start)
    const end = minutesFromTime(slot.end)
    if (mins >= start && mins < end) return slot.period
  }
  return null
}
