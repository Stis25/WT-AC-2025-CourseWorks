import React, { createContext, useContext, useMemo, useState } from 'react'
import type { AuthResponse, UserResponse } from './types'
import { clearAuth, getStoredUser, getToken, setAuth } from './lib/storage'

type AuthCtx = {
  token: string | null
  user: UserResponse | null
  setSession: (auth: AuthResponse) => void
  logout: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(getToken())
  const [user, setUser] = useState<UserResponse | null>(getStoredUser())

  const setSession = (auth: AuthResponse) => {
    setAuth(auth)
    setToken(auth.token)
    setUser(auth.user_data)
  }

  const logout = () => {
    clearAuth()
    setToken(null)
    setUser(null)
  }

  const value = useMemo(() => ({ token, user, setSession, logout }), [token, user])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
