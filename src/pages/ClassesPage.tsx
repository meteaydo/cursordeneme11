import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Users, Loader2, ChevronRight } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useCourses } from '@/hooks/useCourses'
import { useCourseStats } from '@/hooks/useCourseStats'
import { formatClassName, getClassColor } from '@/lib/utils'

interface ClassRow {
  ad: string
  courseCount: number
  studentCount: number
  courses: { id: string; dersAdi: string }[]
}

export default function ClassesPage() {
  const navigate = useNavigate()
  const { courses, loading: coursesLoading } = useCourses()
  const { stats, loading: statsLoading } = useCourseStats(courses)
  const [search, setSearch] = useState('')

  const myClasses = useMemo(() => {
    const map = new Map<string, ClassRow>()
    for (const course of courses) {
      const ad = formatClassName(course.sinifAdi || '')
      if (!ad) continue
      const count = stats[course.id]?.studentCount || 0
      const entry = { id: course.id, dersAdi: course.dersAdi || 'Ders' }
      const prev = map.get(ad)
      if (!prev) {
        map.set(ad, { ad, courseCount: 1, studentCount: count, courses: [entry] })
        continue
      }
      prev.courseCount += 1
      prev.courses.push(entry)
      if (count > prev.studentCount) prev.studentCount = count
    }
    for (const row of map.values()) {
      row.courses.sort((a, b) => a.dersAdi.localeCompare(b.dersAdi, 'tr'))
    }
    return [...map.values()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr', { numeric: true }))
  }, [courses, stats])

  const q = search.toLowerCase()
  const filteredMine = myClasses.filter((c) => c.ad.toLowerCase().includes(q))
  const loading = coursesLoading || statsLoading

  return (
    <Layout title="Sınıflarım" showBack backTo="/courses" backTitle="Derslerim">
      <div className="space-y-6 pb-32">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sınıf ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredMine.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Users className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
            <p className="text-muted-foreground">
              {search ? 'Arama sonucu bulunamadı.' : 'Derslerine eklediğin sınıf yok.'}
            </p>
          </div>
        ) : (
          <section className="space-y-3">
            {filteredMine.map((c) => (
              <Card
                key={c.ad}
                className={`cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99] border-l-4 ${getClassColor(c.ad)}`}
                onClick={() => navigate(`/classes/${encodeURIComponent(c.ad)}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-base shrink-0">{c.ad}</h3>
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                          <Users className="mr-1 h-3 w-3" />
                          {c.studentCount} öğrenci
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                          {c.courseCount} ders
                        </Badge>
                      </div>
                      <ul className="space-y-1">
                        {c.courses.map((course) => (
                          <li key={course.id}>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 max-w-full text-left text-sm text-foreground hover:text-primary transition-colors rounded-md py-1 -ml-1 px-1 active:bg-muted/60 group"
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/courses/${course.id}`)
                              }}
                            >
                              <span className="truncate">{course.dersAdi}</span>
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex flex-col items-stretch gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/classes/${encodeURIComponent(c.ad)}/yoklama`)
                        }}
                      >
                        Yoklama al
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/classes/${encodeURIComponent(c.ad)}/yoklamalar`)
                        }}
                      >
                        Yoklama defteri
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        )}
      </div>
    </Layout>
  )
}
