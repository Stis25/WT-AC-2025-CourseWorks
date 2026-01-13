import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { ErrorBox } from '../components/ErrorBox'
import { apiFetch } from '../lib/api'
import { fmtDateTime } from '../lib/date'
import type { TagResponse, TaskResponse, TaskStatus } from '../types'

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Готово',
  archived: 'Архив',
}

function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className="chip">{STATUS_LABEL[status] ?? status}</span>
}

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskResponse[]>([])
  const [tags, setTags] = useState<TagResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<any>(null)

  // filters
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TaskStatus | ''>('')

  // create form
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [repeatMinutes, setRepeatMinutes] = useState<string>('')
  const [selectedTags, setSelectedTags] = useState<number[]>([])
  const [newTagsDraft, setNewTagsDraft] = useState<string[]>([])

  // create subtasks together with a task
  const [subtasksDraft, setSubtasksDraft] = useState<string[]>([])

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (status) params.set('status_filter', status)
    return params.toString()
  }, [search, status])

  async function loadAll() {
    setError(null)
    setLoading(true)
    try {
      const [t, tg] = await Promise.all([
        apiFetch<TaskResponse[]>(`/tasks${query ? `?${query}` : ''}`),
        apiFetch<TagResponse[]>(`/tags`),
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
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const subtasksPayload = subtasksDraft
      .map((x) => x.trim())
      .filter(Boolean)
      .map((t) => ({ title: t, is_done: false }))

    try {
      // create missing tags right in the task creation flow
      const draftNames = newTagsDraft
        .map((x) => x.trim())
        .filter(Boolean)

      const existingByName = new Map(tags.map((t) => [t.name.toLowerCase(), t.id] as const))
      const createdTagIds: number[] = []
      const createdTags: TagResponse[] = []

      for (const name of draftNames) {
        const key = name.toLowerCase()
        const existingId = existingByName.get(key)
        if (existingId) {
          createdTagIds.push(existingId)
          continue
        }
        try {
          const tg = await apiFetch<TagResponse>('/tags', { method: 'POST', json: { name } })
          createdTags.push(tg)
          existingByName.set(key, tg.id)
          createdTagIds.push(tg.id)
        } catch (err) {
          // if backend responded that tag exists (race / duplicated name), reload tags and try to resolve it
          const latest = await apiFetch<TagResponse[]>('/tags')
          setTags(latest)
          const found = latest.find((t) => t.name.toLowerCase() === key)
          if (found) {
            existingByName.set(key, found.id)
            createdTagIds.push(found.id)
            continue
          }
          throw err
        }
      }

      if (createdTags.length) {
        setTags((prev) => [...prev, ...createdTags].sort((a, b) => a.name.localeCompare(b.name)))
      }

      const finalTagIds = Array.from(new Set<number>([...selectedTags, ...createdTagIds]))

      const payload: any = {
        title,
        description: description.trim() ? description : null,
        tag_ids: finalTagIds,
        // backend supports it; if not — pydantic simply ignores unknown fields
        subtasks: subtasksPayload,
      }
      if (dueAt) payload.due_at = new Date(dueAt).toISOString()
      if (repeatMinutes) payload.repeat_interval_minutes = Number(repeatMinutes)

      let created = await apiFetch<TaskResponse>('/tasks', { method: 'POST', json: payload })

      // fallback: if backend didn't create inline subtasks (older version), create them via /subtasks
      if (subtasksPayload.length && (created.subtasks_count ?? 0) === 0) {
        await Promise.all(
          subtasksPayload.map((st) =>
            apiFetch('/subtasks', { method: 'POST', json: { task_id: created.id, title: st.title, is_done: false } }),
          ),
        )
        created = { ...created, subtasks_count: subtasksPayload.length }
      }

      setTitle('')
      setDescription('')
      setDueAt('')
      setRepeatMinutes('')
      setSelectedTags([])
      setSubtasksDraft([])
      setNewTagsDraft([])
      setTasks((prev) => [created, ...prev])
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
      <h3 style={{ marginTop: 0 }}>Задачи</h3>
      <ErrorBox error={error} />

      <section className="card" style={{ marginBottom: 16 }}>
        <h4 style={{ marginTop: 0 }}>Создать задачу</h4>
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
            <label style={{ minWidth: 260, flex: 1 }}>
              Дедлайн
              <input value={dueAt} onChange={(e) => setDueAt(e.target.value)} type="datetime-local" />
            </label>
            <label style={{ minWidth: 260, flex: 1 }}>
              Повтор (минуты, опционально)
              <input value={repeatMinutes} onChange={(e) => setRepeatMinutes(e.target.value)} type="number" min={1} />
            </label>
          </div>

          <label>
            Подзадачи (опционально)
            <div className="grid" style={{ marginTop: 8 }}>
              {subtasksDraft.map((val, idx) => (
                <div key={idx} className="row" style={{ alignItems: 'center' }}>
                  <input
                    value={val}
                    onChange={(e) => {
                      const next = [...subtasksDraft]
                      next[idx] = e.target.value
                      setSubtasksDraft(next)
                    }}
                    placeholder={`Подзадача #${idx + 1}`}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setSubtasksDraft((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Удалить
                  </button>
                </div>
              ))}

              <button type="button" className="btn" onClick={() => setSubtasksDraft((prev) => [...prev, ''])}>
                + Добавить подзадачу
              </button>
            </div>
          </label>

          <label>
            Теги
            <div className="row" style={{ marginTop: 8, alignItems: 'center' }}>
              {tags.length === 0 ? (
                <span className="muted">Тегов пока нет.</span>
              ) : (
                tags.map((tg) => (
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
                ))
              )}
            </div>

            <div className="grid" style={{ marginTop: 10 }}>
              {newTagsDraft.map((val, idx) => (
                <div key={idx} className="row" style={{ alignItems: 'center' }}>
                  <input
                    value={val}
                    onChange={(e) => {
                      const next = [...newTagsDraft]
                      next[idx] = e.target.value
                      setNewTagsDraft(next)
                    }}
                    placeholder={`Новый тег #${idx + 1}`}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setNewTagsDraft((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Убрать
                  </button>
                </div>
              ))}

              <button type="button" className="btn" onClick={() => setNewTagsDraft((prev) => [...prev, ''])}>
                + Добавить новый тег
              </button>

              {newTagsDraft.length ? (
                <div className="muted" style={{ fontSize: 12 }}>
                  Новые теги будут созданы при создании задачи.
                </div>
              ) : null}
            </div>
          </label>

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button type="submit" className="btn btn-primary">
              Создать
            </button>
          </div>
        </form>
      </section>

      <section className="row" style={{ marginBottom: 12, alignItems: 'end' }}>
        <label style={{ minWidth: 260, flex: 1 }}>
          Поиск
          <input placeholder="Название или описание..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label style={{ minWidth: 260, flex: 1 }}>
          Статус
          <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="">Все</option>
            <option value="todo">К выполнению</option>
            <option value="in_progress">В работе</option>
            <option value="done">Готово</option>
            <option value="archived">Архив</option>
          </select>
        </label>
        <button className="btn" onClick={() => void loadAll()} disabled={loading}>
          {loading ? '...' : 'Обновить'}
        </button>
      </section>

      <div className="grid">
        {tasks.map((t) => (
          <div key={t.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Link to={`/tasks/${t.id}`} style={{ fontWeight: 900, textDecoration: 'none', color: 'var(--text)' }}>
                  {t.title}
                </Link>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {t.due_at ? `Дедлайн: ${fmtDateTime(t.due_at)}` : 'Дедлайн не задан'}
                </div>
              </div>

              <div className="row" style={{ gap: 10 }}>
                <StatusBadge status={t.status} />
                <button className="btn btn-danger" onClick={() => void deleteTask(t.id)}>
                  Удалить
                </button>
              </div>
            </div>

            {t.tags?.length ? (
              <div className="row" style={{ gap: 6, marginTop: 10 }}>
                {t.tags.map((tg) => (
                  <span key={tg.id} className="chip">#{tg.name}</span>
                ))}
              </div>
            ) : null}

            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Подзадачи: {t.subtasks_count} · Файлы: {t.files_count} · Напоминания: {t.reminders_count}
              {t.repeat_interval_minutes ? ` · Повтор: ${t.repeat_interval_minutes} мин` : ''}
            </div>
          </div>
        ))}

        {tasks.length === 0 ? <div className="muted">Ничего не найдено</div> : null}
      </div>
    </div>
  )
}
