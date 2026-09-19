import { useState, type ReactNode } from 'react'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { SpotlightDialog } from '@/components/SpotlightDialog'

interface LayoutProps {
  title: string | React.ReactNode
  children: ReactNode
  showBack?: boolean
  backTo?: string
  rightAction?: ReactNode
  showLogout?: boolean
  hideTitleOnDesktop?: boolean
  leftExtra?: ReactNode
  backTitle?: string
  onBackClick?: () => void
  /** Mobilde iki satırlı başlık (ör. ders + uygulama) için header yüksekliği */
  stackedMobileTitle?: boolean
}

export function Layout({ 
  title, 
  children, 
  showBack, 
  backTo, 
  rightAction,
  showLogout,
  hideTitleOnDesktop,
  leftExtra,
  backTitle,
  onBackClick,
  stackedMobileTitle,
}: LayoutProps) {
  const [spotlightOpen, setSpotlightOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header 
        title={title} 
        showBack={showBack} 
        backTo={backTo} 
        rightAction={rightAction} 
        showLogout={showLogout}
        hideTitleOnDesktop={hideTitleOnDesktop}
        leftExtra={leftExtra}
        backTitle={backTitle}
        onBackClick={onBackClick}
        stackedMobileTitle={stackedMobileTitle}
      />
      <main className="flex-1 container max-w-2xl mx-auto px-4 py-4 pb-24">
        {children}
      </main>
      <BottomNav onSearchOpen={() => setSpotlightOpen(true)} />
      <SpotlightDialog open={spotlightOpen} onOpenChange={setSpotlightOpen} />
    </div>
  )
}
