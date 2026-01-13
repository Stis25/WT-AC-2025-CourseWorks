from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from app.deps import execute_db, require_roles
from app.models import *

router = APIRouter(tags=["calendar"])


@router.get("/calendar", response_model=List[CalendarItem])
def calendar_view(
    date_from: datetime,
    date_to: datetime,
    user_id: Optional[int] = None,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    target_user_id = current.id
    if user_id is not None:
        if current.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required for user_id")
        target_user_id = user_id

    rows = execute_db(
        """
        SELECT id as task_id, title, due_at, status, user_id
        FROM Task
        WHERE user_id = ?
          AND due_at IS NOT NULL
          AND due_at >= ?
          AND due_at <= ?
        ORDER BY due_at ASC
    """,
        (target_user_id, date_from.isoformat(), date_to.isoformat()),
        fetchall=True,
    )

    out = []
    for r in rows:
        out.append(
            CalendarItem(
                task_id=r["task_id"],
                title=r["title"],
                due_at=datetime.fromisoformat(r["due_at"]),
                status=TaskStatus(r["status"]),
                user_id=r["user_id"],
            )
        )
    return out
