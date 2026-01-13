from typing import Optional

from pydantic import BaseModel, Field

from .common import UserRole


class UserUpdate(BaseModel):
    # Admin-only update
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    role: Optional[UserRole] = None
