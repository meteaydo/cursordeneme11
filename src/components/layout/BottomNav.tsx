import { BookOpen, Search, MoreHorizontal } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface BottomNavProps {
  onSearchOpen: () => void
}

export function BottomNav({ onSearchOpen }: BottomNavProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const isCoursesActive = location.pathname.startsWith('/courses')

  return (
    <div 
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 w-[280px]" 
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Ana arka plan ve glassmorphism: Koyu lacivert/mavi ve %60 transparan */}
      <div className="relative flex items-center justify-between px-8 h-16 rounded-[2rem] border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-2xl shadow-black/20">
        
        {/* Sol: Derslerim */}
        <button
          onClick={() => navigate('/courses')}
          className={cn(
            'flex flex-col items-center justify-center w-12 h-12 transition-all duration-200 active:scale-95 rounded-full',
            isCoursesActive
              ? 'text-white drop-shadow-md'
              : 'text-slate-300/60 hover:text-white'
          )}
          aria-label="Derslerim"
        >
          <BookOpen size={26} strokeWidth={isCoursesActive ? 2.5 : 2} />
        </button>

        {/* Orta: Spotlight Arama (Yükseltilmiş ve 3D Efektli) */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-6">
          {/* Dış Halka (Cutout/Glass efekti) */}
          <div className="p-2 rounded-full bg-slate-900/40 backdrop-blur-2xl border border-white/10 shadow-sm">
            <button
              onClick={onSearchOpen}
              className={cn(
                'relative flex items-center justify-center w-14 h-14 rounded-full transition-all duration-200',
                // 3D efekt için gradient ve iç/dış gölgeler
                'bg-gradient-to-b from-blue-400 to-blue-600 text-white',
                'border-t border-blue-300/50',
                'shadow-[inset_0_-4px_6px_rgba(0,0,0,0.3),inset_0_2px_4px_rgba(255,255,255,0.3),0_6px_12px_rgba(37,99,235,0.4)]',
                // Hover ve Active efektleri
                'hover:from-blue-400 hover:to-blue-500 hover:-translate-y-0.5',
                'active:translate-y-1 active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.4),0_2px_4px_rgba(37,99,235,0.4)] active:from-blue-500 active:to-blue-600'
              )}
              aria-label="Hızlı Arama"
            >
              <Search size={28} strokeWidth={2.5} className="drop-shadow-md" />
            </button>
          </div>
        </div>

        {/* Sağ: Boş Buton */}
        <button
          className={cn(
            'flex flex-col items-center justify-center w-12 h-12 transition-all duration-200 active:scale-95 rounded-full',
            'text-slate-300/60 hover:text-white'
          )}
          aria-label="Daha Fazla"
        >
          <MoreHorizontal size={26} strokeWidth={2} />
        </button>
        
      </div>
    </div>
  )
}
