import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'

export interface HeaderProps {
  title?: string | React.ReactNode
  showBack?: boolean
  backTo?: string
  showLogout?: boolean
  rightAction?: React.ReactNode
  hideTitleOnDesktop?: boolean
  leftExtra?: React.ReactNode
  backTitle?: string
  onBackClick?: () => void
}

export function Header({ 
  title, 
  showBack = false, 
  backTo, 
  showLogout = true, 
  rightAction,
  hideTitleOnDesktop = false,
  leftExtra,
  backTitle,
  onBackClick
}: HeaderProps) {
  const navigate = useNavigate()
  const { logout, user } = useAuth()

  const handleBack = () => {
    if (onBackClick) {
      onBackClick()
      return
    }
    if (backTo) navigate(backTo)
    else navigate(-1)
  }

  return (
    <header className={`sticky top-0 z-[200] bg-white border-b border-border shadow-sm overflow-visible ${hideTitleOnDesktop ? 'md:bg-transparent md:border-none md:shadow-none md:pointer-events-none' : ''}`}>
      <div className={`${hideTitleOnDesktop ? 'max-w-none md:px-[50px]' : 'container max-w-2xl mx-auto'} flex items-center justify-between h-14 px-4 gap-2 relative overflow-visible`}>
        <div className="flex-1 flex items-center justify-start min-w-10 pointer-events-auto gap-1">
          {showBack && (
            <button onClick={handleBack} className="flex flex-col items-center justify-center -ml-2 w-14 h-12 rounded-xl hover:bg-slate-100/50 active:scale-95 transition-all outline-none shrink-0 group">
              <ArrowLeft className="h-5 w-5 text-slate-700 mb-0.5 group-hover:-translate-x-0.5 transition-transform" />
              {backTitle && (
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider line-clamp-2 leading-tight w-[60px] text-center px-0.5 break-words" title={backTitle}>
                  {backTitle}
                </span>
              )}
            </button>
          )}
          {user && showLogout && (
            <Button variant="ghost" onClick={logout} title="Çıkış yap" className="text-slate-500 px-2 h-9 gap-1.5 -ml-2">
              <LogOut className="h-4 w-4 -rotate-90" />
              <span className="text-xs font-medium">Çıkış</span>
            </Button>
          )}
          {leftExtra && (
            <div className="hidden md:block ml-1">
              {leftExtra}
            </div>
          )}
        </div>
        
        <h1 className={`absolute left-1/2 -translate-x-1/2 font-semibold text-[13px] md:text-[14px] truncate text-center uppercase tracking-wider w-[calc(100%-120px)] md:w-[calc(100%-200px)] text-slate-800 ${hideTitleOnDesktop ? 'md:hidden' : ''}`}>
          {title}
        </h1>

        <div className="flex-1 flex items-center justify-end min-w-10 gap-2 pointer-events-auto">
          {rightAction}
        </div>
      </div>
    </header>
  )
}
