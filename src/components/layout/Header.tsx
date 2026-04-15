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
}

export function Header({ 
  title, 
  showBack = false, 
  backTo, 
  showLogout = true, 
  rightAction,
  hideTitleOnDesktop = false,
  leftExtra,
  backTitle
}: HeaderProps) {
  const navigate = useNavigate()
  const { logout, user } = useAuth()

  const handleBack = () => {
    if (backTo) navigate(backTo)
    else navigate(-1)
  }

  return (
    <header className={`sticky top-0 z-60 bg-white border-b border-border shadow-sm ${hideTitleOnDesktop ? 'md:bg-transparent md:border-none md:shadow-none md:pointer-events-none' : ''}`}>
      <div className={`${hideTitleOnDesktop ? 'max-w-none md:px-[50px]' : 'container max-w-2xl mx-auto'} flex items-center justify-between h-14 px-4 gap-2 relative`}>
        <div className="flex-1 flex items-center justify-start min-w-10 pointer-events-auto gap-1">
          {showBack && (
            <div className="flex items-center gap-1.5 -ml-2">
              <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              {backTitle && (
                <span className="text-[11px] font-medium text-slate-500/50 -ml-1.5 truncate max-w-[100px]" title={backTitle}>
                  ({backTitle})
                </span>
              )}
            </div>
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
        
        <h1 className={`absolute left-1/2 -translate-x-1/2 font-semibold text-[13px] truncate text-center uppercase tracking-[0.15em] w-[40%] text-slate-800 ${hideTitleOnDesktop ? 'md:hidden' : ''}`}>
          {title}
        </h1>

        <div className="flex-1 flex items-center justify-end min-w-10 gap-2 pointer-events-auto">
          {rightAction}
        </div>
      </div>
    </header>
  )
}
