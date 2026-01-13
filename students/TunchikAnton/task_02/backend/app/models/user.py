import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, validator

from .common import EMAIL_REGEX, UserRole


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


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: UserRole
    created_at: Optional[datetime] = None
