import { useState } from 'react'
import { BookOpen, Search, MoreHorizontal, School, Users, CalendarDays } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface BottomNavProps {
  onSearchOpen: () => void
}

export function BottomNav({ onSearchOpen }: BottomNavProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const isCoursesActive = location.pathname.startsWith('/courses')
  const isClassesActive = location.pathname.startsWith('/classes')
  const isSchoolListsActive = location.pathname.startsWith('/school-lists')
  const isAnnualPlansActive = location.pathname.startsWith('/annual-plans')
  const isMoreActive = isClassesActive || isSchoolListsActive || isAnnualPlansActive

  const go = (path: string) => {
    setMenuOpen(false)
    navigate(path)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] pointer-events-none flex items-end justify-center pb-3 safe-bottom">
      {menuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-0 pointer-events-auto bg-black/20"
          aria-label="Menüyü kapat"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div
        className={cn(
          'relative z-10 pointer-events-auto w-[224px] flex items-center justify-between px-6 h-[52px] rounded-[1.75rem] border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-2xl shadow-black/20',
        )}
      >
        <button
          onClick={() => {
            setMenuOpen(false)
            navigate('/courses')
          }}
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
              onClick={() => {
                setMenuOpen(false)
                onSearchOpen()
              }}
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

        <div className="relative">
          {menuOpen && (
            <div className="absolute bottom-[calc(100%+14px)] right-1/2 translate-x-1/2 z-20 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  go('/annual-plans')
                }}
                className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white text-slate-800 px-4 py-2.5 text-sm font-semibold shadow-xl border border-slate-200 active:scale-95"
              >
                <CalendarDays size={16} />
                Yıllık Planlar
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  go('/school-lists')
                }}
                className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white text-slate-800 px-4 py-2.5 text-sm font-semibold shadow-xl border border-slate-200 active:scale-95"
              >
                <School size={16} />
                Okul listeleri
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  go('/classes')
                }}
                className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white text-slate-800 px-4 py-2.5 text-sm font-semibold shadow-xl border border-slate-200 active:scale-95"
              >
                <Users size={16} />
                Sınıflarım
              </button>
            </div>
          )}
          <button
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(
              'flex flex-col items-center justify-center w-9 h-9 transition-all duration-200 active:scale-95 rounded-full',
              menuOpen || isMoreActive
                ? 'text-white drop-shadow-md'
                : 'text-slate-300/60 hover:text-white',
            )}
            aria-label="Daha fazla"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={20} strokeWidth={menuOpen || isMoreActive ? 2.5 : 2} />
          </button>
        </div>
      </div>
    </div>
  )
}
