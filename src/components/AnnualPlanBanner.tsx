import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AnnualPlan } from '@/types'
import { findPlanItemForDate, formatPlanRange } from '@/lib/annualPlanParser'

const KIND_LABEL = {
  current: 'Bu hafta',
  upcoming: 'Sıradaki hafta',
  past: 'Son işlenen',
} as const

type AnnualPlanBannerProps = {
  plan?: AnnualPlan
  index?: number
  onIndexChange?: (index: number) => void
}

export function AnnualPlanBanner({ plan, index: indexProp, onIndexChange }: AnnualPlanBannerProps) {
  const items = plan?.items ?? []
  const todayMatch = useMemo(() => findPlanItemForDate(plan), [plan])
  const todayIndex = useMemo(() => {
    if (!todayMatch || !plan) return -1
    return plan.items.findIndex(
      (i) => i.tarihBas === todayMatch.item.tarihBas && i.hafta === todayMatch.item.hafta,
    )
  }, [plan, todayMatch])

  const [uncontrolled, setUncontrolled] = useState(0)
  const isControlled = indexProp !== undefined
  const index = isControlled ? indexProp : uncontrolled

  useEffect(() => {
    if (isControlled) return
    setUncontrolled(todayIndex >= 0 ? todayIndex : 0)
  }, [todayIndex, isControlled])

  if (!items.length) return null

  const item = items[Math.min(index, items.length - 1)]
  if (!item) return null

  const setIndex = (next: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, next))
    if (isControlled) onIndexChange?.(clamped)
    else setUncontrolled(clamped)
  }

  const isHoliday = /tatil|etkinlik haftası/i.test(`${item.unite} ${item.konu} ${item.kazanim}`)
  const header =
    index === todayIndex && todayMatch
      ? `${KIND_LABEL[todayMatch.kind]} · ${item.hafta} · ${formatPlanRange(item)}`
      : `${item.hafta} · ${formatPlanRange(item)}`

  return (
    <div className="-mx-4 px-2 py-2 border-b border-sky-200/80 bg-sky-100 flex items-center gap-0.5">
      <button
        type="button"
        className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md text-sky-800 hover:bg-sky-100 disabled:opacity-30 disabled:pointer-events-none"
        disabled={index <= 0}
        onClick={() => setIndex(index - 1)}
        aria-label="Önceki hafta"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="flex-1 min-w-0 text-center">
        <div className="text-[10px] font-bold uppercase tracking-wide text-sky-800/80">{header}</div>
        {isHoliday ? (
          <div className="text-sm font-semibold text-sky-950 mt-0.5 truncate">{item.konu || item.unite}</div>
        ) : (
          <>
            {item.konu && (
              <div className="text-sm font-semibold text-sky-950 mt-0.5 line-clamp-2">{item.konu}</div>
            )}
            {item.kazanim && (
              <div className="text-xs text-sky-900/80 mt-0.5 line-clamp-2">{item.kazanim}</div>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md text-sky-800 hover:bg-sky-100 disabled:opacity-30 disabled:pointer-events-none"
        disabled={index >= items.length - 1}
        onClick={() => setIndex(index + 1)}
        aria-label="Sonraki hafta"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  )
}
