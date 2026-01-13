from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from .common import TaskStatus
from .subtask import SubTaskInlineCreate
from .tag import TagResponse


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
