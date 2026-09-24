import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Toaster } from '@/components/ui/toaster'
import LoginPage from '@/pages/LoginPage'
import CoursesPage from '@/pages/CoursesPage'
import CourseDetailPage from '@/pages/CourseDetailPage'
import StudentProfilePage from '@/pages/StudentProfilePage'
import { SeatingPlanPage } from '@/pages/SeatingPlanPage'
import SchoolListsPage from '@/pages/SchoolListsPage'
import ClassDetailPage from '@/pages/ClassDetailPage'
import AttendanceHistoryPage from '@/pages/AttendanceHistoryPage'
import AnnualPlansPage from '@/pages/AnnualPlansPage'
import TimetablesPage from '@/pages/TimetablesPage'
import TimetableEditorPage from '@/pages/TimetableEditorPage'
import ProfilePage from '@/pages/ProfilePage'
import StudentHomePage from '@/pages/student/StudentHomePage'
import StudentCoursePage from '@/pages/student/StudentCoursePage'
import PWABadge from '@/components/PWABadge'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2 } from 'lucide-react'

function HomeRedirect() {
  const { user, role, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (role === 'student') return <Navigate to="/ogrenci" replace />
  return <Navigate to="/courses" replace />
}

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
          <Route path="/classes" element={<Navigate to="/courses" replace />} />
          <Route path="/classes/:sinifAdi/yoklama" element={<Navigate to="/courses" replace />} />
          <Route
            path="/classes/:sinifAdi/yoklamalar"
            element={
              <ProtectedRoute>
                <AttendanceHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/school-lists"
            element={
              <ProtectedRoute>
                <SchoolListsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/school-lists/:sinifAdi"
            element={
              <ProtectedRoute>
                <ClassDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/yoklamalar"
            element={<Navigate to="/courses" replace />}
          />
          <Route
            path="/ders-programlari"
            element={
              <ProtectedRoute>
                <TimetablesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ders-programlari/:id"
            element={
              <ProtectedRoute>
                <TimetableEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/annual-plans"
            element={
              <ProtectedRoute>
                <AnnualPlansPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profil"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ogrenci"
            element={
              <ProtectedRoute role="student">
                <StudentHomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ogrenci/:courseId/:studentId"
            element={
              <ProtectedRoute role="student">
                <StudentCoursePage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
        <Toaster />
        <PWABadge />
      </AuthProvider>
    </BrowserRouter>
  )
}
