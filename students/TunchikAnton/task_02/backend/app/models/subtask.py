from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class SubTaskInlineCreate(BaseModel):
    """Подзадача для создания вместе с задачей одним запросом."""

    title: str = Field(..., min_length=1, max_length=200)
    is_done: bool = False


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
