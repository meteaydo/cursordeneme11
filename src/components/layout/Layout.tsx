import { useState, type ReactNode } from 'react'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { SpotlightDialog } from '@/components/SpotlightDialog'

interface LayoutProps {
  title: string
  children: ReactNode
  showBack?: boolean
  backTo?: string
  showLogout?: boolean
}

export function Layout({ title, children, showBack, backTo, showLogout }: LayoutProps) {
  const [spotlightOpen, setSpotlightOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header title={title} showBack={showBack} backTo={backTo} showLogout={showLogout} />
      <main className="flex-1 container max-w-2xl mx-auto px-4 py-4 pb-28">
        {children}
      </main>
      <BottomNav onSearchOpen={() => setSpotlightOpen(true)} />
      <SpotlightDialog open={spotlightOpen} onOpenChange={setSpotlightOpen} />
    </div>
  )
}
