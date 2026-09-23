import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import type { AttendanceMark, ClassAttendanceMarks } from '@/types'
import { buildDaySlots, findLessonPeriodForTime, type BellSchedule } from '@/lib/timetable'
import { formatClassName } from '@/lib/utils'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function normalizeTime(value: string) {
  const [h = '00', m = '00'] = value.split(':')
  return `${pad(Number(h) || 0)}:${pad(Number(m) || 0)}`
}

export function attendanceSessionKey(sinifAdi: string, date: string, time: string) {
  return `${sinifAdi}_${date}_${normalizeTime(time).replace(':', '')}`
}

export type AttendanceSessionSummary = {
  key: string
  sinifAdi: string
  date: string
  time: string
  lessonPeriod?: number
  marks: ClassAttendanceMarks
  dCount: number
  gCount: number
}

function lessonPeriodForTime(
  time: string,
  schedule: BellSchedule | null | undefined,
  stored?: number,
  mode: 'live' | 'history' = 'live',
): number | undefined {
  if (schedule) {
    const computed = findLessonPeriodForTime(schedule, normalizeTime(time))
    if (mode === 'live') return computed ?? undefined
    return stored ?? computed ?? undefined
  }
  return stored
}

export function useAttendanceHistory(bellSchedule?: BellSchedule | null) {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<AttendanceSessionSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setSessions([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (cancelled) return
        const all = snap.data()?.classAttendances as
          | Record<
              string,
              {
                sinifAdi?: string
                date?: string
                time?: string
                lessonPeriod?: number
                marks?: ClassAttendanceMarks
              }
            >
          | undefined
        const list: AttendanceSessionSummary[] = Object.entries(all ?? {})
          .map(([key, v]) => {
            const marks = v.marks ?? {}
            const lessonPeriod = lessonPeriodForTime(v.time || '', bellSchedule, v.lessonPeriod, 'history')
            return {
              key,
              sinifAdi: v.sinifAdi || '',
              date: v.date || '',
              time: v.time || '',
              lessonPeriod,
              marks,
              dCount: Object.values(marks).filter((m) => m === 'D').length,
              gCount: Object.values(marks).filter((m) => m === 'G').length,
            }
          })
          .filter((s) => s.sinifAdi && s.date && s.dCount + s.gCount > 0)
        list.sort((a, b) => {
          const byWhen = `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)
          if (byWhen) return byWhen
          return a.sinifAdi.localeCompare(b.sinifAdi, 'tr')
        })
        setSessions(list)
        setLoading(false)
      })
      .catch((error) => {
        console.error('Yoklama geçmişi okunamadı:', error)
        if (cancelled) return
        setSessions([])
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user, bellSchedule?.startTime, bellSchedule?.lessonMinutes, bellSchedule?.breakMinutes, bellSchedule?.lunchMinutes, bellSchedule?.lessonsPerDay])

  const deleteSession = useCallback(
    async (sessionKey: string) => {
      if (!user) return
      await updateDoc(doc(db, 'users', user.uid), {
        [`classAttendances.${sessionKey}`]: deleteField(),
      })
      setSessions((prev) => prev.filter((s) => s.key !== sessionKey))
    },
    [user],
  )

  const removeStudentMark = useCallback(
    async (session: AttendanceSessionSummary, okulNo: string) => {
      if (!user) return
      const no = String(okulNo).trim()
      if (!no) return

      const next: ClassAttendanceMarks = { ...session.marks }
      delete next[no]
      const dCount = Object.values(next).filter((m) => m === 'D').length
      const gCount = Object.values(next).filter((m) => m === 'G').length
      const userRef = doc(db, 'users', user.uid)
      const field = `classAttendances.${session.key}`

      if (dCount + gCount === 0) {
        await updateDoc(userRef, { [field]: deleteField() })
        setSessions((prev) => prev.filter((s) => s.key !== session.key))
        return
      }

      const payload: Record<string, unknown> = {
        sinifAdi: session.sinifAdi,
        date: session.date,
        time: normalizeTime(session.time),
        marks: next,
        updatedAt: serverTimestamp(),
      }
      if (session.lessonPeriod != null) payload.lessonPeriod = session.lessonPeriod
      await updateDoc(userRef, { [field]: payload })
      setSessions((prev) =>
        prev.map((s) =>
          s.key === session.key ? { ...s, marks: next, dCount, gCount } : s,
        ),
      )
    },
    [user],
  )

  return { sessions, loading, deleteSession, removeStudentMark }
}

/** Aynı sınıf için bir önceki ders yoklaması (önce aynı gün önceki ders saati, yoksa daha erken kayıt). */
export function findPreviousLessonSession(
  sessions: AttendanceSessionSummary[],
  sinifAdi: string,
  date: string,
  time: string,
  lessonPeriod: number | undefined,
  currentKey: string,
): AttendanceSessionSummary | null {
  const ad = formatClassName(sinifAdi)
  const currentWhen = `${date}T${normalizeTime(time)}`
  const candidates = sessions.filter(
    (s) =>
      formatClassName(s.sinifAdi) === ad &&
      s.key !== currentKey &&
      s.dCount + s.gCount > 0,
  )

  const sameDay = candidates.filter((s) => s.date === date)

  if (lessonPeriod != null && lessonPeriod > 1) {
    const prevPeriod = sameDay.find((s) => s.lessonPeriod === lessonPeriod - 1)
    if (prevPeriod) return prevPeriod
  }

  const earlierSameDay = sameDay
    .filter((s) => `${s.date}T${normalizeTime(s.time)}` < currentWhen)
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
  if (earlierSameDay[0]) return earlierSameDay[0]

  const earlierAny = candidates
    .filter((s) => `${s.date}T${normalizeTime(s.time)}` < currentWhen)
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
  return earlierAny[0] ?? null
}

export type AttendanceSlot = { date: string; time: string }

export function findAdjacentLessonAttendance(
  sessions: AttendanceSessionSummary[],
  sinifAdi: string,
  date: string,
  time: string,
  lessonPeriod: number | undefined,
  bellSchedule: BellSchedule | null | undefined,
): { prev: AttendanceSlot | null; next: AttendanceSlot | null } {
  const ad = formatClassName(sinifAdi)
  const currentWhen = `${date}T${normalizeTime(time)}`
  const classSessions = sessions
    .filter((s) => formatClassName(s.sinifAdi) === ad && s.dCount + s.gCount > 0)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))

  let prev: AttendanceSlot | null = null
  let next: AttendanceSlot | null = null

  if (bellSchedule && lessonPeriod != null) {
    const lessons = buildDaySlots(bellSchedule).filter((s) => s.kind === 'lesson')
    const idx = lessons.findIndex((s) => s.period === lessonPeriod)
    if (idx > 0) {
      prev = { date, time: lessons[idx - 1]!.start }
    }
    if (idx >= 0 && idx < lessons.length - 1) {
      next = { date, time: lessons[idx + 1]!.start }
    }
  }

  if (!prev) {
    const earlier = classSessions.filter((s) => `${s.date}T${normalizeTime(s.time)}` < currentWhen)
    const last = earlier[earlier.length - 1]
    if (last) prev = { date: last.date, time: normalizeTime(last.time) }
  }
  if (!next) {
    const later = classSessions.find((s) => `${s.date}T${normalizeTime(s.time)}` > currentWhen)
    if (later) next = { date: later.date, time: normalizeTime(later.time) }
  }

  return { prev, next }
}

export function useClassAttendance(
  sinifAdi: string,
  date: string,
  time: string,
  bellSchedule?: BellSchedule | null,
) {
  const { user } = useAuth()
  const [marks, setMarks] = useState<ClassAttendanceMarks>({})
  const [storedLessonPeriod, setStoredLessonPeriod] = useState<number | undefined>()
  const [loading, setLoading] = useState(true)
  const marksRef = useRef<ClassAttendanceMarks>({})
  const lessonPeriod = lessonPeriodForTime(time, bellSchedule, storedLessonPeriod, 'live')

  useEffect(() => {
    if (!user || !sinifAdi || !date || !time) {
      marksRef.current = {}
      setMarks({})
      setStoredLessonPeriod(undefined)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    const sessionKey = attendanceSessionKey(sinifAdi, date, time)
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (cancelled) return
        const session = snap.data()?.classAttendances?.[sessionKey] as
          | { marks?: ClassAttendanceMarks; lessonPeriod?: number }
          | undefined
        const next = session?.marks ?? {}
        marksRef.current = next
        setMarks(next)
        setStoredLessonPeriod(session?.lessonPeriod)
        setLoading(false)
      })
      .catch((error) => {
        console.error('Yoklama okunamadı:', error)
        if (cancelled) return
        marksRef.current = {}
        setMarks({})
        setStoredLessonPeriod(undefined)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user, sinifAdi, date, time])

  const setMark = useCallback(
    async (okulNo: string, mark: AttendanceMark) => {
      if (!user || !sinifAdi || !date || !time) return
      const no = String(okulNo).trim()
      if (!no) return

      const next: ClassAttendanceMarks = { ...marksRef.current }
      if (next[no] === mark) delete next[no]
      else next[no] = mark
      marksRef.current = next
      setMarks(next)

      const sessionKey = attendanceSessionKey(sinifAdi, date, time)
      const period = bellSchedule
        ? findLessonPeriodForTime(bellSchedule, normalizeTime(time))
        : null
      if (period != null) setStoredLessonPeriod(period)
      const payload: Record<string, unknown> = {
        sinifAdi,
        date,
        time: normalizeTime(time),
        marks: next,
        updatedAt: serverTimestamp(),
      }
      if (period != null) payload.lessonPeriod = period
      const userRef = doc(db, 'users', user.uid)
      try {
        await updateDoc(userRef, { [`classAttendances.${sessionKey}`]: payload })
      } catch {
        await setDoc(userRef, { classAttendances: { [sessionKey]: payload } }, { merge: true })
      }
    },
    [user, sinifAdi, date, time, bellSchedule],
  )

  const replaceMarks = useCallback(
    async (nextMarks: ClassAttendanceMarks) => {
      if (!user || !sinifAdi || !date || !time) return
      const next = { ...nextMarks }
      marksRef.current = next
      setMarks(next)

      const sessionKey = attendanceSessionKey(sinifAdi, date, time)
      const period = bellSchedule
        ? findLessonPeriodForTime(bellSchedule, normalizeTime(time))
        : null
      if (period != null) setStoredLessonPeriod(period)
      const payload: Record<string, unknown> = {
        sinifAdi,
        date,
        time: normalizeTime(time),
        marks: next,
        updatedAt: serverTimestamp(),
      }
      if (period != null) payload.lessonPeriod = period
      const userRef = doc(db, 'users', user.uid)
      try {
        await updateDoc(userRef, { [`classAttendances.${sessionKey}`]: payload })
      } catch {
        await setDoc(userRef, { classAttendances: { [sessionKey]: payload } }, { merge: true })
      }
    },
    [user, sinifAdi, date, time, bellSchedule],
  )

  return { marks, loading, setMark, replaceMarks, lessonPeriod }
}
