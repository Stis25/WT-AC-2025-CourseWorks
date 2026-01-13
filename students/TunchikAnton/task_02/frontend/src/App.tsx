import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth'
import { Layout } from './components/Layout'
import { AdminOnly, Protected } from './components/Protected'
import { CalendarPage } from './pages/Calendar'
import { LoginPage } from './pages/Login'
import { RegisterPage } from './pages/Register'
import { AdminPage } from './pages/Admin'
import { TaskDetailsPage } from './pages/TaskDetails'
import { TasksPage } from './pages/Tasks'

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<Protected />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/tasks" replace />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/tasks/:id" element={<TaskDetailsPage />} />
              <Route path="/calendar" element={<CalendarPage />} />

              <Route element={<AdminOnly />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
