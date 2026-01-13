from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)


class TagUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)


class TagResponse(BaseModel):
    id: int
    name: str
    user_id: int
    created_at: Optional[datetime] = None
