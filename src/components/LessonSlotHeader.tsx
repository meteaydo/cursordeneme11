import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TimeInput24 } from '@/components/ui/time-input-24'

function formatTrDate(iso: string) {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}

function openPicker(input: HTMLInputElement | null) {
  if (!input) return
  try {
    input.showPicker()
  } catch {
    input.focus()
    input.click()
  }
}

export function LessonSlotHeader({
  lessonPeriod,
  date,
  time,
  onDateChange,
  onTimeChange,
  onPrevLesson,
  onNextLesson,
  prevLessonDisabled,
  nextLessonDisabled,
  prevLessonLabel,
  nextLessonLabel,
}: {
  lessonPeriod?: number
  date: string
  time: string
  onDateChange: (date: string) => void
  onTimeChange: (time: string) => void
  onPrevLesson?: () => void
  onNextLesson?: () => void
  prevLessonDisabled?: boolean
  nextLessonDisabled?: boolean
  prevLessonLabel?: string
  nextLessonLabel?: string
}) {
  const dateInputRef = useRef<HTMLInputElement>(null)
  const [timeDialogOpen, setTimeDialogOpen] = useState(false)

  return (
    <>
      <div className="grid w-full grid-cols-[minmax(4.25rem,5.5rem)_1fr_minmax(4.25rem,5.5rem)] items-center gap-x-0.5 sm:gap-x-2">
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-h-11 py-1.5 px-1 shrink-0 justify-self-start flex flex-col items-center gap-0.5 max-w-[5.5rem] -ml-1 sm:ml-0"
          disabled={prevLessonDisabled ?? !onPrevLesson}
          aria-label={prevLessonLabel ? `Önceki ders: ${prevLessonLabel}` : 'Önceki ders'}
          onClick={onPrevLesson}
        >
          <ChevronLeft className="h-5 w-5 shrink-0" />
          <span className="text-[10px] font-medium leading-none">Önceki</span>
          {prevLessonLabel && !(prevLessonDisabled ?? !onPrevLesson) ? (
            <span className="text-[9px] text-muted-foreground leading-tight text-center line-clamp-2 w-full">
              {prevLessonLabel}
            </span>
          ) : null}
        </Button>
        <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 min-w-0 px-0.5 justify-self-center">
          {lessonPeriod != null ? (
            <span className="text-lg font-semibold text-primary">{lessonPeriod}. ders</span>
          ) : (
            <span className="text-xs text-muted-foreground">Ders aralığı dışı</span>
          )}
          <span className="text-sm text-muted-foreground inline-flex items-baseline gap-1 flex-wrap justify-center">
            <button
              type="button"
              className="tabular-nums rounded-sm underline-offset-2 hover:underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setTimeDialogOpen(true)}
            >
              {time}
            </button>
            <span>
              (
              <button
                type="button"
                className="tabular-nums rounded-sm underline-offset-2 hover:underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => openPicker(dateInputRef.current)}
              >
                {formatTrDate(date)}
              </button>
              )
            </span>
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-h-11 py-1.5 px-1 shrink-0 justify-self-end flex flex-col items-center gap-0.5 max-w-[5.5rem] -mr-1 sm:mr-0"
          disabled={nextLessonDisabled ?? !onNextLesson}
          aria-label={nextLessonLabel ? `Sonraki ders: ${nextLessonLabel}` : 'Sonraki ders'}
          onClick={onNextLesson}
        >
          <ChevronRight className="h-5 w-5 shrink-0" />
          <span className="text-[10px] font-medium leading-none">Sonraki</span>
          {nextLessonLabel && !(nextLessonDisabled ?? !onNextLesson) ? (
            <span className="text-[9px] text-muted-foreground leading-tight text-center line-clamp-2 w-full">
              {nextLessonLabel}
            </span>
          ) : null}
        </Button>
      </div>
      <input
        ref={dateInputRef}
        type="date"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
      />
      <Dialog open={timeDialogOpen} onOpenChange={setTimeDialogOpen}>
        <DialogContent className="max-w-xs sm:top-[40%]">
          <DialogHeader>
            <DialogTitle>Saat (24 saat)</DialogTitle>
          </DialogHeader>
          <TimeInput24 value={time} onChange={onTimeChange} />
        </DialogContent>
      </Dialog>
    </>
  )
}
