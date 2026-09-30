import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { normalizeTime, useClassAttendance } from '@/hooks/useClassAttendance'
import { useCourses } from '@/hooks/useCourses'
import { useProgramLessonNavigation } from '@/hooks/useProgramLessonNavigation'
import { useBellSchedule } from '@/hooks/useTimetables'
import type { AttendanceMark } from '@/types'

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

export function visibleAttendanceMark(
  attendance: AttendanceMark | undefined,
  score?: { devamsiz?: boolean; gec?: boolean },
): AttendanceMark | undefined {
  if (attendance === 'D' || attendance === 'G') return attendance
  if (score?.devamsiz) return 'D'
  if (score?.gec) return 'G'
  return undefined
}

export function attendanceScoreFields(current: AttendanceMark | undefined, mark: AttendanceMark) {
  if (current === mark) return { devamsiz: false, gec: false }
  if (mark === 'D') return { devamsiz: true, gec: false }
  return { devamsiz: false, gec: true }
}

export function useCourseLessonSlot(sinifAdi: string, pinned?: { date: string; time: string } | null, courseId?: string) {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const now = useMemo(() => nowLocal(), [])
  const [nudge, setNudge] = useState<{ date: string; time: string } | null>(null)
  const pinKey = pinned ? `${pinned.date}|${pinned.time}` : ''
  useEffect(() => {
    setNudge(null)
  }, [pinKey])

  const date = nudge?.date || pinned?.date || searchParams.get('tarih') || now.date
  const time = normalizeTime(nudge?.time || pinned?.time || searchParams.get('saat') || now.time)
  const { schedule } = useBellSchedule()
  const { courses } = useCourses()
  const course = useMemo(
    () => (courseId ? courses.find((c) => c.id === courseId) ?? null : null),
    [courseId, courses],
  )
  const { marks, notes, herkesGeldi, setMark, setNote, markEveryonePresent, replaceMarks, lessonPeriod, loading } = useClassAttendance(sinifAdi, date, time, schedule, courseId)

  const programNav = useProgramLessonNavigation({
    course,
    date,
    time,
    lessonPeriod,
  })

  const patch = (partial: { tarih?: string; saat?: string }) => {
    const nextDate = partial.tarih || date
    const nextTime = normalizeTime(partial.saat || time)
    if (pinned) {
      setNudge({ date: nextDate, time: nextTime })
      return
    }
    const next = new URLSearchParams(searchParams)
    next.set('tarih', nextDate)
    next.set('saat', nextTime)
    setSearchParams(next, { replace: true, state: location.state })
  }

  const goPrevLesson = () => {
    const slot = programNav.prev
    if (!slot) return
    patch({ tarih: slot.date, saat: slot.time })
  }

  const goNextLesson = () => {
    const slot = programNav.next
    if (!slot) return
    patch({ tarih: slot.date, saat: slot.time })
  }

  return {
    date,
    time,
    setDate: (value: string) => patch({ tarih: value }),
    setTime: (value: string) => patch({ saat: value }),
    marks,
    notes,
    herkesGeldi,
    setMark,
    setNote,
    markEveryonePresent,
    replaceMarks,
    lessonPeriod,
    loading,
    lessonPrev: programNav.prev,
    lessonNext: programNav.next,
    lessonPrevLabel: programNav.prev?.label,
    lessonNextLabel: programNav.next?.label,
    goPrevLesson,
    goNextLesson,
  }
}
