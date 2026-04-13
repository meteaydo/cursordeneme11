import { useEffect, useRef, useState, useCallback } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import Fuse from 'fuse.js'
import { Search, BookOpen, User, FileText, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useCourses } from '@/hooks/useCourses'
import { useSpotlightData } from '@/hooks/useSpotlightData'
import type { Course } from '@/types'
import type { SpotlightStudent, SpotlightApplication } from '@/hooks/useSpotlightData'

type ResultItem =
  | { type: 'course'; item: Course }
  | { type: 'student'; item: SpotlightStudent }
  | { type: 'application'; item: SpotlightApplication }

interface SpotlightDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SpotlightDialog({ open, onOpenChange }: SpotlightDialogProps) {
  const navigate = useNavigate()
  const { courses } = useCourses()
  const { students, applications, loading } = useSpotlightData(open)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ResultItem[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Fuse instances -- rebuilt when data changes
  const courseFuse = useRef<Fuse<Course> | null>(null)
  const studentFuse = useRef<Fuse<SpotlightStudent> | null>(null)
  const applicationFuse = useRef<Fuse<SpotlightApplication> | null>(null)

  useEffect(() => {
    courseFuse.current = new Fuse(courses, {
      keys: [
        { name: 'dersAdi', weight: 0.6 },
        { name: 'sinifAdi', weight: 0.3 },
        { name: 'dersGunu', weight: 0.1 },
      ],
      threshold: 0.4,
      includeScore: true,
    })
  }, [courses])

  useEffect(() => {
    studentFuse.current = new Fuse(students, {
      keys: [
        { name: 'adSoyad', weight: 0.6 },
        { name: 'no', weight: 0.25 },
        { name: 'pcNo', weight: 0.15 },
      ],
      threshold: 0.4,
      includeScore: true,
    })
  }, [students])

  useEffect(() => {
    applicationFuse.current = new Fuse(applications, {
      keys: [
        { name: 'ad', weight: 0.7 },
        { name: 'dersAdi', weight: 0.3 },
      ],
      threshold: 0.4,
      includeScore: true,
    })
  }, [applications])

  // Run search
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setActiveIndex(0)
      return
    }

    const courseResults: ResultItem[] = (courseFuse.current?.search(query) ?? [])
      .slice(0, 3)
      .map((r) => ({ type: 'course', item: r.item }))

    const studentResults: ResultItem[] = (studentFuse.current?.search(query) ?? [])
      .slice(0, 4)
      .map((r) => ({ type: 'student', item: r.item }))

    const applicationResults: ResultItem[] = (applicationFuse.current?.search(query) ?? [])
      .slice(0, 3)
      .map((r) => ({ type: 'application', item: r.item }))

    setResults([...courseResults, ...studentResults, ...applicationResults])
    setActiveIndex(0)
  }, [query])

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Ctrl+K / Cmd+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  const handleNavigate = useCallback(
    (item: ResultItem) => {
      if (item.type === 'course') {
        navigate(`/courses/${item.item.id}`)
      } else if (item.type === 'student') {
        navigate(`/courses/${item.item.courseId}/students/${item.item.id}`)
      } else if (item.type === 'application') {
        navigate(`/courses/${item.item.courseId}`)
      }
      onOpenChange(false)
    },
    [navigate, onOpenChange]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      handleNavigate(results[activeIndex])
    } else if (e.key === 'Escape') {
      onOpenChange(false)
    }
  }

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const groupedResults = {
    courses: results.filter((r): r is Extract<ResultItem, { type: 'course' }> => r.type === 'course'),
    students: results.filter((r): r is Extract<ResultItem, { type: 'student' }> => r.type === 'student'),
    applications: results.filter((r): r is Extract<ResultItem, { type: 'application' }> => r.type === 'application'),
  }

  let globalIndex = 0

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 bottom-24 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2',
            'rounded-2xl border border-border/50 bg-background/90 backdrop-blur-xl shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-bottom-[5%] data-[state=open]:slide-in-from-bottom-[5%]'
          )}
          onKeyDown={handleKeyDown}
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Hızlı Arama</DialogPrimitive.Title>

          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
            <Search size={18} className="shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ders, öğrenci veya uygulama ara..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {loading && <Loader2 size={16} className="animate-spin text-muted-foreground shrink-0" />}
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono border border-border rounded text-muted-foreground">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
            {query && results.length === 0 && !loading && (
              <p className="py-8 text-center text-sm text-muted-foreground">Sonuç bulunamadı</p>
            )}

            {!query && (
              <p className="py-8 text-center text-sm text-muted-foreground">Aramak için yazmaya başlayın...</p>
            )}

            {/* Dersler */}
            {groupedResults.courses.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Dersler
                </p>
                {groupedResults.courses.map((r) => {
                  const idx = globalIndex++
                  return (
                    <button
                      key={r.item.id}
                      data-index={idx}
                      onClick={() => handleNavigate(r)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        activeIndex === idx ? 'bg-accent' : 'hover:bg-accent/50'
                      )}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0">
                        <BookOpen size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.item.dersAdi}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.item.sinifAdi} · {r.item.dersGunu}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Öğrenciler */}
            {groupedResults.students.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Öğrenciler
                </p>
                {groupedResults.students.map((r) => {
                  const idx = globalIndex++
                  return (
                    <button
                      key={`${r.item.courseId}-${r.item.id}`}
                      data-index={idx}
                      onClick={() => handleNavigate(r)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        activeIndex === idx ? 'bg-accent' : 'hover:bg-accent/50'
                      )}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                        <User size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.item.adSoyad}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          No: {r.item.no} · {r.item.dersAdi} – {r.item.sinifAdi}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Uygulamalar */}
            {groupedResults.applications.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Uygulamalar
                </p>
                {groupedResults.applications.map((r) => {
                  const idx = globalIndex++
                  return (
                    <button
                      key={`${r.item.courseId}-${r.item.id}`}
                      data-index={idx}
                      onClick={() => handleNavigate(r)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        activeIndex === idx ? 'bg-accent' : 'hover:bg-accent/50'
                      )}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 shrink-0">
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.item.ad}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.item.dersAdi} – {r.item.sinifAdi} · {r.item.tarih}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer hint */}
          {results.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 border-t border-border/50 text-[11px] text-muted-foreground">
              <span><kbd className="font-mono">↑↓</kbd> seç</span>
              <span><kbd className="font-mono">↵</kbd> git</span>
              <span><kbd className="font-mono">ESC</kbd> kapat</span>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
