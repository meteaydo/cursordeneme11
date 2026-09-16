import { useState, useEffect } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import type { SchoolClass } from '@/types'

export function useClasses() {
  const { user } = useAuth()
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setClasses([])
      setLoading(false)
      return
    }
    const q = query(collection(db, 'classes'), where('teacherId', '==', user.uid))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SchoolClass, 'id'>),
          studentCount: d.data().studentCount ?? 0,
          createdAt: d.data().createdAt?.toDate() ?? new Date(),
        }))
        list.sort((a, b) => a.ad.localeCompare(b.ad, 'tr', { numeric: true }))
        setClasses(list)
        setLoading(false)
      },
      (error) => {
        console.error('Firestore classes listener error:', error)
        setClasses([])
        setLoading(false)
      },
    )
    return unsub
  }, [user])

  const addClass = async (ad: string, yil: string) => {
    if (!user) return
    const duplicate = classes.find((c) => c.ad === ad && c.yil === yil)
    if (duplicate) throw new Error('Bu öğretim yılında bu sınıf zaten kayıtlı.')
    const docRef = doc(collection(db, 'classes'))
    await setDoc(docRef, {
      teacherId: user.uid,
      ad,
      yil,
      studentCount: 0,
      createdAt: serverTimestamp(),
    })
    return docRef.id
  }

  const deleteClass = async (id: string) => {
    const studentsSnap = await getDocs(collection(db, 'classes', id, 'students'))
    const docs = studentsSnap.docs
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db)
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    await deleteDoc(doc(db, 'classes', id))
  }

  return { classes, loading, addClass, deleteClass }
}