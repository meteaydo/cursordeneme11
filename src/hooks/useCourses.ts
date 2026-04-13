import { useState, useEffect } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import type { Course, CourseFormData } from '@/types'

export function useCourses() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setCourses([])
      setLoading(false)
      return
    }
    const q = query(
      collection(db, 'courses'),
      where('teacherId', '==', user.uid),
    )
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Course, 'id'>),
        createdAt: d.data().createdAt?.toDate() ?? new Date(),
        hasPendingWrites: d.metadata.hasPendingWrites
      }))
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      setCourses(list)
      setLoading(false)
    }, (error) => {
      console.error('Firestore courses listener error:', error)
      setCourses([])
      setLoading(false)
    })
    return unsub
  }, [user])

  const addCourse = async (data: CourseFormData) => {
    if (!user) return
    const docRef = doc(collection(db, 'courses'))
    setDoc(docRef, {
      ...data,
      teacherId: user.uid,
      createdAt: serverTimestamp(),
    }).catch(console.error)
    return docRef.id
  }

  const updateCourse = async (id: string, data: Partial<Course>) => {
    updateDoc(doc(db, 'courses', id), data).catch(console.error)
  }

  const deleteCourse = async (id: string) => {
    deleteDoc(doc(db, 'courses', id)).catch(console.error)
  }

  return { courses, loading, addCourse, updateCourse, deleteCourse }
}
