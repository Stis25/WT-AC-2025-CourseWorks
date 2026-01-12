import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import { api, configureApiAuth, plainApi } from "../api/client";
import { ApiErrorResponse, AuthResponse, User } from "../types";

export type AuthContextType = {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  error: string | null;
  login: (payload: { email: string; password: string }) => Promise<void>;
  register: (payload: { username: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccess: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextType | null>(null);

const getErrorMessage = (err: unknown) => {
  if (err && typeof err === "object" && "response" in err) {
    const res = (err as AxiosError<ApiErrorResponse>).response;
    if (res?.data?.message) return res.data.message;
  }
  return "Ошибка сети или сервера";
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async (token: string) => {
    const res = await api.get<{ status: "ok"; data: User }>("/users/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    setUser(res.data.data);
    return res.data.data;
  }, []);

  const refreshAccess = useCallback(async () => {
    try {
      const res = await plainApi.post<{ status: "ok"; accessToken: string }>("/auth/refresh", {}, { withCredentials: true });
      setAccessToken(res.data.accessToken);
      await fetchProfile(res.data.accessToken);
      return res.data.accessToken;
    } catch (err) {
      setUser(null);
      setAccessToken(null);
      return null;
    }
  }, [fetchProfile]);

  const logout = useCallback(async () => {
    try {
      await plainApi.post("/auth/logout", {}, { withCredentials: true });
    } catch (err) {
      // ignore network errors on logout
    }
    setUser(null);
    setAccessToken(null);
  }, []);

  const login = useCallback(
    async (payload: { email: string; password: string }) => {
      setError(null);
      try {
        const res = await plainApi.post<AuthResponse>("/auth/login", payload, { withCredentials: true });
        setAccessToken(res.data.accessToken);
        setUser(res.data.user);
      } catch (err) {
        setError(getErrorMessage(err));
        throw err;
      }
    },
    []
  );

  const register = useCallback(
    async (payload: { username: string; email: string; password: string }) => {
      setError(null);
      try {
        const res = await plainApi.post<AuthResponse>("/auth/register", payload, { withCredentials: true });
        setAccessToken(res.data.accessToken);
        setUser(res.data.user);
      } catch (err) {
        setError(getErrorMessage(err));
        throw err;
      }
    },
    []
  );

  useEffect(() => {
    configureApiAuth({
      getAccessToken: () => accessToken,
      refresh: refreshAccess,
      onUnauthorized: logout
    });
  }, [accessToken, logout, refreshAccess]);

  useEffect(() => {
    const init = async () => {
      try {
        await refreshAccess();
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [refreshAccess]);

  const value = useMemo(
    () => ({ user, accessToken, isLoading, error, login, register, logout, refreshAccess }),
    [user, accessToken, isLoading, error, login, register, logout, refreshAccess]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
