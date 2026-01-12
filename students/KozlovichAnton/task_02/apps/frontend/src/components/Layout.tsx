import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <header className="header">
        <div className="brand">
          <span>🐛</span>
          <span>Не баг, а фича?</span>
        </div>
        <nav className="nav">
          <NavLink to="/projects">Проекты</NavLink>
        </nav>
        <div className="user-block">
          {user && (
            <>
              <span className="tag">{user.username}</span>
              <span className="tag">{user.role}</span>
            </>
          )}
          <button className="btn btn-secondary" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
};
