from datetime import datetime

from pydantic import BaseModel

from .common import TaskStatus


class CalendarItem(BaseModel):
    task_id: int
    title: str
    due_at: datetime
    status: TaskStatus
    user_id: int
