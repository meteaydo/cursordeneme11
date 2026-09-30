import { useMemo } from 'react'
import { bellScheduleFromDefaults } from '@/lib/timetable'
import {
  findAdjacentClassLessonInTimetable,
  findAdjacentCourseLessonInTimetable,
  type TimetableLessonNav,
} from '@/lib/timetableCourseMatch'
import { pickTimetableId, timetableToBellSchedule, useTimetables } from '@/hooks/useTimetables'
import type { Course } from '@/types'

type Options = {
  date: string
  time: string
  lessonPeriod?: number
  course?: Course | null
  sinifAdi?: string
}

export function useProgramLessonNavigation({
  date,
  time,
  lessonPeriod,
  course,
  sinifAdi,
}: Options): TimetableLessonNav {
  const { items: timetables } = useTimetables()
  const timetable = useMemo(() => {
    const id = pickTimetableId(timetables)
    return timetables.find((t) => t.id === id) ?? timetables[0] ?? null
  }, [timetables])

  const schedule = timetable ? timetableToBellSchedule(timetable) : bellScheduleFromDefaults()
  const cells = timetable?.cells ?? {}

  return useMemo(() => {
    if (course) {
      return findAdjacentCourseLessonInTimetable(
        course,
        cells,
        schedule,
        date,
        time,
        lessonPeriod,
      )
    }
    if (sinifAdi) {
      return findAdjacentClassLessonInTimetable(
        sinifAdi,
        cells,
        schedule,
        date,
        time,
        lessonPeriod,
      )
    }
    return { prev: null, next: null }
  }, [cells, course, date, lessonPeriod, schedule, sinifAdi, time])
}
