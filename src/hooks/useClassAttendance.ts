import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc, type FieldValue } from 'firebase/firestore'
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

/** Bir ders saati = bir yoklama. Anahtar dakikaya bağlı değildir. */
export function lessonAttendanceKey(sinifAdi: string, date: string, period: number | null) {
  const ad = formatClassName(sinifAdi)
  if (period == null) return `${ad}_${date}_dersdisi`
  return `${ad}_${date}_ders${period}`
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
  herkesGeldi?: boolean
  /** Aynı ders saatine ait eski dakika kayıtları dahil */
  sourceKeys: string[]
}

function marksCount(marks: ClassAttendanceMarks) {
  const values = Object.values(marks)
  return {
    dCount: values.filter((m) => m === 'D').length,
    gCount: values.filter((m) => m === 'G').length,
  }
}

function collapseLessonSessions(list: AttendanceSessionSummary[]): AttendanceSessionSummary[] {
  const groups = new Map<string, AttendanceSessionSummary>()
  for (const session of list) {
    const id =
      session.lessonPeriod != null
        ? `${formatClassName(session.sinifAdi)}|${session.date}|${session.lessonPeriod}`
        : session.key
    const prev = groups.get(id)
    if (!prev) {
      groups.set(id, {
        ...session,
        key:
          session.lessonPeriod != null
            ? lessonAttendanceKey(session.sinifAdi, session.date, session.lessonPeriod)
            : session.key,
        sourceKeys: [...session.sourceKeys],
      })
      continue
    }
    const newer = `${session.date}T${normalizeTime(session.time)}` >= `${prev.date}T${normalizeTime(prev.time)}`
    const marks = newer ? { ...prev.marks, ...session.marks } : { ...session.marks, ...prev.marks }
    const counts = marksCount(marks)
    groups.set(id, {
      ...(newer ? session : prev),
      key: prev.key,
      time: newer ? session.time : prev.time,
      marks,
      ...counts,
      herkesGeldi: !!(prev.herkesGeldi || session.herkesGeldi),
      sourceKeys: [...new Set([...prev.sourceKeys, ...session.sourceKeys])],
    })
  }
  return [...groups.values()]
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
                herkesGeldi?: boolean
              }
            >
          | undefined
        const raw: AttendanceSessionSummary[] = Object.entries(all ?? {})
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
              herkesGeldi: !!v.herkesGeldi,
              sourceKeys: [key],
            }
          })
          .filter((s) => s.sinifAdi && s.date && (s.dCount + s.gCount > 0 || s.herkesGeldi))
        const list = collapseLessonSessions(raw)
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
      const keys = sessions.find((s) => s.key === sessionKey)?.sourceKeys ?? [sessionKey]
      const updates: Record<string, ReturnType<typeof deleteField>> = {}
      for (const key of keys) updates[`classAttendances.${key}`] = deleteField()
      await updateDoc(doc(db, 'users', user.uid), updates)
      setSessions((prev) => prev.filter((s) => s.key !== sessionKey))
    },
    [user, sessions],
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
      const keys = session.sourceKeys?.length ? session.sourceKeys : [session.key]
      const updates: Record<string, FieldValue> = {}

      if (dCount + gCount === 0 && !session.herkesGeldi) {
        for (const key of keys) updates[`classAttendances.${key}`] = deleteField()
        await updateDoc(userRef, updates)
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
      if (session.herkesGeldi) payload.herkesGeldi = true
      updates[`classAttendances.${session.key}`] = payload as unknown as FieldValue
      for (const key of keys) {
        if (key !== session.key) updates[`classAttendances.${key}`] = deleteField()
      }
      await updateDoc(userRef, updates)
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

/** Aynı gün, bu ders saatinden önceki yoklama. Başka güne düşmez. */
export function findSameDayEarlierAttendance(
  sessions: AttendanceSessionSummary[],
  sinifAdi: string,
  date: string,
  time: string,
  lessonPeriod: number | undefined,
): AttendanceSessionSummary | null {
  const ad = formatClassName(sinifAdi)
  const currentWhen = `${date}T${normalizeTime(time)}`
  const sameDay = sessions.filter(
    (s) =>
      formatClassName(s.sinifAdi) === ad &&
      s.date === date &&
      s.dCount + s.gCount > 0 &&
      (lessonPeriod == null
        ? normalizeTime(s.time) !== normalizeTime(time)
        : s.lessonPeriod !== lessonPeriod),
  )

  if (lessonPeriod != null && lessonPeriod > 1) {
    const prevPeriod = sameDay.find((s) => s.lessonPeriod === lessonPeriod - 1)
    if (prevPeriod) return prevPeriod
  }

  const earlier = sameDay
    .filter((s) => `${s.date}T${normalizeTime(s.time)}` < currentWhen)
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
  return earlier[0] ?? null
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
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [storedLessonPeriod, setStoredLessonPeriod] = useState<number | undefined>()
  const [loading, setLoading] = useState(true)
  const marksRef = useRef<ClassAttendanceMarks>({})
  const notesRef = useRef<Record<string, string>>({})
  const herkesGeldiRef = useRef(false)
  const [herkesGeldi, setHerkesGeldi] = useState(false)
  const sessionKeyRef = useRef('')
  const duplicateKeysRef = useRef<string[]>([])
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
    const period = bellSchedule ? findLessonPeriodForTime(bellSchedule, normalizeTime(time)) : null
    const canonicalKey = lessonAttendanceKey(sinifAdi, date, period)
    herkesGeldiRef.current = false
    setHerkesGeldi(false)
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (cancelled) return
        const all = (snap.data()?.classAttendances ?? {}) as Record<
          string,
          { sinifAdi?: string; date?: string; time?: string; lessonPeriod?: number; marks?: ClassAttendanceMarks; notes?: Record<string, string>; herkesGeldi?: boolean }
        >
        const related = Object.entries(all).filter(([key, value]) => {
          if (key === canonicalKey) return true
          if (formatClassName(value.sinifAdi || '') !== sinifAdi || value.date !== date) return false
          const valuePeriod =
            value.lessonPeriod ??
            (value.time && bellSchedule ? findLessonPeriodForTime(bellSchedule, value.time) : null)
          return valuePeriod === period
        })
        related.sort((a, b) => `${a[1].time || ''}` < `${b[1].time || ''}` ? -1 : 1)
        const marks: ClassAttendanceMarks = {}
        const mergedNotes: Record<string, string> = {}
        let savedEveryone = false
        for (const [, value] of related) {
          Object.assign(marks, value.marks ?? {})
          Object.assign(mergedNotes, value.notes ?? {})
          if (value.herkesGeldi) savedEveryone = true
        }
        sessionKeyRef.current = canonicalKey
        duplicateKeysRef.current = related.map(([key]) => key).filter((key) => key !== canonicalKey)
        marksRef.current = marks
        notesRef.current = mergedNotes
        herkesGeldiRef.current = savedEveryone
        setMarks(marks)
        setNotes(mergedNotes)
        setHerkesGeldi(savedEveryone)
        setStoredLessonPeriod(period ?? undefined)
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
  }, [user, sinifAdi, date, time, bellSchedule])

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

      const period = bellSchedule
        ? findLessonPeriodForTime(bellSchedule, normalizeTime(time))
        : null
      const sessionKey = lessonAttendanceKey(sinifAdi, date, period)
      sessionKeyRef.current = sessionKey
      if (period != null) setStoredLessonPeriod(period)
      const slot = period != null && bellSchedule
        ? buildDaySlots(bellSchedule).find((item) => item.kind === 'lesson' && item.period === period)
        : undefined
      const payload: Record<string, unknown> = {
        sinifAdi,
        date,
        time: slot?.start ?? normalizeTime(time),
        marks: next,
        updatedAt: serverTimestamp(),
      }
      if (period != null) payload.lessonPeriod = period
      if (Object.keys(notesRef.current).length > 0) payload.notes = notesRef.current
      if (herkesGeldiRef.current) payload.herkesGeldi = true
      const extras = duplicateKeysRef.current.filter((key) => key !== sessionKey)
      duplicateKeysRef.current = []
      const userRef = doc(db, 'users', user.uid)
      const updates: Record<string, FieldValue> = { [`classAttendances.${sessionKey}`]: payload as unknown as FieldValue }
      for (const key of extras) updates[`classAttendances.${key}`] = deleteField()
      try {
        await updateDoc(userRef, updates)
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

      const period = bellSchedule
        ? findLessonPeriodForTime(bellSchedule, normalizeTime(time))
        : null
      const sessionKey = lessonAttendanceKey(sinifAdi, date, period)
      sessionKeyRef.current = sessionKey
      if (period != null) setStoredLessonPeriod(period)
      const slot = period != null && bellSchedule
        ? buildDaySlots(bellSchedule).find((item) => item.kind === 'lesson' && item.period === period)
        : undefined
      const payload: Record<string, unknown> = {
        sinifAdi,
        date,
        time: slot?.start ?? normalizeTime(time),
        marks: next,
        updatedAt: serverTimestamp(),
      }
      if (period != null) payload.lessonPeriod = period
      if (Object.keys(notesRef.current).length > 0) payload.notes = notesRef.current
      if (herkesGeldiRef.current) payload.herkesGeldi = true
      const extras = duplicateKeysRef.current.filter((key) => key !== sessionKey)
      duplicateKeysRef.current = []
      const userRef = doc(db, 'users', user.uid)
      const updates: Record<string, FieldValue> = { [`classAttendances.${sessionKey}`]: payload as unknown as FieldValue }
      for (const key of extras) updates[`classAttendances.${key}`] = deleteField()
      try {
        await updateDoc(userRef, updates)
      } catch {
        await setDoc(userRef, { classAttendances: { [sessionKey]: payload } }, { merge: true })
      }
    },
    [user, sinifAdi, date, time, bellSchedule],
  )

  const setNote = useCallback(
    async (okulNo: string, note: string) => {
      if (!user || !sinifAdi || !date || !time) return
      const no = String(okulNo).trim()
      if (!no) return
      const next = { ...notesRef.current }
      const trimmed = note.trim()
      if (trimmed) next[no] = trimmed
      else delete next[no]
      notesRef.current = next
      setNotes(next)

      const period = bellSchedule ? findLessonPeriodForTime(bellSchedule, normalizeTime(time)) : null
      const sessionKey = lessonAttendanceKey(sinifAdi, date, period)
      const slot = period != null && bellSchedule
        ? buildDaySlots(bellSchedule).find((item) => item.kind === 'lesson' && item.period === period)
        : undefined
      const payload: Record<string, unknown> = {
        sinifAdi,
        date,
        time: slot?.start ?? normalizeTime(time),
        marks: marksRef.current,
        updatedAt: serverTimestamp(),
      }
      if (period != null) payload.lessonPeriod = period
      if (Object.keys(next).length > 0) payload.notes = next
      if (herkesGeldiRef.current) payload.herkesGeldi = true
      const userRef = doc(db, 'users', user.uid)
      try {
        await updateDoc(userRef, { [`classAttendances.${sessionKey}`]: payload as unknown as FieldValue })
      } catch {
        await setDoc(userRef, { classAttendances: { [sessionKey]: payload } }, { merge: true })
      }
    },
    [user, sinifAdi, date, time, bellSchedule],
  )

  const markEveryonePresent = useCallback(async () => {
    if (!user || !sinifAdi || !date || !time) return
    marksRef.current = {}
    setMarks({})
    herkesGeldiRef.current = true
    setHerkesGeldi(true)
    const period = bellSchedule ? findLessonPeriodForTime(bellSchedule, normalizeTime(time)) : null
    const sessionKey = lessonAttendanceKey(sinifAdi, date, period)
    const slot = period != null && bellSchedule
      ? buildDaySlots(bellSchedule).find((item) => item.kind === 'lesson' && item.period === period)
      : undefined
    const payload: Record<string, unknown> = {
      sinifAdi,
      date,
      time: slot?.start ?? normalizeTime(time),
      marks: {},
      herkesGeldi: true,
      updatedAt: serverTimestamp(),
    }
    if (period != null) payload.lessonPeriod = period
    if (Object.keys(notesRef.current).length > 0) payload.notes = notesRef.current
    const userRef = doc(db, 'users', user.uid)
    try {
      await updateDoc(userRef, { [`classAttendances.${sessionKey}`]: payload as unknown as FieldValue })
    } catch {
      await setDoc(userRef, { classAttendances: { [sessionKey]: payload } }, { merge: true })
    }
  }, [user, sinifAdi, date, time, bellSchedule])

  return { marks, notes, herkesGeldi, loading, setMark, setNote, markEveryonePresent, replaceMarks, lessonPeriod }
}
