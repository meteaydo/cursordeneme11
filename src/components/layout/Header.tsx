import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'

interface HeaderProps {
  title?: string
  showBack?: boolean
  backTo?: string
  showLogout?: boolean
  rightAction?: React.ReactNode
}

export function Header({ title, showBack = false, backTo, showLogout = true, rightAction }: HeaderProps) {
  const navigate = useNavigate()
  const { logout, user } = useAuth()

  const handleBack = () => {
    if (backTo) navigate(backTo)
    else navigate(-1)
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-border shadow-sm">
      <div className="flex items-center justify-between h-14 px-4 gap-2 relative">
        <div className="flex-1 flex items-center justify-start min-w-10">
          {showBack && (
            <Button variant="ghost" size="icon" onClick={handleBack} className="-ml-2 shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
        </div>
        
        <h1 className="absolute left-1/2 -translate-x-1/2 font-semibold text-[13px] truncate text-center uppercase tracking-[0.15em] w-[60%] text-slate-800">
          {title}
        </h1>

        <div className="flex-1 flex items-center justify-end min-w-10 gap-2">
          {rightAction}
          {user && showLogout && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={logout} title="Çıkış yap" className="text-slate-500">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
