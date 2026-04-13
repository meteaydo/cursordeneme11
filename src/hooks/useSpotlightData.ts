import { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useCourses } from './useCourses'
import type { Student, Application } from '@/types'

export interface SpotlightStudent extends Student {
  dersAdi: string
  sinifAdi: string
}

export interface SpotlightApplication extends Application {
  dersAdi: string
  sinifAdi: string
}

export interface SpotlightData {
  students: SpotlightStudent[]
  applications: SpotlightApplication[]
  loading: boolean
}

export function useSpotlightData(enabled: boolean): SpotlightData {
  const { courses } = useCourses()
  const [students, setStudents] = useState<SpotlightStudent[]>([])
  const [applications, setApplications] = useState<SpotlightApplication[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || courses.length === 0) return

    let cancelled = false
    setLoading(true)

    async function fetchAll() {
      const allStudents: SpotlightStudent[] = []
      const allApplications: SpotlightApplication[] = []

      await Promise.all(
        courses.map(async (course) => {
          const [studentsSnap, applicationsSnap] = await Promise.all([
            getDocs(collection(db, 'courses', course.id, 'students')),
            getDocs(collection(db, 'courses', course.id, 'applications')),
          ])

          studentsSnap.docs.forEach((d) => {
            allStudents.push({
              id: d.id,
              courseId: course.id,
              dersAdi: course.dersAdi,
              sinifAdi: course.sinifAdi,
              ...(d.data() as Omit<Student, 'id' | 'courseId'>),
              createdAt: d.data().createdAt?.toDate() ?? new Date(),
            })
          })

          applicationsSnap.docs.forEach((d) => {
            allApplications.push({
              id: d.id,
              courseId: course.id,
              dersAdi: course.dersAdi,
              sinifAdi: course.sinifAdi,
              ...(d.data() as Omit<Application, 'id' | 'courseId'>),
              createdAt: d.data().createdAt?.toDate() ?? new Date(),
            })
          })
        })
      )

      if (!cancelled) {
        setStudents(allStudents)
        setApplications(allApplications)
        setLoading(false)
      }
    }

    fetchAll()

    return () => {
      cancelled = true
    }
  }, [enabled, courses])

  return { students, applications, loading }
}
