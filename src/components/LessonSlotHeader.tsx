import { useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
}: {
  lessonPeriod?: number
  date: string
  time: string
  onDateChange: (date: string) => void
  onTimeChange: (time: string) => void
}) {
  const dateInputRef = useRef<HTMLInputElement>(null)
  const [timeDialogOpen, setTimeDialogOpen] = useState(false)

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 min-w-0 px-0.5">
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
