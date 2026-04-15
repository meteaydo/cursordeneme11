import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, BookOpen, Clock, Users, Trash2, Loader2, FileText } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useCourses } from '@/hooks/useCourses'
import { useCourseStats } from '@/hooks/useCourseStats'
import type { CourseFormData } from '@/types'
import { formatTitleCase, formatClassName } from '@/lib/utils'

const GUNLER = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

const CLASS_COLORS = [
  'border-l-red-500',
  'border-l-orange-500',
  'border-l-amber-500',
  'border-l-green-500',
  'border-l-emerald-500',
  'border-l-teal-500',
  'border-l-cyan-500',
  'border-l-sky-500',
  'border-l-blue-500',
  'border-l-indigo-500',
  'border-l-violet-500',
  'border-l-purple-500',
  'border-l-fuchsia-500',
  'border-l-pink-500',
  'border-l-rose-500',
]

const getClassColor = (className: string) => {
  if (!className) return 'border-l-primary'
  let hash = 0
  for (let i = 0; i < className.length; i++) {
    hash = className.charCodeAt(i) + ((hash << 5) - hash)
  }
  return CLASS_COLORS[Math.abs(hash) % CLASS_COLORS.length]
}

const EMPTY_FORM: CourseFormData = {
  dersAdi: '',
  sinifAdi: '',
  sinifMevcudu: 0,
  dersGunu: '',
  dersSaati: '',
}

export default function CoursesPage() {
  const navigate = useNavigate()
  const { courses, loading: coursesLoading, addCourse, deleteCourse } = useCourses()
  const { stats, loading: statsLoading } = useCourseStats(courses)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<CourseFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  
  const [deleteCourseId, setDeleteCourseId] = useState<string | null>(null)

  const loading = coursesLoading || statsLoading

  const filteredAndSorted = courses
    .filter(
      (c) =>
        c.dersAdi.toLowerCase().includes(search.toLowerCase()) ||
        c.sinifAdi.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const sinifKiyas = a.sinifAdi.localeCompare(b.sinifAdi, 'tr', { numeric: true })
      if (sinifKiyas !== 0) return sinifKiyas
      return a.dersAdi.localeCompare(b.dersAdi, 'tr')
    })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.dersGunu) {
      setError('Ders günü seçiniz.')
      return
    }
    setSaving(true)
    try {
      addCourse(form) // Optimistic, no await
      setOpen(false)
      setForm(EMPTY_FORM)
    } catch {
      setError('Ders eklenemedi. Lütfen tekrar deneyin.')
    } finally {
      setSaving(false)
    }
  }

  const performDelete = async () => {
    if (!deleteCourseId) return
    deleteCourse(deleteCourseId) // Optimistic, no await
    setDeleteCourseId(null)
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setDeleteCourseId(id)
  }

  return (
    <Layout 
      title="Derslerim"
      rightAction={
        <button
          onClick={() => setOpen(true)}
          className="hidden md:flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 bg-gradient-to-b from-blue-400 to-blue-600 text-white border-t border-blue-300/50 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.3),inset_0_1px_2px_rgba(255,255,255,0.3),0_4px_8px_rgba(37,99,235,0.4)] hover:from-blue-400 hover:to-blue-500 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[inset_0_1px_3px_rgba(0,0,0,0.4),0_1px_2px_rgba(37,99,235,0.4)] active:from-blue-500 active:to-blue-600 translate-x-1/2"
          aria-label="Ders Ekle"
        >
          <Plus size={20} strokeWidth={3} className="drop-shadow-sm" />
        </button>
      }
    >
      <div className="space-y-4 pb-32">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ders ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
            <p className="text-muted-foreground">
              {search ? 'Arama sonucu bulunamadı.' : 'Henüz ders eklenmedi.'}
            </p>
            {!search && (
              <Button onClick={() => setOpen(true)} size="sm">
                <Plus className="mr-2 h-4 w-4" /> İlk Dersini Ekle
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAndSorted.map((course) => (
              <Card
                key={course.id}
                className={`cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99] border-l-4 ${getClassColor(course.sinifAdi)}`}
                onClick={() => navigate(`/courses/${course.id}`, { state: { courseName: course.dersAdi, className: course.sinifAdi } })}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base truncate">{course.dersAdi}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">{course.sinifAdi}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                          <Users className="mr-1 h-3 w-3" />
                          {stats[course.id]?.studentCount || 0} öğrenci
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                          <FileText className="mr-1 h-3 w-3" />
                          {stats[course.id]?.appCount || 0} uygulama
                        </Badge>
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                          <Clock className="mr-1 h-3 w-3" />
                          {course.dersGunu} {course.dersSaati}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDelete(e, course.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* FAB - Only visible on mobile */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed bottom-28 right-6 w-14 h-14 rounded-full transition-all duration-200 z-30 bg-gradient-to-b from-blue-400 to-blue-600 text-white border-t border-blue-300/50 shadow-[inset_0_-4px_6px_rgba(0,0,0,0.3),inset_0_2px_4px_rgba(255,255,255,0.3),0_6px_12px_rgba(37,99,235,0.4)] hover:from-blue-400 hover:to-blue-500 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.4),0_2px_4px_rgba(37,99,235,0.4)] active:from-blue-500 active:to-blue-600 flex items-center justify-center"
        aria-label="Ders Ekle"
      >
        <Plus size={28} strokeWidth={2.5} className="drop-shadow-md" />
      </button>

      {/* Add Course Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Ders Ekle</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dersAdi">Ders Adı *</Label>
              <Input
                id="dersAdi"
                placeholder="Matematik"
                value={form.dersAdi}
                onChange={(e) => setForm({ ...form, dersAdi: formatTitleCase(e.target.value) })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sinifAdi">Sınıf / Şube *</Label>
              <Input
                id="sinifAdi"
                placeholder="9A"
                value={form.sinifAdi}
                onChange={(e) => setForm({ ...form, sinifAdi: formatClassName(e.target.value) })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ders Günü *</Label>
                <Select value={form.dersGunu} onValueChange={(v) => setForm({ ...form, dersGunu: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Gün seç" />
                  </SelectTrigger>
                  <SelectContent>
                    {GUNLER.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dersSaati">Ders Saati</Label>
                <Input
                  id="dersSaati"
                  type="time"
                  value={form.dersSaati}
                  onChange={(e) => setForm({ ...form, dersSaati: e.target.value })}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                İptal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ekle
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteCourseId}
        onOpenChange={(isOpen) => !isOpen && setDeleteCourseId(null)}
        title="Dersi Sil"
        description="Bu dersi silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmText="Sil"
        variant="destructive"
        onConfirm={performDelete}
      />
    </Layout>
  )
}
