import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch, apiUrl } from '../lib/api'
import { fmtDateTime } from '../lib/date'
import type { FileResponse, ReminderResponse, SubTaskResponse, TagResponse, TaskResponse, TaskStatus } from '../types'
import { ErrorBox } from '../components/ErrorBox'
import { useAuth } from '../auth'

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Готово',
  archived: 'Архив',
}

export function TaskDetailsPage() {
  const { id } = useParams()
  const taskId = Number(id)
  const nav = useNavigate()
  const { user } = useAuth()

  const [task, setTask] = useState<TaskResponse | null>(null)
  const [subtasks, setSubtasks] = useState<SubTaskResponse[]>([])
  const [files, setFiles] = useState<FileResponse[]>([])
  const [reminders, setReminders] = useState<ReminderResponse[]>([])
  const [allTags, setAllTags] = useState<TagResponse[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<any>(null)

  // edit form
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [repeatMinutes, setRepeatMinutes] = useState<string>('')
  const [selectedTags, setSelectedTags] = useState<number[]>([])

  // create tag
  const [newTagName, setNewTagName] = useState('')

  // create subtask
  const [newSubtask, setNewSubtask] = useState('')

  // upload file
  const [uploading, setUploading] = useState(false)

  // create reminder
  const [remEvery, setRemEvery] = useState('60')
  const [remStart, setRemStart] = useState('')
  const [remEnd, setRemEnd] = useState('')

  const assignedTagIds = useMemo(() => new Set(task?.tags?.map((t) => t.id) ?? []), [task])

  async function loadAll() {
    if (!taskId) return
    setError(null)
    setLoading(true)
    try {
      const t = await apiFetch<TaskResponse>(`/tasks/${taskId}`)
      setTask(t)

      const tagOwnerId = user?.role === 'admin' && user.id !== t.user_id ? t.user_id : null
      const tagPath = tagOwnerId ? `/tags?user_id=${tagOwnerId}` : '/tags'

      const [st, fl, rm, tg] = await Promise.all([
        apiFetch<SubTaskResponse[]>(`/subtasks?task_id=${taskId}`),
        apiFetch<FileResponse[]>(`/files?task_id=${taskId}`),
        apiFetch<ReminderResponse[]>(`/tasks/${taskId}/reminders`),
        apiFetch<TagResponse[]>(tagPath),
      ])
      setSubtasks(st)
      setFiles(fl)
      setReminders(rm)
      setAllTags(tg)

      // init form
      setTitle(t.title)
      setDescription(t.description ?? '')
      setStatus(t.status)
      setRepeatMinutes(t.repeat_interval_minutes ? String(t.repeat_interval_minutes) : '')
      setSelectedTags(t.tags.map((x) => x.id))
      if (t.due_at) {
        const d = new Date(t.due_at)
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
        setDueAt(local)
      } else {
        setDueAt('')
      }
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  async function saveTask(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const payload: any = {
        title,
        description: description.trim() ? description : null,
        status,
        tag_ids: selectedTags,
      }
      payload.due_at = dueAt ? new Date(dueAt).toISOString() : null
      payload.repeat_interval_minutes = repeatMinutes ? Number(repeatMinutes) : null

      const updated = await apiFetch<TaskResponse>(`/tasks/${taskId}`, { method: 'PUT', json: payload })
      setTask(updated)
    } catch (err) {
      setError(err)
    }
  }

  async function deleteTask() {
    if (!confirm('Удалить задачу?')) return
    setError(null)
    try {
      await apiFetch<{ message: string }>(`/tasks/${taskId}`, { method: 'DELETE' })
      nav('/tasks')
    } catch (err) {
      setError(err)
    }
  }

  async function createTag(e: React.FormEvent) {
    e.preventDefault()
    if (!newTagName.trim()) return
    setError(null)
    try {
      const tagOwnerId = user?.role === 'admin' && task && user.id !== task.user_id ? task.user_id : null
      const path = tagOwnerId ? `/tags?user_id=${tagOwnerId}` : '/tags'
      const tg = await apiFetch<TagResponse>(path, { method: 'POST', json: { name: newTagName.trim() } })
      setAllTags((prev) => [...prev, tg].sort((a, b) => a.name.localeCompare(b.name)))
      setNewTagName('')
    } catch (err) {
      setError(err)
    }
  }

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault()
    if (!newSubtask.trim()) return
    setError(null)
    try {
      const st = await apiFetch<SubTaskResponse>('/subtasks', {
        method: 'POST',
        json: { task_id: taskId, title: newSubtask.trim(), is_done: false },
      })
      setSubtasks((prev) => [...prev, st])
      setNewSubtask('')
      void loadAll()
    } catch (err) {
      setError(err)
    }
  }

  async function toggleSubtask(s: SubTaskResponse) {
    setError(null)
    try {
      const updated = await apiFetch<SubTaskResponse>(`/subtasks/${s.id}`, {
        method: 'PUT',
        json: { is_done: !s.is_done },
      })
      setSubtasks((prev) => prev.map((x) => (x.id === s.id ? updated : x)))
    } catch (err) {
      setError(err)
    }
  }

  async function deleteSubtask(id: number) {
    if (!confirm('Удалить подзадачу?')) return
    setError(null)
    try {
      await apiFetch<{ message: string }>(`/subtasks/${id}`, { method: 'DELETE' })
      setSubtasks((prev) => prev.filter((x) => x.id !== id))
      void loadAll()
    } catch (err) {
      setError(err)
    }
  }

  async function uploadFile(file: File) {
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(apiUrl(`/files?task_id=${taskId}`), {
        method: 'POST',
        headers: {
          // auth header set manually
          Authorization: `Bearer ${localStorage.getItem('nz_token') ?? ''}`,
        },
        body: fd,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail ?? res.statusText)
      }
      const f = (await res.json()) as FileResponse
      setFiles((prev) => [f, ...prev])
      void loadAll()
    } catch (err) {
      setError(err)
    } finally {
      setUploading(false)
    }
  }

  async function deleteFile(fileId: number) {
    if (!confirm('Удалить файл?')) return
    setError(null)
    try {
      await apiFetch<{ message: string }>(`/files/${fileId}`, { method: 'DELETE' })
      setFiles((prev) => prev.filter((x) => x.id !== fileId))
      void loadAll()
    } catch (err) {
      setError(err)
    }
  }

  async function downloadFile(file: FileResponse) {
    setError(null)
    try {
      const token = localStorage.getItem('nz_token') ?? ''
      const res = await fetch(apiUrl(`/files/${file.id}/download`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail ?? res.statusText)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err)
    }
  }

  async function createReminder(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const payload: any = {
        task_id: taskId,
        every_minutes: Number(remEvery),
        is_enabled: true,
      }
      if (remStart) payload.start_at = new Date(remStart).toISOString()
      if (remEnd) payload.end_at = new Date(remEnd).toISOString()
      const r = await apiFetch<ReminderResponse>(`/tasks/${taskId}/reminders`, { method: 'POST', json: payload })
      setReminders((prev) => [r, ...prev])
      setRemStart('')
      setRemEnd('')
      void loadAll()
    } catch (err) {
      setError(err)
    }
  }

  async function toggleReminder(rm: ReminderResponse) {
    setError(null)
    try {
      const updated = await apiFetch<ReminderResponse>(`/tasks/${taskId}/reminders/${rm.id}`, {
        method: 'PUT',
        json: { is_enabled: !rm.is_enabled },
      })
      setReminders((prev) => prev.map((x) => (x.id === rm.id ? updated : x)))
    } catch (err) {
      setError(err)
    }
  }

  async function deleteReminder(reminderId: number) {
    if (!confirm('Удалить напоминание?')) return
    setError(null)
    try {
      await apiFetch<{ message: string }>(`/tasks/${taskId}/reminders/${reminderId}`, { method: 'DELETE' })
      setReminders((prev) => prev.filter((x) => x.id !== reminderId))
      void loadAll()
    } catch (err) {
      setError(err)
    }
  }

  async function generateNext() {
    setError(null)
    try {
      const next = await apiFetch<TaskResponse>(`/tasks/${taskId}/generate-next`, { method: 'POST' })
      alert(`Создана следующая задача: #${next.id} (дедлайн: ${next.due_at ?? '-'})`)
    } catch (err) {
      setError(err)
    }
  }

  if (!taskId || Number.isNaN(taskId)) {
    return <div className="muted">Некорректный id задачи</div>
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/tasks" style={{ textDecoration: 'none' }}>← Назад</Link>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => void loadAll()} disabled={loading}>
            {loading ? '...' : 'Обновить'}
          </button>
          <button className="btn btn-danger" onClick={() => void deleteTask()}>
            Удалить
          </button>
        </div>
      </div>

      <h3 style={{ marginTop: 8 }}>Задача #{taskId}</h3>
      <ErrorBox error={error} />

      {task ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16 }}>
          <section className="card">
            <h4 style={{ marginTop: 0 }}>Редактировать задачу</h4>
            <form onSubmit={saveTask} className="grid">
              <label>
                Название
                <input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </label>
              <label>
                Описание
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
              </label>
              <div className="row" style={{ alignItems: 'end' }}>
                <label>
                  Дедлайн
                  <input value={dueAt} onChange={(e) => setDueAt(e.target.value)} type="datetime-local" />
                </label>
                <label>
                  Статус
                  <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                    <option value="todo">К выполнению</option>
                    <option value="in_progress">В работе</option>
                    <option value="done">Готово</option>
                    <option value="archived">Архив</option>
                  </select>
                </label>
                <label>
                  Повтор (минуты)
                  <input value={repeatMinutes} onChange={(e) => setRepeatMinutes(e.target.value)} type="number" min={1} />
                </label>
              </div>

              <label>
                Теги
                <div className="row" style={{ gap: 10, marginTop: 6 }}>
                  {allTags.map((tg) => (
                    <label key={tg.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tg.id)}
                        onChange={(e) => {
                          setSelectedTags((prev) => (e.target.checked ? [...prev, tg.id] : prev.filter((x) => x !== tg.id)))
                        }}
                      />
                      <span style={{ opacity: assignedTagIds.has(tg.id) ? 1 : 0.7 }}>{tg.name}</span>
                    </label>
                  ))}
                </div>
              </label>

              <div className="row" style={{ gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="row" style={{ gap: 10 }}>
                  <button className="btn btn-primary" type="submit">Сохранить</button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => void generateNext()}
                    disabled={!task.repeat_interval_minutes || !task.due_at}
                  >
                    Создать следующую
                  </button>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Обновлено: {task.updated_at ? fmtDateTime(task.updated_at) : '-'}
                </div>
              </div>
            </form>

            <hr className="divider" />

            <h4 style={{ marginTop: 0 }}>Подзадачи</h4>
            <form onSubmit={addSubtask} className="row" style={{ gap: 8, marginBottom: 10 }}>
              <input value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)} placeholder="Новая подзадача..." style={{ flex: 1 }} />
              <button className="btn btn-primary">Добавить</button>
            </form>
            <div className="grid">
              {subtasks.map((s) => (
                <div key={s.id} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 0 }}>
                      <input type="checkbox" checked={s.is_done} onChange={() => void toggleSubtask(s)} />
                      <span
                        style={{
                          textDecoration: s.is_done ? 'line-through' : 'none',
                          wordBreak: 'break-word',
                        }}
                      >
                        {s.title}
                      </span>
                    </label>
                    <button className="btn btn-danger" onClick={() => void deleteSubtask(s.id)}>
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
              {subtasks.length === 0 ? <div style={{ opacity: 0.7 }}>Нет подзадач</div> : null}
            </div>
          </section>

          <section style={{ display: 'grid', gap: 16 }}>
            <div className="card">
              <h4 style={{ marginTop: 0 }}>Теги</h4>
              <form onSubmit={createTag} className="row" style={{ gap: 8 }}>
                <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Новый тег..." />
                <button className="btn btn-primary">Создать</button>
              </form>
              <div className="row" style={{ gap: 6, marginTop: 10 }}>
                {allTags.map((tg) => (
                  <span key={tg.id} className="chip">#{tg.name}</span>
                ))}
                {allTags.length === 0 ? <span style={{ opacity: 0.7 }}>Тегов нет</span> : null}
              </div>
            </div>

            <div className="card">
              <h4 style={{ marginTop: 0 }}>Файлы</h4>
              <input
                type="file"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void uploadFile(f)
                  e.currentTarget.value = ''
                }}
              />
              <div className="grid" style={{ marginTop: 10 }}>
                {files.map((f) => (
                  <div key={f.id} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{f.filename}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{Math.round(f.size_bytes / 1024)} KB · {f.created_at ? fmtDateTime(f.created_at) : ''}</div>
                      <button className="btn" onClick={() => void downloadFile(f)}>Скачать</button>
                    </div>
                    <button className="btn btn-danger" onClick={() => void deleteFile(f.id)}>Удалить</button>
                    </div>
                  </div>
                ))}
                {files.length === 0 ? <div style={{ opacity: 0.7 }}>Файлов нет</div> : null}
              </div>
            </div>

            <div className="card">
              <h4 style={{ marginTop: 0 }}>Напоминания</h4>
              <form onSubmit={createReminder} className="grid">
                <label>
                  Каждые (минуты)
                  <input value={remEvery} onChange={(e) => setRemEvery(e.target.value)} type="number" min={1} />
                </label>
                <label>
                  Начать с (опционально)
                  <input value={remStart} onChange={(e) => setRemStart(e.target.value)} type="datetime-local" />
                </label>
                <label>
                  Закончить (опционально)
                  <input value={remEnd} onChange={(e) => setRemEnd(e.target.value)} type="datetime-local" />
                </label>
                <button className="btn btn-primary">Создать напоминание</button>
              </form>

              <div className="grid" style={{ marginTop: 10 }}>
                {reminders.map((r) => (
                  <div key={r.id} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                    <div className="row" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>Каждые {r.every_minutes} мин</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Включено: {String(r.is_enabled)} · Следующий запуск: {r.next_run_at ? fmtDateTime(r.next_run_at) : '-'}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn" onClick={() => void toggleReminder(r)}>
                          {r.is_enabled ? 'Выключить' : 'Включить'}
                        </button>
                        <button className="btn btn-danger" onClick={() => void deleteReminder(r.id)}>Удалить</button>
                      </div>
                    </div>
                  </div>
                ))}
                {reminders.length === 0 ? <div style={{ opacity: 0.7 }}>Напоминаний нет</div> : null}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="muted">Загрузка...</div>
      )}
    </div>
  )
}
