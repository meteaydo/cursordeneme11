import { useState, useEffect } from 'react'
import { collection, query, onSnapshot } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase'
import type { Course } from '@/types'

export type CourseStatsEntry = {
  studentCount: number
  appCount: number
  kizCount: number
  erkekCount: number
}

const EMPTY_STATS: CourseStatsEntry = { studentCount: 0, appCount: 0, kizCount: 0, erkekCount: 0 }

function genderCountsFromStudents(docs: { data: () => Record<string, unknown> }[]) {
  let kizCount = 0
  let erkekCount = 0
  for (const d of docs) {
    const c = d.data().cinsiyet
    if (c === 'K') kizCount++
    else if (c === 'E') erkekCount++
  }
  return { kizCount, erkekCount }
}

export function useCourseStats(courses: Course[]) {
  const [stats, setStats] = useState<Record<string, CourseStatsEntry>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!courses || courses.length === 0 || !auth.currentUser) {
      setLoading(false)
      return
    }

    const unsubs: (() => void)[] = []
    let isMounted = true
    
    courses.forEach(course => {
      if (course.hasPendingWrites) {
        setStats(prev => ({
          ...prev,
          [course.id]: { ...(prev[course.id] || EMPTY_STATS) }
        }))
        return
      }

      // Öğrencileri dinle
      const sq = query(collection(db, 'courses', course.id, 'students'))
      unsubs.push(onSnapshot(sq, (snap) => {
        if (!isMounted) return
        const { kizCount, erkekCount } = genderCountsFromStudents(snap.docs)
        setStats(prev => ({
          ...prev,
          [course.id]: { ...(prev[course.id] || EMPTY_STATS), studentCount: snap.docs.length, kizCount, erkekCount },
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
          [course.id]: { ...(prev[course.id] || EMPTY_STATS), appCount: snap.docs.length }
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
