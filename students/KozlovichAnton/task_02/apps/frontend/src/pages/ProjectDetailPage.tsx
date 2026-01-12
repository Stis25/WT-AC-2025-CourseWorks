import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, extractErrorMessage } from "../api/client";
import {
  ApiItem,
  ApiList,
  BoardColumns,
  Bug,
  BugPriority,
  BugStatus,
  Project,
  ProjectMember,
  ProjectMemberRole
} from "../types";
import { useAuth } from "../auth/AuthContext";
import { PriorityBadge, StatusBadge } from "../components/StatusBadge";

const projectUpdateSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(2000).optional(),
  isPublic: z.boolean().optional()
});

const memberSchema = z.object({
  userId: z.string().uuid("Нужен UUID пользователя"),
  role: z.enum(["manager", "developer", "viewer"])
});

const bugSchema = z.object({
  title: z.string().min(3),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  assignedTo: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().uuid().optional()
  )
});

type ProjectUpdateForm = z.infer<typeof projectUpdateSchema>;
type MemberForm = z.infer<typeof memberSchema>;
type BugForm = z.infer<typeof bugSchema>;

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const projectId = id!;
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [board, setBoard] = useState<BoardColumns | null>(null);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProject, setSavingProject] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [savingBug, setSavingBug] = useState(false);

  const updateForm = useForm<ProjectUpdateForm>({ resolver: zodResolver(projectUpdateSchema) });
  const memberForm = useForm<MemberForm>({ resolver: zodResolver(memberSchema) });
  const bugForm = useForm<BugForm>({ resolver: zodResolver(bugSchema), defaultValues: { priority: "medium" } });

  const membership = useMemo(() => members.find((m) => m.userId === user?.id) ?? null, [members, user]);
  const canEditProject = user?.role === "admin" || project?.ownerId === user?.id;
  const canManageMembers = user?.role === "admin" || membership?.role === "owner" || membership?.role === "manager";
  const canCreateBug = user?.role === "admin" || project?.isPublic || Boolean(membership);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectRes, membersRes, boardRes, bugsRes] = await Promise.all([
        api.get<ApiItem<Project>>(`/projects/${projectId}`),
        api.get<ApiList<ProjectMember>>(`/projects/${projectId}/members`),
        api.get<ApiItem<BoardColumns>>(`/projects/${projectId}/board`),
        api.get<ApiList<Bug>>(`/bugs`, { params: { projectId } })
      ]);
      setProject(projectRes.data.data);
      setMembers(membersRes.data.data);
      setBoard(boardRes.data.data);
      setBugs(bugsRes.data.data);
      updateForm.reset({
        name: projectRes.data.data.name,
        description: projectRes.data.data.description ?? "",
        isPublic: projectRes.data.data.isPublic
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleProjectSave = async (data: ProjectUpdateForm) => {
    setSavingProject(true);
    setError(null);
    try {
      const res = await api.put<ApiItem<Project>>(`/projects/${projectId}`, data);
      setProject(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingProject(false);
    }
  };

  const handleAddMember = async (data: MemberForm) => {
    setSavingMember(true);
    setError(null);
    try {
      await api.post(`/projects/${projectId}/members`, data);
      memberForm.reset();
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingMember(false);
    }
  };

  const handleChangeMember = async (userId: string, role: ProjectMemberRole) => {
    try {
      await api.put(`/projects/${projectId}/members/${userId}`, { role });
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await api.delete(`/projects/${projectId}/members/${userId}`);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleCreateBug = async (values: BugForm) => {
    setSavingBug(true);
    setError(null);
    try {
      const res = await api.post<ApiItem<Bug>>(`/bugs`, { ...values, projectId });
      setBugs((prev) => [res.data.data, ...prev]);
      bugForm.reset({ title: "", description: "", priority: "medium", assignedTo: undefined });
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingBug(false);
    }
  };

  const handleStatusChange = async (bugId: string, status: BugStatus) => {
    try {
      await api.patch(`/bugs/${bugId}/status`, { status });
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleDeleteBug = async (bugId: string) => {
    try {
      await api.delete(`/bugs/${bugId}`);
      setBugs((prev) => prev.filter((b) => b.id !== bugId));
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!project) return <div>Проект не найден</div>;

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="section-title">
        <div>
          <h2>{project.name}</h2>
          <p className="muted">{project.description || "Без описания"}</p>
        </div>
        <span className="tag">{project.isPublic ? "public" : "private"}</span>
      </div>

      {canEditProject && (
        <div className="card" style={{ marginTop: 10 }}>
          <h3>Редактировать проект</h3>
          <form className="form" onSubmit={updateForm.handleSubmit(handleProjectSave)}>
            <label className="label">Название</label>
            <input className="input" {...updateForm.register("name")} />
            {updateForm.formState.errors.name && <span className="error">{updateForm.formState.errors.name.message}</span>}

            <label className="label">Описание</label>
            <textarea className="textarea" {...updateForm.register("description")} />
            {updateForm.formState.errors.description && <span className="error">{updateForm.formState.errors.description.message}</span>}

            <label className="label">
              <input type="checkbox" {...updateForm.register("isPublic")} /> Публичный
            </label>

            <button className="btn btn-primary" type="submit" disabled={savingProject}>
              {savingProject ? "Сохраняем..." : "Сохранить"}
            </button>
          </form>
        </div>
      )}

      <div className="section-title">
        <h3>Участники</h3>
      </div>
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Email</th>
              <th>Роль</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td>{m.user.username}</td>
                <td>{m.user.email}</td>
                <td>{m.role}</td>
                <td className="inline">
                  {canManageMembers && m.role !== "owner" && (
                    <>
                      <select
                        className="select"
                        value={m.role}
                        onChange={(e) => handleChangeMember(m.userId, e.target.value as ProjectMemberRole)}
                      >
                        <option value="manager">manager</option>
                        <option value="developer">developer</option>
                        <option value="viewer">viewer</option>
                      </select>
                      <button className="btn btn-danger" onClick={() => handleRemoveMember(m.userId)}>
                        Удалить
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManageMembers && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4>Добавить участника</h4>
          <form className="form" onSubmit={memberForm.handleSubmit(handleAddMember)}>
            <label className="label">User ID (UUID)</label>
            <input className="input" {...memberForm.register("userId")} />
            {memberForm.formState.errors.userId && <span className="error">{memberForm.formState.errors.userId.message}</span>}

            <label className="label">Роль</label>
            <select className="select" {...memberForm.register("role")}>
              <option value="manager">manager</option>
              <option value="developer">developer</option>
              <option value="viewer">viewer</option>
            </select>

            <button className="btn btn-primary" type="submit" disabled={savingMember}>
              {savingMember ? "Добавляем..." : "Добавить"}
            </button>
          </form>
        </div>
      )}

      <div className="section-title">
        <h3>Баги проекта</h3>
      </div>

      {canCreateBug && (
        <div className="card" style={{ marginTop: 8 }}>
          <h4>Создать баг</h4>
          <form className="form" onSubmit={bugForm.handleSubmit(handleCreateBug)}>
            <label className="label">Заголовок</label>
            <input className="input" {...bugForm.register("title")} />
            {bugForm.formState.errors.title && <span className="error">{bugForm.formState.errors.title.message}</span>}

            <label className="label">Описание</label>
            <textarea className="textarea" {...bugForm.register("description")} />
            {bugForm.formState.errors.description && (
              <span className="error">{bugForm.formState.errors.description.message}</span>
            )}

            <label className="label">Приоритет</label>
            <select className="select" {...bugForm.register("priority")}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>

            <label className="label">Назначить (userId, developer)</label>
            <input className="input" placeholder="опционально" {...bugForm.register("assignedTo")} />
            {bugForm.formState.errors.assignedTo && (
              <span className="error">Нужен UUID пользователя (developer)</span>
            )}

            <button className="btn btn-primary" type="submit" disabled={savingBug}>
              {savingBug ? "Создаём..." : "Создать"}
            </button>
          </form>
        </div>
      )}

      <div className="card-list" style={{ marginTop: 12 }}>
        {bugs.map((bug) => (
          <div key={bug.id} className="card">
            <div className="inline" style={{ justifyContent: "space-between" }}>
              <div>
                <h4 style={{ margin: 0 }}>{bug.title}</h4>
                <div className="inline" style={{ gap: 8 }}>
                  <StatusBadge status={bug.status} />
                  <PriorityBadge priority={bug.priority} />
                </div>
              </div>
              <div className="inline" style={{ gap: 8 }}>
                <Link className="btn btn-secondary" to={`/bugs/${bug.id}`}>
                  Открыть
                </Link>
                {(user?.role === "admin" || membership?.role === "owner" || membership?.role === "manager") && (
                  <button className="btn btn-danger" onClick={() => handleDeleteBug(bug.id)}>
                    Удалить
                  </button>
                )}
              </div>
            </div>
            <p className="muted">{bug.description || "Без описания"}</p>
            <div className="inline" style={{ gap: 12 }}>
              <label className="label">Статус</label>
              <select
                className="select"
                value={bug.status}
                onChange={(e) => handleStatusChange(bug.id, e.target.value as BugStatus)}
              >
                <option value="new">new</option>
                <option value="in_progress">in_progress</option>
                <option value="testing">testing</option>
                <option value="done">done</option>
                <option value="closed">closed</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      {board && (
        <div>
          <div className="section-title">
            <h3>Доска</h3>
          </div>
          <div className="board">
            {Object.entries(board).map(([column, items]) => (
              <div key={column} className="board-column">
                <h4>{column}</h4>
                {items.length === 0 && <p className="muted">Пусто</p>}
                {items.map((b) => (
                  <div key={b.id} className="card" style={{ boxShadow: "none", border: "1px solid #e2e8f0" }}>
                    <div className="inline" style={{ justifyContent: "space-between" }}>
                      <span>{b.title}</span>
                      <PriorityBadge priority={b.priority} />
                    </div>
                    <Link to={`/bugs/${b.id}`} className="muted">
                      Подробнее
                    </Link>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
