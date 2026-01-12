import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div>Загрузка...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

export const PublicOnly: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div>Загрузка...</div>;
  if (user) return <Navigate to="/projects" replace />;
  return children;
};
