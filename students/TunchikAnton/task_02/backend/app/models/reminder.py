from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


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
