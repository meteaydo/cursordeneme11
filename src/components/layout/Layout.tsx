import { useState, type ReactNode } from 'react'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { SpotlightDialog } from '@/components/SpotlightDialog'

interface LayoutProps {
  title: string | React.ReactNode
  children: ReactNode
  showBack?: boolean
  backTo?: string
  showLogout?: boolean
  rightAction?: ReactNode
  hideTitleOnDesktop?: boolean
  leftExtra?: ReactNode
  backTitle?: string
  onBackClick?: () => void
}

export function Layout({ 
  title, 
  children, 
  showBack, 
  backTo, 
  showLogout, 
  rightAction,
  hideTitleOnDesktop,
  leftExtra,
  backTitle,
  onBackClick
}: LayoutProps) {
  const [spotlightOpen, setSpotlightOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header 
        title={title} 
        showBack={showBack} 
        backTo={backTo} 
        showLogout={showLogout} 
        rightAction={rightAction} 
        hideTitleOnDesktop={hideTitleOnDesktop}
        leftExtra={leftExtra}
        backTitle={backTitle}
        onBackClick={onBackClick}
      />
      <main className="flex-1 container max-w-2xl mx-auto px-4 py-4 pb-24">
        {children}
      </main>
      <BottomNav onSearchOpen={() => setSpotlightOpen(true)} leftAligned={hideTitleOnDesktop} />
      <SpotlightDialog open={spotlightOpen} onOpenChange={setSpotlightOpen} />
    </div>
  )
}
