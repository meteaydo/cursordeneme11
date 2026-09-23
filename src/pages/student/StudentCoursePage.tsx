import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Loader2, Star } from 'lucide-react'
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Layout } from '@/components/layout/Layout'
import { Card, CardContent } from '@/components/ui/card'
import { db } from '@/lib/firebase'
import { formatClassName } from '@/lib/utils'
import type { StudentPortalPublic } from '@/types'

export default function StudentCoursePage() {
  const { courseId, studentId } = useParams<{ courseId: string; studentId: string }>()
  const [portal, setPortal] = useState<StudentPortalPublic | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!courseId || !studentId) return
    const unsub = onSnapshot(
      doc(db, 'courses', courseId, 'students', studentId, 'portal', 'public'),
      (snap) => {
        setPortal(snap.exists() ? (snap.data() as StudentPortalPublic) : null)
        setLoading(false)
      },
      () => {
        setPortal(null)
        setLoading(false)
      },
    )
    return unsub
  }, [courseId, studentId])

  const chartData = useMemo(() => {
    return (portal?.scores ?? [])
      .filter((s) => s.puan !== null && s.puan !== undefined)
      .slice()
      .reverse()
      .map((s) => ({
        name: s.tarih ? format(new Date(s.tarih + 'T12:00:00'), 'd MMM', { locale: tr }) : s.ad,
        puan: s.puan as number,
      }))
  }, [portal])

  const title = portal ? `${portal.dersAdi}` : 'Ders'

  return (
    <Layout
      title={title}
      showBack
      backTo="/ogrenci"
      backTitle="Derslerim"
      showLogout
      hideNav
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !portal ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Bu ders için henüz özet yok.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {portal.adSoyad} · {formatClassName(portal.sinifAdi)}
          </div>

          <Card className="border-amber-400/80 border-2 bg-amber-50/10 shadow-md">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Davranış</h3>
                <div className="flex items-center gap-1.5">
                  {(portal.behaviorStars?.yellow ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded-full border border-yellow-200">
                      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-500" />
                      x{portal.behaviorStars!.yellow}
                    </span>
                  )}
                  {(portal.behaviorStars?.purple ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full border border-purple-200">
                      <Star className="w-3.5 h-3.5 fill-purple-400 text-purple-500" />
                      x{portal.behaviorStars!.purple}
                    </span>
                  )}
                </div>
              </div>
              {(portal.behaviorLogs ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Kayıt yok.</p>
              ) : (
                <ul className="space-y-2">
                  {(portal.behaviorLogs ?? []).slice().reverse().map((log) => (
                    <li key={log.id} className="text-sm border rounded-lg px-3 py-2 bg-white/70">
                      <div className="text-[11px] text-muted-foreground">
                        {log.date ? format(new Date(log.date), 'd MMM yyyy', { locale: tr }) : ''}
                      </div>
                      <div>{log.note}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="font-semibold text-sm">Uygulama puanları</h3>
              {(portal.scores ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Henüz uygulama yok.</p>
              ) : (
                <ul className="divide-y">
                  {(portal.scores ?? []).map((s) => (
                    <li key={s.appId} className="py-2 flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium">{s.ad}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {s.tarih ? format(new Date(s.tarih + 'T12:00:00'), 'd MMM yyyy', { locale: tr }) : ''}
                          {s.kisaNot ? ` · ${s.kisaNot}` : ''}
                        </div>
                      </div>
                      <div className="shrink-0 font-semibold tabular-nums">
                        {s.devamsiz ? 'D' : s.puan ?? '—'}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-indigo-400/80 border-2 bg-indigo-50/10 shadow-md">
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3">Uygulama puanları grafiği</h3>
              {chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Henüz puan girilmedi.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="puan"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ fill: '#6366f1', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </Layout>
  )
}
