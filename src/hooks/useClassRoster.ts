import { useEffect, useMemo, useState } from 'react'
import { useCourses } from '@/hooks/useCourses'
import { useCourseStats } from '@/hooks/useCourseStats'
import { useStudents } from '@/hooks/useStudents'
import { parseClassTemplate } from '@/services/classTemplateService'
import { formatClassName, formatTitleCase } from '@/lib/utils'

export type ClassRosterRow = {
  id: string
  no: string
  adSoyad: string
  foto?: string
  pcNo?: string
}

export function useClassRoster(sinifAdi: string) {
  const ad = formatClassName(sinifAdi)
  const { courses, loading: coursesLoading } = useCourses()
  const { stats, loading: statsLoading } = useCourseStats(courses)

  const sourceCourseId = useMemo(() => {
    const matches = courses.filter((c) => formatClassName(c.sinifAdi || '') === ad)
    if (matches.length === 0) return ''
    return matches.reduce((best, c) => {
      const bestCount = stats[best.id]?.studentCount || 0
      const count = stats[c.id]?.studentCount || 0
      return count >= bestCount ? c : best
    }, matches[0]).id
  }, [courses, stats, ad])

  const { students, loading: studentsLoading } = useStudents(sourceCourseId)
  const [templateRows, setTemplateRows] = useState<ClassRosterRow[]>([])
  const [templateLoading, setTemplateLoading] = useState(false)

  useEffect(() => {
    if (coursesLoading || statsLoading || studentsLoading) return
    if (sourceCourseId) {
      setTemplateRows([])
      setTemplateLoading(false)
      return
    }
    let cancelled = false
    setTemplateLoading(true)
    parseClassTemplate(ad)
      .then((parsed) => {
        if (cancelled) return
        setTemplateRows(
          parsed.map((s, i) => ({
            id: `tpl-${s.no}-${i}`,
            no: s.no,
            adSoyad: formatTitleCase(s.adSoyad),
            foto: s.foto ? URL.createObjectURL(s.foto) : undefined,
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setTemplateRows([])
      })
      .finally(() => {
        if (!cancelled) setTemplateLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [coursesLoading, statsLoading, studentsLoading, sourceCourseId, ad])

  useEffect(() => {
    return () => {
      templateRows.forEach((r) => {
        if (r.foto?.startsWith('blob:')) URL.revokeObjectURL(r.foto)
      })
    }
  }, [templateRows])

  const rows: ClassRosterRow[] =
    students.length > 0
      ? students.map((s) => ({ id: s.id, no: s.no, adSoyad: s.adSoyad, foto: s.foto, pcNo: s.pcNo }))
      : templateRows

  const loading =
    coursesLoading ||
    statsLoading ||
    (!!sourceCourseId && studentsLoading) ||
    (!sourceCourseId && templateLoading)

  return { rows, loading, sourceCourseId }
}
