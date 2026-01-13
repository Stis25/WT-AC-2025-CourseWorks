import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { AuthResponse } from '../types'
import { useAuth } from '../auth'
import { ErrorBox } from '../components/ErrorBox'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<any>(null)
  const nav = useNavigate()
  const { setSession } = useAuth()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const auth = await apiFetch<AuthResponse>('/login', {
        method: 'POST',
        json: { email, password },
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
    <div style={{ maxWidth: 440, margin: '80px auto' }}>
      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Вход</h2>
        </div>

        <ErrorBox error={error} />
        <form onSubmit={onSubmit} className="grid">
        <label>
          Почта
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="name@example.com" />
        </label>
        <label>
          Пароль
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        <button className="btn btn-primary" disabled={loading}>{loading ? '...' : 'Войти'}</button>
        </form>

        <p style={{ marginTop: 12, marginBottom: 0 }}>
          Нет аккаунта? <Link to="/register">Регистрация</Link>
        </p>
      </div>
    </div>
  )
}
