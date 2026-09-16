import { useState, useEffect } from 'react'
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
  increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { ClassStudent } from '@/types'

export interface ClassStudentForm {
  no: string
  adSoyad: string
  foto?: string
  pcNo?: string
}

export function useClassStudents(classId: string) {
  const [students, setStudents] = useState<ClassStudent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!classId) {
      setStudents([])
      setLoading(false)
      return
    }
    const unsub = onSnapshot(
      collection(db, 'classes', classId, 'students'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          classId,
          ...(d.data() as Omit<ClassStudent, 'id' | 'classId'>),
          createdAt: d.data().createdAt?.toDate() ?? new Date(),
        }))
        list.sort((a, b) => Number(a.no) - Number(b.no) || a.no.localeCompare(b.no))
        setStudents(list)
        setLoading(false)
      },
      (error) => {
        console.error('Firestore class students listener error:', error)
        setStudents([])
        setLoading(false)
      },
    )
    return unsub
  }, [classId])

  const addStudent = async (data: ClassStudentForm) => {
    const docRef = doc(collection(db, 'classes', classId, 'students'))
    await setDoc(docRef, {
      no: data.no,
      adSoyad: data.adSoyad,
      foto: data.foto || '',
      pcNo: data.pcNo || '',
      createdAt: serverTimestamp(),
    })
    await setDoc(doc(db, 'classes', classId), { studentCount: increment(1) }, { merge: true })
    return docRef.id
  }

  const addStudentsBulk = async (studentList: (ClassStudentForm & { id?: string })[]) => {
    const ids: string[] = []
    for (let i = 0; i < studentList.length; i += 400) {
      const chunk = studentList.slice(i, i + 400)
      const batch = writeBatch(db)
      chunk.forEach((s) => {
        const ref = s.id
          ? doc(db, 'classes', classId, 'students', s.id)
          : doc(collection(db, 'classes', classId, 'students'))
        ids.push(ref.id)
        const { id: _id, ...data } = s
        batch.set(ref, {
          no: data.no,
          adSoyad: data.adSoyad,
          foto: data.foto || '',
          pcNo: data.pcNo || '',
          createdAt: serverTimestamp(),
        })
      })
      batch.set(doc(db, 'classes', classId), { studentCount: increment(chunk.length) }, { merge: true })
      await batch.commit()
    }
    return ids
  }

  const deleteStudent = async (studentId: string) => {
    await deleteDoc(doc(db, 'classes', classId, 'students', studentId))
    await setDoc(doc(db, 'classes', classId), { studentCount: increment(-1) }, { merge: true })
  }

  return { students, loading, addStudent, addStudentsBulk, deleteStudent }
}