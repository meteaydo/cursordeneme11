import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { SharedSeatingPlan, SeatObject } from '@/types'

const COLLECTION = 'sharedSeatingPlans'

interface SharePayload {
  courseId: string
  teacherId: string
  teacherName: string
  dersAdi: string
  sinifAdi: string
  layoutMode: 'classroom' | 'lab'
  classroomLayout: SeatObject[]
  labLayout: SeatObject[]
  studentCount: number
}

/**
 * Oturma planını paylaşıma açar (upsert).
 * Doc ID olarak courseId kullanılır — her kurs için tek paylaşım kaydı.
 */
export async function shareSeatingPlan(payload: SharePayload): Promise<void> {
  const ref = doc(db, COLLECTION, payload.courseId)
  await setDoc(ref, {
    ...payload,
    sharedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * Oturma planının paylaşımını kapatır (belgeyi siler).
 */
export async function unshareSeatingPlan(courseId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, courseId))
}

/**
 * Belirli bir sınıfa ait paylaşılmış oturma planlarını realtime dinler.
 * sinifAdi filtresiyle sorgu yapar.
 */
export function listenSharedSeatingPlans(
  sinifAdi: string,
  callback: (plans: SharedSeatingPlan[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, COLLECTION),
    where('sinifAdi', '==', sinifAdi),
  )

  return onSnapshot(q, (snap) => {
    const plans: SharedSeatingPlan[] = snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        courseId: data.courseId,
        teacherId: data.teacherId,
        teacherName: data.teacherName,
        dersAdi: data.dersAdi,
        sinifAdi: data.sinifAdi,
        layoutMode: data.layoutMode,
        classroomLayout: data.classroomLayout ?? [],
        labLayout: data.labLayout ?? [],
        studentCount: data.studentCount ?? 0,
        sharedAt: data.sharedAt?.toDate() ?? new Date(),
        updatedAt: data.updatedAt?.toDate() ?? new Date(),
      }
    })
    // En yeni paylaşımlar üstte
    plans.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    callback(plans)
  }, (err) => {
    console.error('Shared seating plans listener error:', err)
    onError?.(err as Error)
  })
}
