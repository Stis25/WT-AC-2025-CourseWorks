from datetime import datetime, timedelta, timezone
import logging
import os
from typing import List, Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database import get_db
from app.models import *
from app.utils import verify_token

logger = logging.getLogger("ne_zabudu_api")

security = HTTPBearer()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def execute_db(query: str, params: tuple = (), fetchone: bool = False, fetchall: bool = False):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(query, params)
        if fetchone:
            row = cur.fetchone()
            return dict(row) if row else None
        if fetchall:
            rows = cur.fetchall()
            return [dict(r) for r in rows]
        conn.commit()
        return cur.lastrowid
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.exception(f"DB error: {e}. Query={query} Params={params}")
        raise HTTPException(status_code=500, detail="Database error")
    finally:
        conn.close()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UserResponse:
    payload = verify_token(credentials.credentials)
    if not payload or not payload.get("user_id"):
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = int(payload["user_id"])
    row = execute_db(
        "SELECT id, email, name, role, created_at FROM User WHERE id = ?",
        (user_id,),
        fetchone=True,
    )
    if not row:
        raise HTTPException(status_code=401, detail="User not found")

    return UserResponse(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        role=UserRole(row["role"]),
        created_at=row["created_at"],
    )


def require_roles(*roles: UserRole):
    async def _dep(current: UserResponse = Depends(get_current_user)) -> UserResponse:
        if current.role not in roles:
            raise HTTPException(status_code=403, detail="Access denied")
        return current

    return _dep


def ensure_task_access(task_user_id: int, current: UserResponse):
    if current.role == UserRole.ADMIN:
        return
    if task_user_id != current.id:
        raise HTTPException(status_code=403, detail="Access denied")


def normalize_pagination(limit: int, offset: int):
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)
    return limit, offset


def compute_next_run(start_at: Optional[str], every_minutes: int) -> str:
    base = utcnow()
    if start_at:
        try:
            base = datetime.fromisoformat(start_at)
            if base.tzinfo is None:
                base = base.replace(tzinfo=timezone.utc)
        except Exception:
            base = utcnow()
    next_dt = base + timedelta(minutes=every_minutes)
    return next_dt.isoformat()


def load_task_tags(task_id: int) -> List[TagResponse]:
    rows = execute_db(
        """
        SELECT t.id, t.name, t.user_id, t.created_at
        FROM Tag t
        JOIN TaskTag tt ON tt.tag_id = t.id
        WHERE tt.task_id = ?
        ORDER BY t.name ASC
    """,
        (task_id,),
        fetchall=True,
    )
    return [TagResponse(**r) for r in rows]


def task_counters(task_id: int) -> dict:
    s = execute_db("SELECT COUNT(*) as c FROM SubTask WHERE task_id = ?", (task_id,), fetchone=True)["c"]
    f = execute_db("SELECT COUNT(*) as c FROM File WHERE task_id = ?", (task_id,), fetchone=True)["c"]
    r = execute_db("SELECT COUNT(*) as c FROM Reminder WHERE task_id = ?", (task_id,), fetchone=True)["c"]
    return {"subtasks_count": s, "files_count": f, "reminders_count": r}


def sync_task_tags(task_id: int, current_user_id: int, tag_ids: Optional[List[int]]):
    if tag_ids is None:
        return

    if tag_ids:
        existing = execute_db(
            f"SELECT id FROM Tag WHERE user_id = ? AND id IN ({','.join(['?']*len(tag_ids))})",
            (current_user_id, *tag_ids),
            fetchall=True,
        )
        ok_ids = {r["id"] for r in existing}
        bad = [tid for tid in tag_ids if tid not in ok_ids]
        if bad:
            raise HTTPException(status_code=400, detail=f"Unknown tag_ids for this user: {bad}")

    execute_db("DELETE FROM TaskTag WHERE task_id = ?", (task_id,))
    if tag_ids:
        for tid in tag_ids:
            execute_db("INSERT OR IGNORE INTO TaskTag (task_id, tag_id) VALUES (?, ?)", (task_id, tid))
