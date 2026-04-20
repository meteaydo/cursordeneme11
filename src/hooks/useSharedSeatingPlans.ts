import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { SharedSeatingPlan, SeatObject } from '@/types'
import {
  shareSeatingPlan,
  unshareSeatingPlan,
  listenSharedSeatingPlans,
} from '@/services/sharedSeatingService'

/**
 * Belirli bir sınıfa ait paylaşılmış oturma planlarını dinler.
 * sinifAdi değiştiğinde listener otomatik yenilenir.
 */
export function useSharedSeatingPlans(sinifAdi: string | undefined) {
  const { user } = useAuth()
  const [sharedPlans, setSharedPlans] = useState<SharedSeatingPlan[]>([])
  const [loading, setLoading] = useState(true)

  // Realtime listener
  useEffect(() => {
    if (!sinifAdi) {
      setSharedPlans([])
      setLoading(false)
      return
    }

    setLoading(true)
    const unsub = listenSharedSeatingPlans(
      sinifAdi,
      (plans) => {
        setSharedPlans(plans)
        setLoading(false)
      },
      () => {
        setSharedPlans([])
        setLoading(false)
      },
    )

    return unsub
  }, [sinifAdi])

  /** Oturma planını paylaşıma açar */
  const share = useCallback(
    async (params: {
      courseId: string
      dersAdi: string
      sinifAdi: string
      layoutMode: 'classroom' | 'lab'
      classroomLayout: SeatObject[]
      labLayout: SeatObject[]
      studentCount: number
    }) => {
      if (!user) return
      await shareSeatingPlan({
        ...params,
        teacherId: user.uid,
        teacherName: user.displayName ?? user.email ?? 'Bilinmeyen',
      })
    },
    [user],
  )

  /** Paylaşımı kapatır */
  const unshare = useCallback(
    async (courseId: string) => {
      await unshareSeatingPlan(courseId)
    },
    [],
  )

  return { sharedPlans, loading, share, unshare }
}
