import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'

export function Protected() {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return <Outlet />
}

export function AdminOnly() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/tasks" replace />
  return <Outlet />
}
