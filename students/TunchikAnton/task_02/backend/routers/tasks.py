from datetime import datetime, timedelta, timezone
from typing import List, Optional
import os

from fastapi import APIRouter, Depends, HTTPException, Query

from deps import (
    compute_next_run,
    ensure_task_access,
    execute_db,
    load_task_tags,
    normalize_pagination,
    require_roles,
    sync_task_tags,
    task_counters,
)
from models import *

router = APIRouter(tags=["tasks"])


@router.post("/tasks", response_model=TaskResponse)
def create_task(
    data: TaskCreate,
    user_id: Optional[int] = None,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    target_user_id = current.id
    if user_id is not None:
        if current.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required for user_id")
        if not execute_db("SELECT id FROM User WHERE id = ?", (user_id,), fetchone=True):
            raise HTTPException(status_code=404, detail="Target user not found")
        target_user_id = user_id

    task_id = execute_db(
        """
        INSERT INTO Task (user_id, title, description, due_at, status, repeat_interval_minutes)
        VALUES (?, ?, ?, ?, ?, ?)
    """,
        (
            target_user_id,
            data.title.strip(),
            data.description,
            data.due_at.isoformat() if data.due_at else None,
            data.status.value,
            data.repeat_interval_minutes,
        ),
    )

    sync_task_tags(task_id, target_user_id, data.tag_ids)

    if getattr(data, "subtasks", None):
        subtasks = [st for st in (data.subtasks or []) if st and st.title and st.title.strip()]
        subtasks = subtasks[:50]
        for st in subtasks:
            execute_db(
                """
                INSERT INTO SubTask (task_id, user_id, title, is_done)
                VALUES (?, ?, ?, ?)
                """,
                (task_id, target_user_id, st.title.strip(), 1 if st.is_done else 0),
            )

    row = execute_db("SELECT * FROM Task WHERE id = ?", (task_id,), fetchone=True)
    counters = task_counters(task_id)

    return TaskResponse(
        id=row["id"],
        user_id=row["user_id"],
        title=row["title"],
        description=row["description"],
        due_at=row["due_at"],
        status=TaskStatus(row["status"]),
        repeat_interval_minutes=row["repeat_interval_minutes"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        tags=load_task_tags(task_id),
        **counters,
    )


@router.get("/tasks", response_model=List[TaskResponse])
def list_tasks(
    search: Optional[str] = None,
    status_filter: Optional[TaskStatus] = None,
    due_from: Optional[datetime] = None,
    due_to: Optional[datetime] = None,
    user_id: Optional[int] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    limit, offset = normalize_pagination(limit, offset)

    target_user_id = current.id
    if user_id is not None:
        if current.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required for user_id filter")
        target_user_id = user_id

    q = "SELECT * FROM Task WHERE user_id = ?"
    params = [target_user_id]

    if search:
        q += " AND (title LIKE ? OR description LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    if status_filter:
        q += " AND status = ?"
        params.append(status_filter.value)

    if due_from:
        q += " AND due_at >= ?"
        params.append(due_from.isoformat())

    if due_to:
        q += " AND due_at <= ?"
        params.append(due_to.isoformat())

    q += " ORDER BY COALESCE(due_at, created_at) ASC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    rows = execute_db(q, tuple(params), fetchall=True)

    out = []
    for r in rows:
        task_id = r["id"]
        counters = task_counters(task_id)
        out.append(
            TaskResponse(
                id=r["id"],
                user_id=r["user_id"],
                title=r["title"],
                description=r["description"],
                due_at=r["due_at"],
                status=TaskStatus(r["status"]),
                repeat_interval_minutes=r["repeat_interval_minutes"],
                created_at=r["created_at"],
                updated_at=r["updated_at"],
                tags=load_task_tags(task_id),
                **counters,
            )
        )
    return out


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: int, current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN))):
    row = execute_db("SELECT * FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(row["user_id"], current)

    counters = task_counters(task_id)
    return TaskResponse(
        id=row["id"],
        user_id=row["user_id"],
        title=row["title"],
        description=row["description"],
        due_at=row["due_at"],
        status=TaskStatus(row["status"]),
        repeat_interval_minutes=row["repeat_interval_minutes"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        tags=load_task_tags(task_id),
        **counters,
    )


@router.put("/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    data: TaskUpdate,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    row = execute_db("SELECT * FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(row["user_id"], current)

    updates = []
    params = []

    if data.title is not None:
        updates.append("title = ?")
        params.append(data.title.strip())
    if data.description is not None:
        updates.append("description = ?")
        params.append(data.description)
    if data.due_at is not None:
        updates.append("due_at = ?")
        params.append(data.due_at.isoformat())
    if data.status is not None:
        updates.append("status = ?")
        params.append(data.status.value)
    if data.repeat_interval_minutes is not None:
        updates.append("repeat_interval_minutes = ?")
        params.append(data.repeat_interval_minutes)

    if updates:
        params.append(task_id)
        execute_db(f"UPDATE Task SET {', '.join(updates)} WHERE id = ?", tuple(params))

    sync_task_tags(task_id, row["user_id"], data.tag_ids)

    updated = execute_db("SELECT * FROM Task WHERE id = ?", (task_id,), fetchone=True)
    counters = task_counters(task_id)
    return TaskResponse(
        id=updated["id"],
        user_id=updated["user_id"],
        title=updated["title"],
        description=updated["description"],
        due_at=updated["due_at"],
        status=TaskStatus(updated["status"]),
        repeat_interval_minutes=updated["repeat_interval_minutes"],
        created_at=updated["created_at"],
        updated_at=updated["updated_at"],
        tags=load_task_tags(task_id),
        **counters,
    )


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN))):
    row = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(row["user_id"], current)

    files = execute_db("SELECT storage_path FROM File WHERE task_id = ?", (task_id,), fetchall=True)
    for f in files:
        try:
            if os.path.exists(f["storage_path"]):
                os.remove(f["storage_path"])
        except Exception:
            pass

    execute_db("DELETE FROM Task WHERE id = ?", (task_id,))
    return {"message": "Task deleted"}


@router.post("/tasks/{task_id}/generate-next", response_model=TaskResponse)
def generate_next_occurrence(
    task_id: int,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    row = execute_db("SELECT * FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(row["user_id"], current)

    if not row["repeat_interval_minutes"]:
        raise HTTPException(status_code=400, detail="Task is not repeating (repeat_interval_minutes is null)")
    if not row["due_at"]:
        raise HTTPException(status_code=400, detail="Task has no due_at, cannot generate next occurrence")

    try:
        due = datetime.fromisoformat(row["due_at"])
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid due_at stored in DB")

    next_due = due + timedelta(minutes=int(row["repeat_interval_minutes"]))

    new_id = execute_db(
        """
        INSERT INTO Task (user_id, title, description, due_at, status, repeat_interval_minutes)
        VALUES (?, ?, ?, ?, ?, ?)
    """,
        (
            row["user_id"],
            row["title"],
            row["description"],
            next_due.isoformat(),
            TaskStatus.TODO.value,
            row["repeat_interval_minutes"],
        ),
    )

    tag_links = execute_db("SELECT tag_id FROM TaskTag WHERE task_id = ?", (task_id,), fetchall=True)
    for tl in tag_links:
        execute_db("INSERT OR IGNORE INTO TaskTag (task_id, tag_id) VALUES (?, ?)", (new_id, tl["tag_id"]))

    created = execute_db("SELECT * FROM Task WHERE id = ?", (new_id,), fetchone=True)
    counters = task_counters(new_id)
    return TaskResponse(
        id=created["id"],
        user_id=created["user_id"],
        title=created["title"],
        description=created["description"],
        due_at=created["due_at"],
        status=TaskStatus(created["status"]),
        repeat_interval_minutes=created["repeat_interval_minutes"],
        created_at=created["created_at"],
        updated_at=created["updated_at"],
        tags=load_task_tags(new_id),
        **counters,
    )


@router.post("/tasks/{task_id}/reminders", response_model=ReminderResponse)
def create_reminder(
    task_id: int,
    data: ReminderCreate,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    start_at = data.start_at.isoformat() if data.start_at else None
    end_at = data.end_at.isoformat() if data.end_at else None

    rid = execute_db(
        """
        INSERT INTO Reminder (task_id, user_id, every_minutes, start_at, end_at, is_enabled, next_run_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """,
        (
            task_id,
            task["user_id"],
            data.every_minutes,
            start_at,
            end_at,
            int(data.is_enabled),
            compute_next_run(start_at, data.every_minutes),
        ),
    )

    row = execute_db("SELECT * FROM Reminder WHERE id = ?", (rid,), fetchone=True)
    return ReminderResponse(**row)


@router.get("/tasks/{task_id}/reminders", response_model=List[ReminderResponse])
def list_reminders(
    task_id: int,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    rows = execute_db("SELECT * FROM Reminder WHERE task_id = ? ORDER BY created_at DESC", (task_id,), fetchall=True)
    return [ReminderResponse(**r) for r in rows]


@router.put("/tasks/{task_id}/reminders/{reminder_id}", response_model=ReminderResponse)
def update_reminder(
    task_id: int,
    reminder_id: int,
    data: ReminderUpdate,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    row = execute_db(
        "SELECT * FROM Reminder WHERE id = ? AND task_id = ?",
        (reminder_id, task_id),
        fetchone=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Reminder not found")

    updates = []
    params = []

    if data.every_minutes is not None:
        updates.append("every_minutes = ?")
        params.append(data.every_minutes)
    if data.start_at is not None:
        updates.append("start_at = ?")
        params.append(data.start_at.isoformat())
    if data.end_at is not None:
        updates.append("end_at = ?")
        params.append(data.end_at.isoformat())
    if data.is_enabled is not None:
        updates.append("is_enabled = ?")
        params.append(int(data.is_enabled))

    if updates:
        new_every = data.every_minutes if data.every_minutes is not None else row["every_minutes"]
        new_start = data.start_at.isoformat() if data.start_at is not None else row["start_at"]
        updates.append("next_run_at = ?")
        params.append(compute_next_run(new_start, int(new_every)))

        params.append(reminder_id)
        execute_db(f"UPDATE Reminder SET {', '.join(updates)} WHERE id = ?", tuple(params))

    out = execute_db("SELECT * FROM Reminder WHERE id = ?", (reminder_id,), fetchone=True)
    return ReminderResponse(**out)


@router.delete("/tasks/{task_id}/reminders/{reminder_id}")
def delete_reminder(
    task_id: int,
    reminder_id: int,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    row = execute_db(
        "SELECT id FROM Reminder WHERE id = ? AND task_id = ?",
        (reminder_id, task_id),
        fetchone=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Reminder not found")

    execute_db("DELETE FROM Reminder WHERE id = ?", (reminder_id,))
    return {"message": "Reminder deleted"}


@router.post("/tasks/nlu", response_model=NLUResult)
def nlu_stub(
    data: NLUInput,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    return NLUResult(
        intent="create_task_stub",
        extracted={
            "raw_text": data.text,
            "hint": "NLU not implemented yet. Map this text to TaskCreate on client side.",
        },
    )
