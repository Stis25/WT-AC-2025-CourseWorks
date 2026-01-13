from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class FileResponse(BaseModel):
    id: int
    task_id: int
    user_id: int
    filename: str
    content_type: Optional[str] = None
    size_bytes: int
    storage_path: str
    created_at: Optional[datetime] = None
