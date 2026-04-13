import { useState, useEffect } from 'react'
import { collection, query, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Course } from '@/types'

export function useCourseStats(courses: Course[]) {
  const [stats, setStats] = useState<Record<string, { studentCount: number; appCount: number }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!courses || courses.length === 0) {
      setLoading(false)
      return
    }

    const unsubs: (() => void)[] = []
    let isMounted = true
    
    courses.forEach(course => {
      if (course.hasPendingWrites) {
        setStats(prev => ({
          ...prev,
          [course.id]: { ...(prev[course.id] || { studentCount: 0, appCount: 0 }) }
        }))
        return
      }

      // Öğrencileri dinle
      const sq = query(collection(db, 'courses', course.id, 'students'))
      unsubs.push(onSnapshot(sq, (snap) => {
        if (!isMounted) return
        setStats(prev => ({
          ...prev,
          [course.id]: { ...(prev[course.id] || { appCount: 0 }), studentCount: snap.docs.length }
        }))
      }, (error) => {
         console.error('Stats student error:', error)
      }))

      // Uygulamaları dinle
      const aq = query(collection(db, 'courses', course.id, 'applications'))
      unsubs.push(onSnapshot(aq, (snap) => {
        if (!isMounted) return
        setStats(prev => ({
          ...prev,
          [course.id]: { ...(prev[course.id] || { studentCount: 0 }), appCount: snap.docs.length }
        }))
      }, (error) => {
         console.error('Stats app error:', error)
      }))
    })

    setLoading(false)

    return () => {
      isMounted = false
      unsubs.forEach(u => u())
    }
  }, [courses])

  return { stats, loading }
}
