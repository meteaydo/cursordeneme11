import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { normalizeTime } from '@/hooks/useClassAttendance'
import { cn } from '@/lib/utils'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

interface TimeInput24Props {
  id?: string
  value: string
  onChange: (value: string) => void
  className?: string
}

/** Saat seçimi — her zaman 24 saat (SS:DD), AM/PM yok */
export function TimeInput24({ id, value, onChange, className }: TimeInput24Props) {
  const [h, m] = normalizeTime(value).split(':')

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Select value={h} onValueChange={(hour) => onChange(normalizeTime(`${hour}:${m}`))}>
        <SelectTrigger id={id} className="flex-1 tabular-nums" aria-label="Saat">
          <SelectValue placeholder="SS" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {HOURS.map((hour) => (
            <SelectItem key={hour} value={hour}>
              {hour}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground font-semibold shrink-0">:</span>
      <Select value={m} onValueChange={(minute) => onChange(normalizeTime(`${h}:${minute}`))}>
        <SelectTrigger className="flex-1 tabular-nums" aria-label="Dakika">
          <SelectValue placeholder="DD" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {MINUTES.map((minute) => (
            <SelectItem key={minute} value={minute}>
              {minute}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
