import { useState, useEffect } from 'react'
import {
  collection,
  query,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDocs,
  setDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Application, Score } from '@/types'

export function useApplications(courseId: string) {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Boş veya geçersiz courseId durumunu kontrol et
    if (!courseId || courseId.trim() === '') {
      setApplications([])
      setLoading(false)
      return
    }
    
    const q = query(
      collection(db, 'courses', courseId, 'applications'),
    )
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        courseId,
        ...(d.data() as Omit<Application, 'id' | 'courseId'>),
        createdAt: d.data().createdAt?.toDate() ?? new Date(),
      }))
      list.sort((a, b) => {
        const diff = b.tarih.localeCompare(a.tarih)
        if (diff !== 0) return diff
        return b.createdAt.getTime() - a.createdAt.getTime()
      })
      setApplications(list)
      setLoading(false)
    }, (error) => {
      console.error('Firestore applications listener error:', error)
      setApplications([])
      setLoading(false)
    })
    return unsub
  }, [courseId])

  const addApplication = async (ad: string, tarih: string) => {
    // Generate ID immediately for optimistic UI
    const docRef = doc(collection(db, 'courses', courseId, 'applications'))
    
    // Don't await in offline mode, just send the write to cache
    setDoc(docRef, {
      ad,
      tarih,
      createdAt: serverTimestamp(),
    }).catch(console.error)
    
    return docRef.id
  }

  const updateApplication = async (appId: string, data: { ad?: string; tarih?: string; foto?: string }) => {
    updateDoc(doc(db, 'courses', courseId, 'applications', appId), data).catch(console.error)
  }

  const deleteApplication = async (appId: string) => {
    deleteDoc(doc(db, 'courses', courseId, 'applications', appId)).catch(console.error)
  }

  const getScores = async (appId: string): Promise<Score[]> => {
    try {
      const snap = await getDocs(collection(db, 'courses', courseId, 'applications', appId, 'scores'))
      return snap.docs.map((d) => ({ id: d.id, applicationId: appId, ...(d.data() as Omit<Score, 'id' | 'applicationId'>) }))
    } catch (e) {
      console.warn("Could not fetch scores, might be offline.", e)
      return []
    }
  }

  const setScore = async (
    appId: string,
    studentId: string,
    fields: {
      puan?: number | null
      kameraFoto?: string | null
      devamsiz?: boolean
      kisaNot?: string
    },
  ) => {
    // Fire and forget for optimistic UI
    setDoc(
      doc(db, 'courses', courseId, 'applications', appId, 'scores', studentId),
      { studentId, ...fields },
      { merge: true },
    ).catch(console.error)
  }

  return { applications, loading, addApplication, updateApplication, deleteApplication, getScores, setScore }
}
