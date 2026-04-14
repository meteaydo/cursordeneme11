import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Toaster } from '@/components/ui/toaster'
import LoginPage from '@/pages/LoginPage'
import CoursesPage from '@/pages/CoursesPage'
import CourseDetailPage from '@/pages/CourseDetailPage'
import StudentProfilePage from '@/pages/StudentProfilePage'
import { SeatingPlanPage } from '@/pages/SeatingPlanPage'
import PWABadge from '@/components/PWABadge'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/courses"
            element={
              <ProtectedRoute>
                <CoursesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/courses/:courseId"
            element={
              <ProtectedRoute>
                <CourseDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/courses/:courseId/seating"
            element={
              <ProtectedRoute>
                <SeatingPlanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/courses/:courseId/students/:studentId"
            element={
              <ProtectedRoute>
                <StudentProfilePage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/courses" replace />} />
        </Routes>
        <Toaster />
        <PWABadge />
      </AuthProvider>
    </BrowserRouter>
  )
}
