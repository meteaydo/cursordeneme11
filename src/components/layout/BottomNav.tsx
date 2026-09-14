import { BookOpen, Search, MoreHorizontal } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface BottomNavProps {
  onSearchOpen: () => void
  leftAligned?: boolean
}

export function BottomNav({ onSearchOpen, leftAligned = false }: BottomNavProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const isCoursesActive = location.pathname.startsWith('/courses')

  return (
    <div
      className={cn(
        'fixed bottom-0 z-[100] pointer-events-none flex items-end pb-3 safe-bottom',
        leftAligned ? 'left-4 md:left-[50px] right-auto' : 'left-0 right-0 justify-center',
      )}
    >
      <div
        className={cn(
          'pointer-events-auto w-[224px] flex items-center justify-between px-6 h-[52px] rounded-[1.75rem] border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-2xl shadow-black/20',
        )}
      >
        <button
          onClick={() => navigate('/courses')}
          className={cn(
            'flex flex-col items-center justify-center w-9 h-9 transition-all duration-200 active:scale-95 rounded-full',
            isCoursesActive
              ? 'text-white drop-shadow-md'
              : 'text-slate-300/60 hover:text-white',
          )}
          aria-label="Derslerim"
        >
          <BookOpen size={20} strokeWidth={isCoursesActive ? 2.5 : 2} />
        </button>

        <div className="absolute left-1/2 -translate-x-1/2 -top-5">
          <div className="p-1.5 rounded-full bg-slate-900/40 backdrop-blur-2xl border border-white/10 shadow-sm">
            <button
              onClick={onSearchOpen}
              className={cn(
                'relative flex items-center justify-center w-11 h-11 rounded-full transition-all duration-200',
                'bg-gradient-to-b from-blue-400 to-blue-600 text-white',
                'border-t border-blue-300/50',
                'shadow-[inset_0_-3px_5px_rgba(0,0,0,0.3),inset_0_1.5px_3px_rgba(255,255,255,0.3),0_5px_10px_rgba(37,99,235,0.4)]',
                'hover:from-blue-400 hover:to-blue-500 hover:-translate-y-0.5',
                'active:translate-y-1 active:shadow-[inset_0_1.5px_5px_rgba(0,0,0,0.4),0_1.5px_3px_rgba(37,99,235,0.4)] active:from-blue-500 active:to-blue-600',
              )}
              aria-label="Hızlı Arama"
            >
              <Search size={22} strokeWidth={2.5} className="drop-shadow-md" />
            </button>
          </div>
        </div>

        <button
          className={cn(
            'flex flex-col items-center justify-center w-9 h-9 transition-all duration-200 active:scale-95 rounded-full',
            'text-slate-300/60 hover:text-white',
          )}
          aria-label="Daha Fazla"
        >
          <MoreHorizontal size={20} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
