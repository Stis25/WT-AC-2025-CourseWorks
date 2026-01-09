import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { ErrorBox } from '../components/ErrorBox'
import { apiFetch } from '../lib/api'
import { fmtDateTime } from '../lib/date'
import type { TagResponse, TaskResponse, TaskStatus, UserResponse } from '../types'

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Готово',
  archived: 'Архив',
}

export function AdminPage() {
  const [users, setUsers] = useState<UserResponse[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [tasks, setTasks] = useState<TaskResponse[]>([])
  const [tags, setTags] = useState<TagResponse[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<any>(null)

  // create task for selected user
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [repeatMinutes, setRepeatMinutes] = useState<string>('')
  const [selectedTags, setSelectedTags] = useState<number[]>([])

  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId) ?? null, [users, selectedUserId])

  async function loadUsers() {
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch<UserResponse[]>(`/users?limit=100&offset=0`)
      setUsers(data)
      if (!selectedUserId && data.length) setSelectedUserId(data[0].id)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  async function loadUserData(userId: number) {
    setError(null)
    setLoading(true)
    try {
      const [t, tg] = await Promise.all([
        apiFetch<TaskResponse[]>(`/tasks?user_id=${userId}&limit=100&offset=0`),
        apiFetch<TagResponse[]>(`/tags?user_id=${userId}`),
      ])
      setTasks(t)
      setTags(tg)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedUserId) void loadUserData(selectedUserId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId])

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUserId) return
    setError(null)
    try {
      const payload: any = {
        title,
        description: description.trim() ? description : null,
        status,
        tag_ids: selectedTags,
      }
      if (dueAt) payload.due_at = new Date(dueAt).toISOString()
      if (repeatMinutes) payload.repeat_interval_minutes = Number(repeatMinutes)

      const created = await apiFetch<TaskResponse>(`/tasks?user_id=${selectedUserId}`, { method: 'POST', json: payload })
      setTasks((prev) => [created, ...prev])
      setTitle('')
      setDescription('')
      setDueAt('')
      setRepeatMinutes('')
      setSelectedTags([])
    } catch (err) {
      setError(err)
    }
  }

  async function deleteUser(userId: number) {
    if (!confirm('Удалить пользователя и все его данные?')) return
    setError(null)
    try {
      await apiFetch<{ message: string }>(`/users/${userId}`, { method: 'DELETE' })
      const next = users.filter((u) => u.id !== userId)
      setUsers(next)
      setSelectedUserId(next[0]?.id ?? null)
    } catch (err) {
      setError(err)
    }
  }

  async function deleteTask(taskId: number) {
    if (!confirm('Удалить задачу?')) return
    setError(null)
    try {
      await apiFetch<{ message: string }>(`/tasks/${taskId}`, { method: 'DELETE' })
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
    } catch (err) {
      setError(err)
    }
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Админ-панель</h3>
      <ErrorBox error={error} />

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0 }}>Пользователи</h4>
          <button className="btn" onClick={() => void loadUsers()} disabled={loading}>
            {loading ? '...' : 'Обновить'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginTop: 12 }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: 'none' }}>
            {users.map((u) => (
              <div
                key={u.id}
                onClick={() => setSelectedUserId(u.id)}
                style={{
                  padding: 12,
                  cursor: 'pointer',
                  background: selectedUserId === u.id ? 'rgba(37,99,235,0.12)' : 'transparent',
                  borderBottom: '1px solid rgba(15,23,42,0.08)',
                }}
              >
                <div style={{ fontWeight: 900 }}>{u.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{u.email} · {u.role}</div>
              </div>
            ))}
            {users.length === 0 ? <div className="muted" style={{ padding: 12 }}>Пользователей нет</div> : null}
          </div>

          <div className="card" style={{ boxShadow: 'none' }}>
            {selectedUser ? (
              <>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{selectedUser.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>id: {selectedUser.id} · {selectedUser.email}</div>
                  </div>
                  <button className="btn btn-danger" onClick={() => void deleteUser(selectedUser.id)}>
                    Удалить пользователя
                  </button>
                </div>

                <hr className="divider" />

                <h4 style={{ marginTop: 0 }}>Создать задачу для пользователя</h4>
                <form onSubmit={createTask} className="grid">
                  <label>
                    Название
                    <input value={title} onChange={(e) => setTitle(e.target.value)} required />
                  </label>
                  <label>
                    Описание
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                  </label>
                  <div className="row" style={{ alignItems: 'end' }}>
                    <label style={{ minWidth: 220, flex: 1 }}>
                      Дедлайн
                      <input value={dueAt} onChange={(e) => setDueAt(e.target.value)} type="datetime-local" />
                    </label>
                    <label style={{ minWidth: 220, flex: 1 }}>
                      Статус
                      <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                        <option value="todo">{STATUS_LABEL.todo}</option>
                        <option value="in_progress">{STATUS_LABEL.in_progress}</option>
                        <option value="done">{STATUS_LABEL.done}</option>
                        <option value="archived">{STATUS_LABEL.archived}</option>
                      </select>
                    </label>
                    <label style={{ minWidth: 220, flex: 1 }}>
                      Повтор (минуты)
                      <input value={repeatMinutes} onChange={(e) => setRepeatMinutes(e.target.value)} type="number" min={1} />
                    </label>
                  </div>

                  <label>
                    Теги
                    <div className="row" style={{ gap: 10, marginTop: 8 }}>
                      {tags.map((tg) => (
                        <label key={tg.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedTags.includes(tg.id)}
                            onChange={(e) => {
                              setSelectedTags((prev) => (e.target.checked ? [...prev, tg.id] : prev.filter((x) => x !== tg.id)))
                            }}
                          />
                          {tg.name}
                        </label>
                      ))}
                      {tags.length === 0 ? <span className="muted">Тегов нет</span> : null}
                    </div>
                  </label>

                  <button className="btn btn-primary">Создать</button>
                </form>

                <hr className="divider" />

                <h4 style={{ marginTop: 0 }}>Задачи</h4>
                <div className="grid">
                  {tasks.map((t) => (
                    <div key={t.id} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <Link to={`/tasks/${t.id}`} style={{ fontWeight: 900, textDecoration: 'none', color: 'var(--text)' }}>
                            {t.title}
                          </Link>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {t.due_at ? fmtDateTime(t.due_at) : 'Дедлайн не задан'} · {STATUS_LABEL[t.status]}
                          </div>
                        </div>
                        <button className="btn btn-danger" onClick={() => void deleteTask(t.id)}>
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
                  {tasks.length === 0 ? <div className="muted">Задач нет</div> : null}
                </div>
              </>
            ) : (
              <div className="muted">Выберите пользователя</div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
