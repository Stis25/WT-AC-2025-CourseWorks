import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, extractErrorMessage } from "../api/client";
import { ApiItem, Attachment, Bug, BugPriority, BugStatus, Comment, ProjectMember } from "../types";
import { useAuth } from "../auth/AuthContext";
import { PriorityBadge, StatusBadge } from "../components/StatusBadge";

const bugEditSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(["new", "in_progress", "testing", "done", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  assignedTo: z.preprocess(
    (val) => (val === "" ? null : val),
    z.string().uuid().nullable().optional()
  )
});

const commentSchema = z.object({ content: z.string().min(1) });
const attachmentSchema = z.object({
  file: z.custom<FileList>((val) => val instanceof FileList && val.length > 0, {
    message: "Выберите файл"
  })
});

type BugForm = z.infer<typeof bugEditSchema>;
type CommentForm = z.infer<typeof commentSchema>;
type AttachmentForm = z.infer<typeof attachmentSchema>;

type BugWithRelations = Bug & { project: { id: string; isPublic: boolean; ownerId: string }; attachments: Attachment[]; comments: Comment[] };

export const BugDetailsPage: React.FC = () => {
  const { id } = useParams();
  const bugId = id!;
  const { user } = useAuth();
  const [bug, setBug] = useState<BugWithRelations | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const [savingAttachment, setSavingAttachment] = useState(false);
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:4000";

  const bugForm = useForm<BugForm>({ resolver: zodResolver(bugEditSchema) });
  const commentForm = useForm<CommentForm>({ resolver: zodResolver(commentSchema) });
  const attachmentForm = useForm<AttachmentForm>({ resolver: zodResolver(attachmentSchema) });

  const membership = useMemo(() => members.find((m) => m.userId === user?.id) ?? null, [members, user]);
  const canManage = user?.role === "admin" || membership?.role === "owner" || membership?.role === "manager";
  const isAssignee = bug?.assignedTo === user?.id;
  const isAuthor = bug?.createdBy === user?.id;

  const load = async () => {
    setError(null);
    try {
      const res = await api.get<ApiItem<BugWithRelations>>(`/bugs/${bugId}`);
      setBug(res.data.data);
      const membersRes = await api.get<{ status: "ok"; data: ProjectMember[] }>(`/projects/${res.data.data.projectId}/members`);
      setMembers(membersRes.data.data);
      bugForm.reset({
        title: res.data.data.title,
        description: res.data.data.description ?? "",
        status: res.data.data.status,
        priority: res.data.data.priority,
        assignedTo: res.data.data.assignedTo ?? undefined
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleSave = async (values: BugForm) => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/bugs/${bugId}`, values);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (status: BugStatus) => {
    try {
      await api.patch(`/bugs/${bugId}/status`, { status });
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleComment = async (values: CommentForm) => {
    setSavingComment(true);
    try {
      await api.post(`/comments`, { bugId, content: values.content });
      commentForm.reset({ content: "" });
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await api.delete(`/comments/${commentId}`);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleAttachment = async (values: AttachmentForm) => {
    setSavingAttachment(true);
    try {
      const file = values.file.item(0);
      if (!file) {
        setError("Файл не выбран");
        return;
      }
      const formData = new FormData();
      formData.append("bugId", bugId);
      formData.append("file", file);
      await api.post(`/attachments`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      attachmentForm.reset();
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (id: string) => {
    try {
      await api.delete(`/attachments/${id}`);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const roleForDisplay = useMemo(() => membership?.role ?? "", [membership]);

  if (!bug) return <div>Загрузка...</div>;

  const canEditFields = canManage || isAssignee || isAuthor;

  return (
    <div className="card">
      <div className="section-title">
        <div>
          <h2>{bug.title}</h2>
          <p className="muted">Проект: {bug.projectId}</p>
        </div>
        <div className="inline" style={{ gap: 10 }}>
          <StatusBadge status={bug.status} />
          <PriorityBadge priority={bug.priority} />
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {canEditFields && (
        <div className="card" style={{ marginTop: 10 }}>
          <h4>Редактировать баг</h4>
          <form className="form" onSubmit={bugForm.handleSubmit(handleSave)}>
            <label className="label">Заголовок</label>
            <input className="input" {...bugForm.register("title")} />

            <label className="label">Описание</label>
            <textarea className="textarea" {...bugForm.register("description")} />

            <label className="label">Приоритет</label>
            <select className="select" {...bugForm.register("priority")}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>

            <label className="label">Статус</label>
            <select className="select" {...bugForm.register("status")}>
              <option value="new">new</option>
              <option value="in_progress">in_progress</option>
              <option value="testing">testing</option>
              <option value="done">done</option>
              <option value="closed">closed</option>
            </select>

            <label className="label">Назначить (userId)</label>
            <input className="input" placeholder="опционально" {...bugForm.register("assignedTo")} />

            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Сохраняем..." : "Сохранить"}
            </button>
          </form>
        </div>
      )}

      {!canManage && (
        <div className="card" style={{ background: "#f8fafc", marginTop: 10 }}>
          <p className="muted">Ваш доступ: {isAssignee ? "исполнитель" : isAuthor ? "автор" : roleForDisplay || "читатель"}.</p>
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <h4>Быстрая смена статуса</h4>
        <div className="inline" style={{ gap: 8 }}>
          {["new", "in_progress", "testing", "done", "closed"].map((s) => (
            <button key={s} className="btn btn-secondary" onClick={() => handleStatus(s as BugStatus)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="section-title">
        <h3>Комментарии</h3>
      </div>
      <div className="card-list">
        {bug.comments.map((c) => (
          <div key={c.id} className="card">
            <div className="inline" style={{ justifyContent: "space-between" }}>
              <span>{c.content}</span>
              {(canManage || c.authorId === user?.id) && (
                <button className="btn btn-danger" onClick={() => handleDeleteComment(c.id)}>
                  Удалить
                </button>
              )}
            </div>
            <p className="muted">Автор: {c.authorId}</p>
          </div>
        ))}
      </div>
      <form className="form" onSubmit={commentForm.handleSubmit(handleComment)} style={{ marginTop: 8 }}>
        <label className="label">Добавить комментарий</label>
        <textarea className="textarea" {...commentForm.register("content")} />
        <button className="btn btn-primary" type="submit" disabled={savingComment}>
          {savingComment ? "Отправляем..." : "Отправить"}
        </button>
      </form>

      <div className="section-title" style={{ marginTop: 18 }}>
        <h3>Вложения</h3>
      </div>
      <div className="card-list">
        {bug.attachments.map((a) => (
          <div key={a.id} className="card inline" style={{ justifyContent: "space-between" }}>
            <div>
              <div>{a.filename}</div>
              <div className="muted">Загрузил: {a.uploadedBy}</div>
              <a className="link" href={`${apiBase}/attachments/${a.id}/download`} target="_blank" rel="noreferrer">
                Скачать
              </a>
            </div>
            {(canManage || a.uploadedBy === user?.id) && (
              <button className="btn btn-danger" onClick={() => handleDeleteAttachment(a.id)}>
                Удалить
              </button>
            )}
          </div>
        ))}
      </div>

      <form className="form" onSubmit={attachmentForm.handleSubmit(handleAttachment)} style={{ marginTop: 8 }}>
        <label className="label">Файл</label>
        <input className="input" type="file" {...attachmentForm.register("file")}/>
        <button className="btn btn-primary" type="submit" disabled={savingAttachment}>
          {savingAttachment ? "Сохраняем..." : "Добавить"}
        </button>
      </form>
    </div>
  );
};
