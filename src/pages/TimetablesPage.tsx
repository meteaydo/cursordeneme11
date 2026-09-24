import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarRange, GripVertical, Loader2, Plus } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Card, CardContent } from '@/components/ui/card'
import {
  readSelectedTimetableId,
  saveTimetableOrder,
  useTimetables,
  writeSelectedTimetableId,
} from '@/hooks/useTimetables'
import type { Timetable } from '@/types'

export default function TimetablesPage() {
  const navigate = useNavigate()
  const { items: source, loading } = useTimetables()
  const [selectedId, setSelectedId] = useState(readSelectedTimetableId)
  const [draft, setDraft] = useState<Timetable[] | null>(null)
  const items = draft ?? source
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    if (!draft) return
    const same = draft.length === source.length && draft.every((item, index) => item.id === source[index]?.id)
    if (same) setDraft(null)
  }, [source, draft])

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(items, oldIndex, newIndex)
    setDraft(next)
    void saveTimetableOrder(next.map((item) => item.id)).catch((error) => {
      console.error(error)
      setDraft(null)
    })
  }

  return (
    <Layout title="Ders programları" showBack backTo="/courses" backTitle="Derslerim">
      <div className="space-y-4 pb-32">
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <section className="space-y-3">
                {items.map((item) => (
                  <SortableProgramCard
                    key={item.id}
                    item={item}
                    shown={item.id === (items.some((row) => row.id === selectedId) ? selectedId : items[0]?.id)}
                    onOpen={() => navigate(`/ders-programlari/${item.id}`)}
                    onShow={() => {
                      writeSelectedTimetableId(item.id)
                      setSelectedId(item.id)
                    }}
                  />
                ))}
              </section>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <button
        type="button"
        onClick={() => navigate('/ders-programlari/yeni')}
        className="fixed bottom-28 right-4 md:right-8 w-14 h-14 rounded-full transition-all duration-200 z-[110] bg-gradient-to-b from-blue-400 to-blue-600 text-white border-t border-blue-300/50 shadow-[inset_0_-4px_6px_rgba(0,0,0,0.3),inset_0_2px_4px_rgba(255,255,255,0.3),0_6px_12px_rgba(37,99,235,0.4)] hover:from-blue-400 hover:to-blue-500 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.4),0_2px_4px_rgba(37,99,235,0.4)] active:from-blue-500 active:to-blue-600 flex items-center justify-center"
        aria-label="Yeni program ekle"
      >
        <Plus size={28} strokeWidth={2.5} className="drop-shadow-md" />
      </button>
    </Layout>
  )
}

function SortableProgramCard({
  item,
  shown,
  onOpen,
  onShow,
}: {
  item: Timetable
  shown: boolean
  onOpen: () => void
  onShow: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'z-10' : undefined}
    >
      <Card className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]" onClick={onOpen}>
        <CardContent className="p-4 flex items-center gap-3">
          <button
            type="button"
            className="shrink-0 touch-none text-muted-foreground cursor-grab active:cursor-grabbing"
            aria-label="Sırayı değiştir"
            onClick={(event) => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-base truncate">{item.teacherName || 'Adsız program'}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {item.startTime} · {item.lessonsPerDay} ders · {item.lessonMinutes} dk
            </p>
          </div>
          <label
            className="shrink-0 inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium cursor-pointer"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={shown}
              onChange={onShow}
            />
            Açılışta Göster
          </label>
        </CardContent>
      </Card>
    </div>
  )
}
