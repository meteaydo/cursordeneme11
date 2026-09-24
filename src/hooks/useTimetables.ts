import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import type { Timetable } from '@/types'
import { bellScheduleFromDefaults, type BellSchedule } from '@/lib/timetable'

function mapTimetable(id: string, data: Record<string, unknown>): Timetable {
  const created = data.createdAt as { toDate?: () => Date } | undefined
  return {
    id,
    teacherName: String(data.teacherName ?? ''),
    ownerId: String(data.ownerId ?? ''),
    startTime: String(data.startTime ?? '08:30'),
    lessonMinutes: Number(data.lessonMinutes ?? 40),
    breakMinutes: Number(data.breakMinutes ?? 10),
    lunchMinutes: Number(data.lunchMinutes ?? 60),
    lessonsPerDay: Number(data.lessonsPerDay ?? 10),
    cells: (data.cells as Record<string, string>) ?? {},
    sortIndex: typeof data.sortIndex === 'number' ? data.sortIndex : undefined,
    createdAt: created?.toDate?.() ?? new Date(0),
  }
}

function compareTimetables(a: Timetable, b: Timetable) {
  const aHas = typeof a.sortIndex === 'number'
  const bHas = typeof b.sortIndex === 'number'
  if (aHas && bHas && a.sortIndex !== b.sortIndex) return a.sortIndex! - b.sortIndex!
  if (aHas !== bHas) return aHas ? -1 : 1
  return a.createdAt.getTime() - b.createdAt.getTime()
}

export function useTimetables() {
  const { user } = useAuth()
  const [items, setItems] = useState<Timetable[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setItems([])
      setLoading(false)
      return
    }
    const unsub = onSnapshot(
      collection(db, 'timetables'),
      (snap) => {
        const list = snap.docs.map((d) => mapTimetable(d.id, d.data()))
        list.sort(compareTimetables)
        setItems(list)
        setLoading(false)
      },
      (error) => {
        console.error('Ders programları okunamadı:', error)
        setItems([])
        setLoading(false)
      },
    )
    return unsub
  }, [user])

  return { items, loading }
}

export function timetableToBellSchedule(t: Timetable): BellSchedule {
  return {
    startTime: t.startTime,
    lessonMinutes: t.lessonMinutes,
    breakMinutes: t.breakMinutes,
    lunchMinutes: t.lunchMinutes,
    lessonsPerDay: t.lessonsPerDay,
  }
}

/** İlk kayıtlı ders programının zil çizelgesi; yoksa varsayılan. */
export function useBellSchedule() {
  const { items, loading } = useTimetables()
  const schedule = useMemo(
    () => (items.length > 0 ? timetableToBellSchedule(items[0]) : bellScheduleFromDefaults()),
    [items],
  )
  return { schedule, loading }
}

export function useTimetable(id?: string) {
  const [item, setItem] = useState<Timetable | null>(null)
  const [loading, setLoading] = useState(Boolean(id))

  useEffect(() => {
    if (!id) {
      setItem(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = onSnapshot(
      doc(db, 'timetables', id),
      (snap) => {
        setItem(snap.exists() ? mapTimetable(snap.id, snap.data()) : null)
        setLoading(false)
      },
      (error) => {
        console.error('Ders programı okunamadı:', error)
        setItem(null)
        setLoading(false)
      },
    )
    return unsub
  }, [id])

  return { item, loading }
}

export async function saveTimetable(
  id: string | undefined,
  ownerId: string,
  data: Omit<Timetable, 'id' | 'ownerId' | 'createdAt'>,
) {
  const ref = id ? doc(db, 'timetables', id) : doc(collection(db, 'timetables'))
  const payload: Record<string, unknown> = {
    teacherName: data.teacherName.trim(),
    ownerId,
    startTime: data.startTime,
    lessonMinutes: data.lessonMinutes,
    breakMinutes: data.breakMinutes,
    lunchMinutes: data.lunchMinutes,
    lessonsPerDay: data.lessonsPerDay,
    cells: data.cells,
    updatedAt: serverTimestamp(),
  }
  if (!id) {
    payload.createdAt = serverTimestamp()
    await setDoc(ref, payload)
  } else {
    await updateDoc(ref, {
      teacherName: data.teacherName.trim(),
      ownerId,
      startTime: data.startTime,
      lessonMinutes: data.lessonMinutes,
      breakMinutes: data.breakMinutes,
      lunchMinutes: data.lunchMinutes,
      lessonsPerDay: data.lessonsPerDay,
      cells: data.cells,
      updatedAt: serverTimestamp(),
    })
  }
  return ref.id
}

const SELECTED_TIMETABLE_KEY = 'ogretmen.selectedTimetableId'

export function readSelectedTimetableId() {
  try {
    return localStorage.getItem(SELECTED_TIMETABLE_KEY) || ''
  } catch {
    return ''
  }
}

export function writeSelectedTimetableId(id: string) {
  try {
    localStorage.setItem(SELECTED_TIMETABLE_KEY, id)
  } catch {
    /* depolama kapalı olabilir */
  }
}

export function pickTimetableId(items: { id: string }[]) {
  const selected = readSelectedTimetableId()
  if (selected && (items.length === 0 || items.some((item) => item.id === selected))) return selected
  return items[0]?.id ?? ''
}

export async function deleteTimetable(id: string) {
  await deleteDoc(doc(db, 'timetables', id))
}

export async function saveTimetableOrder(ids: string[]) {
  const batch = writeBatch(db)
  ids.forEach((id, index) => {
    batch.update(doc(db, 'timetables', id), { sortIndex: index })
  })
  await batch.commit()
}
