import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { BookOpen, Loader2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { db } from '@/lib/firebase'
import { formatClassName } from '@/lib/utils'
import type { StudentDashboard } from '@/types'

export default function StudentHomePage() {
  const { okulNo } = useAuth()
  const [dash, setDash] = useState<StudentDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!okulNo) {
      setDash(null)
      setLoading(false)
      return
    }
    const unsub = onSnapshot(
      doc(db, 'studentDashboards', okulNo),
      (snap) => {
        setDash(snap.exists() ? (snap.data() as StudentDashboard) : null)
        setLoading(false)
      },
      () => {
        setDash(null)
        setLoading(false)
      },
    )
    return unsub
  }, [okulNo])

  return (
    <Layout title="Derslerim" showLogout hideNav>
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !dash?.courses?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Henüz görüntülenecek ders yok. Öğretmeninin PIN oluşturmasını bekleyin.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {dash.adSoyad} · No {dash.no}
          </p>
          {dash.courses.map((c) => (
            <Link key={c.courseId} to={`/ogrenci/${c.courseId}/${c.studentId}`} className="block">
              <Card className="hover:shadow-md transition-shadow active:scale-[0.99]">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.dersAdi}</div>
                    <div className="text-xs text-muted-foreground">{formatClassName(c.sinifAdi)}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  )
}
