import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Card, CardContent } from '@/components/ui/card'
import { OfflineImage } from '@/components/ui/OfflineImage'
import { useCourses } from '@/hooks/useCourses'
import { useCourseStats } from '@/hooks/useCourseStats'
import { useStudents } from '@/hooks/useStudents'
import { parseClassTemplate } from '@/services/classTemplateService'
import { formatClassName, formatTitleCase } from '@/lib/utils'

type RosterRow = {
  id: string
  no: string
  adSoyad: string
  foto?: string
  pcNo?: string
}

export default function ClassDetailPage() {
  const { sinifAdi: raw = '' } = useParams()
  const location = useLocation()
  const fromSchoolLists = location.pathname.startsWith('/school-lists')
  const sinifAdi = formatClassName(decodeURIComponent(raw))
  const { courses, loading: coursesLoading } = useCourses()
  const { stats, loading: statsLoading } = useCourseStats(courses)

  const sourceCourseId = useMemo(() => {
    const matches = courses.filter((c) => formatClassName(c.sinifAdi || '') === sinifAdi)
    if (matches.length === 0) return ''
    return matches.reduce((best, c) => {
      const bestCount = stats[best.id]?.studentCount || 0
      const count = stats[c.id]?.studentCount || 0
      return count >= bestCount ? c : best
    }, matches[0]).id
  }, [courses, stats, sinifAdi])

  const { students, loading: studentsLoading } = useStudents(sourceCourseId)
  const [templateRows, setTemplateRows] = useState<RosterRow[]>([])
  const [templateLoading, setTemplateLoading] = useState(false)

  useEffect(() => {
    if (coursesLoading || statsLoading || studentsLoading) return
    if (sourceCourseId && students.length > 0) {
      setTemplateRows([])
      return
    }
    let cancelled = false
    setTemplateLoading(true)
    parseClassTemplate(sinifAdi)
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
  }, [coursesLoading, statsLoading, studentsLoading, sourceCourseId, students.length, sinifAdi])

  useEffect(() => {
    return () => {
      templateRows.forEach((r) => {
        if (r.foto?.startsWith('blob:')) URL.revokeObjectURL(r.foto)
      })
    }
  }, [templateRows])

  const rows: RosterRow[] =
    students.length > 0
      ? students.map((s) => ({ id: s.id, no: s.no, adSoyad: s.adSoyad, foto: s.foto, pcNo: s.pcNo }))
      : templateRows

  const loading = coursesLoading || statsLoading || (!!sourceCourseId && studentsLoading) || templateLoading

  return (
    <Layout
      title={sinifAdi || 'Sınıf'}
      showBack
      backTo={fromSchoolLists ? '/school-lists' : '/classes'}
      backTitle={fromSchoolLists ? 'Okul listeleri' : 'Sınıflarım'}
    >
      <div className="space-y-4 pb-32">
        <p className="text-sm text-muted-foreground">{rows.length} öğrenci</p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              Bu sınıfa ait kayıtlı öğrenci listesi yok.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
                    {s.foto ? (
                      s.foto.startsWith('blob:') ? (
                        <img src={s.foto} alt={s.adSoyad} className="w-full h-full object-cover" />
                      ) : (
                        <OfflineImage src={s.foto} alt={s.adSoyad} className="w-full h-full object-cover" />
                      )
                    ) : (
                      <span className="text-primary font-semibold text-xs">
                        {s.adSoyad.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{s.adSoyad}</p>
                    <p className="text-xs text-muted-foreground">No: {s.no}{s.pcNo ? ` · ${s.pcNo}` : ''}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}