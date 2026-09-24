import { useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { normalizeTime, useClassAttendance } from '@/hooks/useClassAttendance'
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

export function useCourseLessonSlot(sinifAdi: string) {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const now = useMemo(() => nowLocal(), [])
  const date = searchParams.get('tarih') || now.date
  const time = normalizeTime(searchParams.get('saat') || now.time)
  const { schedule } = useBellSchedule()
  const { marks, notes, herkesGeldi, setMark, setNote, markEveryonePresent, replaceMarks, lessonPeriod, loading } = useClassAttendance(sinifAdi, date, time, schedule)

  const patch = (partial: { tarih?: string; saat?: string }) => {
    const next = new URLSearchParams(searchParams)
    next.set('tarih', partial.tarih || date)
    next.set('saat', normalizeTime(partial.saat || time))
    setSearchParams(next, { replace: true, state: location.state })
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
  }
}
