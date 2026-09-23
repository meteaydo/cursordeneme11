import { Navigate } from 'react-router-dom'
import { useAuth, type AppRole } from '@/contexts/AuthContext'
import { Loader2 } from 'lucide-react'

export function ProtectedRoute({
  children,
  role: requiredRole = 'teacher',
}: {
  children: React.ReactNode
  role?: AppRole
}) {
  const { user, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (requiredRole === 'student' && role !== 'student') {
    return <Navigate to="/courses" replace />
  }
  if (requiredRole === 'teacher' && role === 'student') {
    return <Navigate to="/ogrenci" replace />
  }

  return <>{children}</>
}
