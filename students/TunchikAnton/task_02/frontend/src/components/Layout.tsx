import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
    >
      {label}
    </NavLink>
  )
}

export function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()

  return (
    <div className="container">
      <header className="app-header">
        <Link to="/tasks" className="brand">
          <div className="brand-title">Список дел</div>
        </Link>

        <nav className="nav">
          <NavItem to="/tasks" label="Задачи" />
          <NavItem to="/calendar" label="Календарь" />
          {user?.role === 'admin' ? <NavItem to="/admin" label="Админ" /> : null}
        </nav>

        <div className="user-box">
          <div className="user-meta">
            <div className="user-name">{user?.name}</div>
            <div className="user-secondary">
              {user?.email} · {user?.role}
            </div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => {
              logout()
              nav('/login')
            }}
          >
            Выйти
          </button>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
