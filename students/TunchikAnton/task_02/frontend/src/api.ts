import type {
  AuthResponse,
  CalendarItem,
  FileResponse,
  ReminderResponse,
  SubTaskResponse,
  TagResponse,
  TaskResponse,
  UserResponse,
  TaskStatus,
} from './types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function getToken(): string | null {
  return localStorage.getItem('token')
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': init.body instanceof FormData ? undefined : 'application/json',
      ...authHeaders(),
      ...(init.headers || {}),
    } as any,
  })

  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const data = await res.json()
      if (data?.detail) msg = data.detail
    } catch {
      // ignore
    }
    throw new Error(msg)
  }

  // File download endpoints are not handled here
  return (await res.json()) as T
}

export const api = {
  API_URL,

  async health() {
    return http<{ status: string }>('/health')
  },

  async register(payload: { email: string; name: string; password: string; role: 'user' | 'admin' }) {
    return http<AuthResponse>('/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async login(payload: { email: string; password: string }) {
    return http<AuthResponse>('/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async profile() {
    return http<UserResponse>('/profile')
  },

  // Admin
  async listUsers(params?: { limit?: number; offset?: number; search?: string }) {
    const sp = new URLSearchParams()
    if (params?.limit) sp.set('limit', String(params.limit))
    if (params?.offset) sp.set('offset', String(params.offset))
    if (params?.search) sp.set('search', params.search)
    return http<UserResponse[]>(`/users?${sp.toString()}`)
  },

  async updateUser(userId: number, payload: { name?: string; role?: 'user' | 'admin' }) {
    return http<UserResponse>(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  async deleteUser(userId: number) {
    return http<{ message: string }>(`/users/${userId}`, { method: 'DELETE' })
  },

  // Tags
  async listTags(userId?: number) {
    const sp = new URLSearchParams()
    if (userId) sp.set('user_id', String(userId))
    const q = sp.toString()
    return http<TagResponse[]>(`/tags${q ? `?${q}` : ''}`)
  },

  async createTag(name: string, userId?: number) {
    const sp = new URLSearchParams()
    if (userId) sp.set('user_id', String(userId))
    const q = sp.toString()
    return http<TagResponse>(`/tags${q ? `?${q}` : ''}`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },

  async deleteTag(tagId: number) {
    return http<{ message: string }>(`/tags/${tagId}`, { method: 'DELETE' })
  },

  // Tasks
  async listTasks(params?: {
    search?: string
    status_filter?: TaskStatus
    due_from?: string
    due_to?: string
    user_id?: number
    limit?: number
    offset?: number
  }) {
    const sp = new URLSearchParams()
    if (params?.search) sp.set('search', params.search)
    if (params?.status_filter) sp.set('status_filter', params.status_filter)
    if (params?.due_from) sp.set('due_from', params.due_from)
    if (params?.due_to) sp.set('due_to', params.due_to)
    if (params?.user_id) sp.set('user_id', String(params.user_id))
    if (params?.limit) sp.set('limit', String(params.limit))
    if (params?.offset) sp.set('offset', String(params.offset))
    return http<TaskResponse[]>(`/tasks?${sp.toString()}`)
  },

  async getTask(taskId: number) {
    return http<TaskResponse>(`/tasks/${taskId}`)
  },

  async createTask(
    payload: {
      title: string
      description?: string
      due_at?: string
      status?: TaskStatus
      repeat_interval_minutes?: number
      tag_ids?: number[] | null
    },
    userId?: number,
  ) {
    const sp = new URLSearchParams()
    if (userId) sp.set('user_id', String(userId))
    const q = sp.toString()
    return http<TaskResponse>(`/tasks${q ? `?${q}` : ''}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async updateTask(taskId: number, payload: any) {
    return http<TaskResponse>(`/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  async deleteTask(taskId: number) {
    return http<{ message: string }>(`/tasks/${taskId}`, { method: 'DELETE' })
  },

  async generateNext(taskId: number) {
    return http<TaskResponse>(`/tasks/${taskId}/generate-next`, { method: 'POST' })
  },

  // Subtasks
  async listSubtasks(taskId: number) {
    return http<SubTaskResponse[]>(`/subtasks?task_id=${taskId}`)
  },

  async createSubtask(taskId: number, title: string) {
    return http<SubTaskResponse>('/subtasks', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId, title, is_done: false }),
    })
  },

  async updateSubtask(subtaskId: number, payload: { title?: string; is_done?: boolean }) {
    return http<SubTaskResponse>(`/subtasks/${subtaskId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  async deleteSubtask(subtaskId: number) {
    return http<{ message: string }>(`/subtasks/${subtaskId}`, { method: 'DELETE' })
  },

  // Calendar
  async calendar(dateFrom: string, dateTo: string, userId?: number) {
    const sp = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
    if (userId) sp.set('user_id', String(userId))
    return http<CalendarItem[]>(`/calendar?${sp.toString()}`)
  },

  // Files
  async listFiles(taskId: number) {
    return http<FileResponse[]>(`/files?task_id=${taskId}`)
  },

  async uploadFile(taskId: number, file: File) {
    const fd = new FormData()
    fd.append('file', file)

    const res = await fetch(`${API_URL}/files?task_id=${taskId}`, {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    })

    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`
      try {
        const data = await res.json()
        if (data?.detail) msg = data.detail
      } catch {
        // ignore
      }
      throw new Error(msg)
    }

    return (await res.json()) as FileResponse
  },

  fileDownloadUrl(fileId: number) {
    return `${API_URL}/files/${fileId}/download`
  },

  async deleteFile(fileId: number) {
    return http<{ message: string }>(`/files/${fileId}`, { method: 'DELETE' })
  },

  // Reminders
  async listReminders(taskId: number) {
    return http<ReminderResponse[]>(`/tasks/${taskId}/reminders`)
  },

  async createReminder(taskId: number, payload: { every_minutes: number; start_at?: string; end_at?: string; is_enabled: boolean }) {
    return http<ReminderResponse>(`/tasks/${taskId}/reminders`, {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId, ...payload }),
    })
  },

  async updateReminder(taskId: number, reminderId: number, payload: any) {
    return http<ReminderResponse>(`/tasks/${taskId}/reminders/${reminderId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  async deleteReminder(taskId: number, reminderId: number) {
    return http<{ message: string }>(`/tasks/${taskId}/reminders/${reminderId}`, { method: 'DELETE' })
  },
}
