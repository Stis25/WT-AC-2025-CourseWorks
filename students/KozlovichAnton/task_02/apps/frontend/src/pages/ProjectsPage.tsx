import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "../api/client";
import { ApiList, Project } from "../types";
import { useAuth } from "../auth/AuthContext";

const createSchema = z.object({
  name: z.string().min(3, "Минимум 3 символа"),
  description: z.string().max(2000).optional(),
  isPublic: z.boolean().optional()
});

type CreateForm = z.infer<typeof createSchema>;

export const ProjectsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<CreateForm>({ resolver: zodResolver(createSchema), defaultValues: { isPublic: true } });

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiList<Project>>("/projects");
      setProjects(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const onCreate = async (data: CreateForm) => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ status: "ok"; data: Project }>("/projects", data);
      setProjects((prev) => [res.data.data, ...prev]);
      reset({ name: "", description: "", isPublic: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/projects/${id}`);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div>
      <div className="section-title">
        <h2>Проекты</h2>
        <button className="btn btn-secondary" onClick={fetchProjects} disabled={loading}>
          Обновить
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <div>Загрузка...</div>}

      {user?.role === "admin" && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Создать проект</h3>
          <form className="form" onSubmit={handleSubmit(onCreate)}>
            <label className="label">Название</label>
            <input className="input" {...register("name")} />
            {errors.name && <span className="error">{errors.name.message}</span>}

            <label className="label">Описание</label>
            <textarea className="textarea" {...register("description")} />
            {errors.description && <span className="error">{errors.description.message}</span>}

            <label className="label">
              <input type="checkbox" {...register("isPublic")} /> Публичный проект
            </label>

            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Сохраняем..." : "Создать"}
            </button>
          </form>
        </div>
      )}

      <div className="card-grid" style={{ marginTop: 16 }}>
        {projects.map((p) => (
          <div key={p.id} className="card">
            <div className="inline" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>{p.name}</h3>
              <span className="tag">{p.isPublic ? "public" : "private"}</span>
            </div>
            <p className="muted">{p.description || "Без описания"}</p>
            <div className="inline" style={{ justifyContent: "space-between" }}>
              <button className="btn btn-secondary" onClick={() => navigate(`/projects/${p.id}`)}>
                Открыть
              </button>
              {user?.role === "admin" && (
                <button className="btn btn-danger" onClick={() => handleDelete(p.id)}>
                  Удалить
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!loading && projects.length === 0 && <p className="muted">Нет доступных проектов</p>}
    </div>
  );
};
