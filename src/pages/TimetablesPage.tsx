import { useNavigate } from 'react-router-dom'
import { CalendarRange, Loader2, Plus } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useTimetables } from '@/hooks/useTimetables'

export default function TimetablesPage() {
  const navigate = useNavigate()
  const { items, loading } = useTimetables()

  return (
    <Layout title="Ders programları" showBack backTo="/courses" backTitle="Derslerim">
      <div className="space-y-4 pb-32">
        <Button type="button" className="w-full" onClick={() => navigate('/ders-programlari/yeni')}>
          <Plus className="h-4 w-4" />
          Yeni program ekle
        </Button>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <CalendarRange className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
            <p className="text-muted-foreground">Henüz ders programı yok.</p>
          </div>
        ) : (
          <section className="space-y-3">
            {items.map((item) => (
              <Card
                key={item.id}
                className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]"
                onClick={() => navigate(`/ders-programlari/${item.id}`)}
              >
                <CardContent className="p-4">
                  <h3 className="font-semibold text-base truncate">{item.teacherName || 'Adsız program'}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {item.startTime} · {item.lessonsPerDay} ders · {item.lessonMinutes} dk
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
        )}
      </div>
    </Layout>
  )
}
