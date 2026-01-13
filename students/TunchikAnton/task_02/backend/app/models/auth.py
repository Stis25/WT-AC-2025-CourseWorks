import re

from pydantic import BaseModel, validator

from .common import EMAIL_REGEX
from .user import UserResponse


class LoginRequest(BaseModel):
    email: str
    password: str

    @validator("email")
    def validate_email(cls, v):
        if not re.match(EMAIL_REGEX, v):
            raise ValueError("Invalid email format")
        return v.lower()


class AuthResponse(BaseModel):
    token: str
    user_data: UserResponse
