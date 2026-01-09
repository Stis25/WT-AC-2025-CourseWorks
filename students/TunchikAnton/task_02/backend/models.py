from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import datetime
import re
from enum import Enum

EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"

class TaskStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    ARCHIVED = "archived"


class SubTaskInlineCreate(BaseModel):
    """Подзадача для создания вместе с задачей одним запросом."""

    title: str = Field(..., min_length=1, max_length=200)
    is_done: bool = False

# Auth / Users

class UserCreate(BaseModel):
    email: str
    name: str = Field(..., min_length=1, max_length=120)
    password: str = Field(..., min_length=6, max_length=200)
    role: UserRole = UserRole.USER

    @validator("email")
    def validate_email(cls, v):
        if not re.match(EMAIL_REGEX, v):
            raise ValueError("Invalid email format")
        return v.lower()

class LoginRequest(BaseModel):
    email: str
    password: str

    @validator("email")
    def validate_email(cls, v):
        if not re.match(EMAIL_REGEX, v):
            raise ValueError("Invalid email format")
        return v.lower()

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: UserRole
    created_at: Optional[datetime] = None


class UserUpdate(BaseModel):
    # Admin-only update
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    role: Optional[UserRole] = None

class AuthResponse(BaseModel):
    token: str
    user_data: UserResponse

# -------- Tags --------

class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)

class TagUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)

class TagResponse(BaseModel):
    id: int
    name: str
    user_id: int
    created_at: Optional[datetime] = None

# -------- Tasks --------

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    due_at: Optional[datetime] = None
    status: TaskStatus = TaskStatus.TODO

    # MVP: повторяемость
    # Пример: 120 = каждые 2 часа; 1440 = ежедневно; 10080 = еженедельно
    repeat_interval_minutes: Optional[int] = Field(None, ge=1, le=525600)  # до года

    tag_ids: Optional[List[int]] = None

    # Позволяет создавать задачу сразу с подзадачами (MVP UX)
    subtasks: Optional[List[SubTaskInlineCreate]] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    due_at: Optional[datetime] = None
    status: Optional[TaskStatus] = None
    repeat_interval_minutes: Optional[int] = Field(None, ge=1, le=525600)
    tag_ids: Optional[List[int]] = None

class TaskResponse(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str] = None
    due_at: Optional[datetime] = None
    status: TaskStatus
    repeat_interval_minutes: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    tags: List[TagResponse] = []
    subtasks_count: int = 0
    files_count: int = 0
    reminders_count: int = 0

# -------- SubTasks --------

class SubTaskCreate(BaseModel):
    task_id: int
    title: str = Field(..., min_length=1, max_length=200)
    is_done: bool = False

class SubTaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    is_done: Optional[bool] = None

class SubTaskResponse(BaseModel):
    id: int
    task_id: int
    user_id: int
    title: str
    is_done: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

# -------- Files --------

class FileResponse(BaseModel):
    id: int
    task_id: int
    user_id: int
    filename: str
    content_type: Optional[str] = None
    size_bytes: int
    storage_path: str
    created_at: Optional[datetime] = None

# -------- Reminders --------

class ReminderCreate(BaseModel):
    task_id: int
    # MVP: напоминание через интервал, например 120 минут
    every_minutes: int = Field(..., ge=1, le=10080)  # до недели интервал
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    is_enabled: bool = True

class ReminderUpdate(BaseModel):
    every_minutes: Optional[int] = Field(None, ge=1, le=10080)
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    is_enabled: Optional[bool] = None

class ReminderResponse(BaseModel):
    id: int
    task_id: int
    user_id: int
    every_minutes: int
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    is_enabled: bool
    next_run_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

# -------- Calendar --------

class CalendarItem(BaseModel):
    task_id: int
    title: str
    due_at: datetime
    status: TaskStatus
    user_id: int

# -------- Bonus: NLU stub --------

class NLUInput(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)

class NLUResult(BaseModel):
    # Заглушка: в будущем распарсим текст в TaskCreate
    intent: str
    extracted: dict
