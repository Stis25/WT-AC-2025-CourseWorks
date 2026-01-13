import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { AuthResponse, UserRole } from '../types'
import { useAuth } from '../auth'
import { ErrorBox } from '../components/ErrorBox'

export function RegisterPage() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<any>(null)
  const nav = useNavigate()
  const { setSession } = useAuth()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const auth = await apiFetch<AuthResponse>('/register', {
        method: 'POST',
        json: { email, name, password, role },
      })
      setSession(auth)
      nav('/tasks')
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '60px auto' }}>
      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Регистрация</h2>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Можно выбрать роль: пользователь или администратор (для проверки)</div>
        </div>

        <ErrorBox error={error} />
        <form onSubmit={onSubmit} className="grid">
        <label>
          Почта
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="name@example.com" />
        </label>
        <label>
          Имя
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Пароль
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        <label>
          Роль
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="user">Пользователь</option>
            <option value="admin">Администратор</option>
          </select>
        </label>
        <button className="btn btn-primary" disabled={loading}>{loading ? '...' : 'Создать аккаунт'}</button>
        </form>
        <p style={{ marginTop: 12, marginBottom: 0 }}>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </div>
  )
}
