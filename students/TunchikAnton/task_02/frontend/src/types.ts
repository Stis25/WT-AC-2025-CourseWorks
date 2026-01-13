export type UserRole = 'user' | 'admin'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'archived'

export interface UserResponse {
  id: number
  email: string
  name: string
  role: UserRole
  created_at?: string
}

export interface AuthResponse {
  token: string
  user_data: UserResponse
}

export interface TagResponse {
  id: number
  name: string
  user_id: number
  created_at?: string
}

export interface TaskResponse {
  id: number
  user_id: number
  title: string
  description?: string | null
  due_at?: string | null
  status: TaskStatus
  repeat_interval_minutes?: number | null
  created_at?: string
  updated_at?: string
  tags: TagResponse[]
  subtasks_count: number
  files_count: number
  reminders_count: number
}

export interface SubTaskResponse {
  id: number
  task_id: number
  user_id: number
  title: string
  is_done: boolean
  created_at?: string
  updated_at?: string
}

export interface FileResponse {
  id: number
  task_id: number
  user_id: number
  filename: string
  content_type?: string | null
  size_bytes: number
  storage_path: string
  created_at?: string
}

export interface ReminderResponse {
  id: number
  task_id: number
  user_id: number
  every_minutes: number
  start_at?: string | null
  end_at?: string | null
  is_enabled: boolean
  next_run_at?: string | null
  created_at?: string
}

export interface CalendarItem {
  task_id: number
  title: string
  due_at: string
  status: TaskStatus
  user_id: number
}
