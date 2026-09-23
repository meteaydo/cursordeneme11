import { useLocation, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Card, CardContent } from '@/components/ui/card'
import { OfflineImage } from '@/components/ui/OfflineImage'
import { useClassRoster } from '@/hooks/useClassRoster'
import { formatClassName } from '@/lib/utils'

export default function ClassDetailPage() {
  const { sinifAdi: raw = '' } = useParams()
  const location = useLocation()
  const fromSchoolLists = location.pathname.startsWith('/school-lists')
  const sinifAdi = formatClassName(decodeURIComponent(raw))
  const { rows, loading } = useClassRoster(sinifAdi)

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
                    <p className="text-xs text-muted-foreground">
                      No: {s.no}
                      {s.pcNo ? ` · ${s.pcNo}` : ''}
                    </p>
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
