import type { ReactNode } from 'react'
import { BookOpen, Search, School, Users, CalendarDays, CalendarRange, User } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface BottomNavProps {
  onSearchOpen: () => void
}

function NavItem({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5 rounded-xl px-0.5 py-1 transition-all duration-200 active:scale-95',
        active ? 'text-white' : 'text-slate-300/70 hover:text-white',
      )}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      {children}
      <span className="w-full truncate text-center text-[10px] font-medium leading-none">{label}</span>
    </button>
  )
}

export function BottomNav({ onSearchOpen }: BottomNavProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname

  const isActive = (prefix: string) => path.startsWith(prefix)

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] pointer-events-none flex items-end justify-center px-3 pb-3 safe-bottom">
      <div
        className={cn(
          'relative z-10 pointer-events-auto w-full max-w-[440px] grid grid-cols-[1fr_auto_1fr] items-end gap-0.5',
          'min-h-[62px] px-1.5 pt-1.5 pb-1 rounded-[1.75rem]',
          'border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-2xl shadow-black/20',
        )}
      >
        <div className="flex min-w-0 items-end justify-evenly">
          <NavItem active={isActive('/courses')} label="Dersler" onClick={() => navigate('/courses')}>
            <BookOpen size={18} strokeWidth={isActive('/courses') ? 2.5 : 2} />
          </NavItem>
          <NavItem active={isActive('/classes')} label="Sınıflarım" onClick={() => navigate('/classes')}>
            <Users size={18} strokeWidth={isActive('/classes') ? 2.5 : 2} />
          </NavItem>
          <NavItem active={isActive('/school-lists')} label="Listeler" onClick={() => navigate('/school-lists')}>
            <School size={18} strokeWidth={isActive('/school-lists') ? 2.5 : 2} />
          </NavItem>
        </div>

        <div className="relative flex w-14 flex-col items-center justify-end self-end pb-1">
          <div className="absolute bottom-[calc(100%-2px)] left-1/2 -translate-x-1/2 -translate-y-1.5">
            <div className="rounded-full bg-slate-900/40 p-1 backdrop-blur-2xl border border-white/10 shadow-sm">
              <button
                type="button"
                onClick={onSearchOpen}
                className={cn(
                  'relative flex items-center justify-center w-11 h-11 rounded-full transition-all duration-200',
                  'bg-gradient-to-b from-blue-400 to-blue-600 text-white',
                  'border-t border-blue-300/50',
                  'shadow-[inset_0_-3px_5px_rgba(0,0,0,0.3),inset_0_1.5px_3px_rgba(255,255,255,0.3),0_5px_10px_rgba(37,99,235,0.4)]',
                  'hover:from-blue-400 hover:to-blue-500 hover:-translate-y-0.5',
                  'active:translate-y-1 active:shadow-[inset_0_1.5px_5px_rgba(0,0,0,0.4),0_1.5px_3px_rgba(37,99,235,0.4)] active:from-blue-500 active:to-blue-600',
                )}
                aria-label="Ara"
              >
                <Search size={22} strokeWidth={2.5} className="drop-shadow-md" />
              </button>
            </div>
          </div>
          <span className="text-[10px] font-medium leading-none text-slate-200/80">Ara</span>
        </div>

        <div className="flex min-w-0 items-end justify-evenly">
          <NavItem
            active={isActive('/ders-programlari')}
            label="Program"
            onClick={() => navigate('/ders-programlari')}
          >
            <CalendarRange size={18} strokeWidth={isActive('/ders-programlari') ? 2.5 : 2} />
          </NavItem>
          <NavItem active={isActive('/annual-plans')} label="Planlar" onClick={() => navigate('/annual-plans')}>
            <CalendarDays size={18} strokeWidth={isActive('/annual-plans') ? 2.5 : 2} />
          </NavItem>
          <NavItem active={isActive('/profil')} label="Profil" onClick={() => navigate('/profil')}>
            <User size={18} strokeWidth={isActive('/profil') ? 2.5 : 2} />
          </NavItem>
        </div>
      </div>
    </div>
  )
}
