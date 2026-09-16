import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, School } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { fetchClassList } from '@/services/classTemplateService'
import { formatClassName, getClassColor } from '@/lib/utils'

export default function SchoolListsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [templates, setTemplates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchClassList()
      .then(setTemplates)
      .finally(() => setLoading(false))
  }, [])

  const schoolClasses = useMemo(
    () =>
      templates
        .map(formatClassName)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'tr', { numeric: true })),
    [templates],
  )

  const q = search.toLowerCase()
  const filtered = schoolClasses.filter((ad) => ad.toLowerCase().includes(q))

  return (
    <Layout title="Okul listeleri" showBack backTo="/courses" backTitle="Derslerim">
      <div className="space-y-6 pb-32">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Şube ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <School className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
            <p className="text-muted-foreground">
              {search ? 'Arama sonucu bulunamadı.' : 'Okul listesi yok.'}
            </p>
          </div>
        ) : (
          <section className="space-y-3">
            {filtered.map((ad) => (
              <Card
                key={ad}
                className={`cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99] border-l-4 ${getClassColor(ad)}`}
                onClick={() => navigate(`/school-lists/${encodeURIComponent(ad)}`)}
              >
                <CardContent className="p-4 flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-base truncate">{ad}</h3>
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
                    Fotoğraflı liste
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </section>
        )}
      </div>
    </Layout>
  )
}
