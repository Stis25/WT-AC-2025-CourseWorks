import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { ErrorBox } from '../components/ErrorBox'
import { apiFetch } from '../lib/api'
import { fmtDateTime } from '../lib/date'
import type { CalendarItem } from '../types'

function defaultRange() {
  const now = new Date()
  const from = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
  const to = new Date(now.getTime() + 14 * 24 * 3600 * 1000)

  const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  return { from: toLocal(from), to: toLocal(to) }
}

export function CalendarPage() {
  const def = defaultRange()
  const [dateFrom, setDateFrom] = useState(def.from)
  const [dateTo, setDateTo] = useState(def.to)
  const [items, setItems] = useState<CalendarItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<any>(null)

  async function load() {
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch<CalendarItem[]>(
        '/calendar?' +
          new URLSearchParams({
            date_from: new Date(dateFrom).toISOString(),
            date_to: new Date(dateTo).toISOString(),
          }).toString(),
      )
      setItems(data)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Календарь</h3>
      <ErrorBox error={error} />

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ alignItems: 'end' }}>
          <label style={{ minWidth: 260, flex: 1 }}>
            С
            <input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label style={{ minWidth: 260, flex: 1 }}>
            По
            <input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <button className="btn" onClick={() => void load()} disabled={loading}>
            {loading ? '...' : 'Показать'}
          </button>
        </div>
      </section>

      <div className="grid">
        {items.map((i) => (
          <div key={i.task_id} className="card">
            <Link to={`/tasks/${i.task_id}`} style={{ fontWeight: 900, textDecoration: 'none', color: 'var(--text)' }}>
              {i.title}
            </Link>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Дедлайн: {fmtDateTime(i.due_at)} · Статус: {i.status}
            </div>
          </div>
        ))}

        {items.length === 0 ? <div className="muted">Нет задач в выбранном диапазоне</div> : null}
      </div>
    </div>
  )
}
