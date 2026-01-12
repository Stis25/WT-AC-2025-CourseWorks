from typing import List

from fastapi import APIRouter, Depends, HTTPException

from deps import ensure_task_access, execute_db, require_roles
from models import *

router = APIRouter(tags=["subtasks"])


@router.post("/subtasks", response_model=SubTaskResponse)
def create_subtask(
    data: SubTaskCreate,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (data.task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    sid = execute_db(
        "INSERT INTO SubTask (task_id, user_id, title, is_done) VALUES (?, ?, ?, ?)",
        (data.task_id, task["user_id"], data.title.strip(), int(data.is_done)),
    )
    row = execute_db("SELECT * FROM SubTask WHERE id = ?", (sid,), fetchone=True)
    return SubTaskResponse(
        id=row["id"],
        task_id=row["task_id"],
        user_id=row["user_id"],
        title=row["title"],
        is_done=bool(row["is_done"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("/subtasks", response_model=List[SubTaskResponse])
def list_subtasks(
    task_id: int,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    rows = execute_db("SELECT * FROM SubTask WHERE task_id = ? ORDER BY created_at ASC", (task_id,), fetchall=True)
    return [
        SubTaskResponse(
            id=r["id"],
            task_id=r["task_id"],
            user_id=r["user_id"],
            title=r["title"],
            is_done=bool(r["is_done"]),
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )
        for r in rows
    ]


@router.put("/subtasks/{subtask_id}", response_model=SubTaskResponse)
def update_subtask(
    subtask_id: int,
    data: SubTaskUpdate,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    row = execute_db("SELECT * FROM SubTask WHERE id = ?", (subtask_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="Subtask not found")

    task = execute_db("SELECT user_id FROM Task WHERE id = ?", (row["task_id"],), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    updates = []
    params = []
    if data.title is not None:
        updates.append("title = ?")
        params.append(data.title.strip())
    if data.is_done is not None:
        updates.append("is_done = ?")
        params.append(int(data.is_done))

    if updates:
        params.append(subtask_id)
        execute_db(f"UPDATE SubTask SET {', '.join(updates)} WHERE id = ?", tuple(params))

    updated = execute_db("SELECT * FROM SubTask WHERE id = ?", (subtask_id,), fetchone=True)
    return SubTaskResponse(
        id=updated["id"],
        task_id=updated["task_id"],
        user_id=updated["user_id"],
        title=updated["title"],
        is_done=bool(updated["is_done"]),
        created_at=updated["created_at"],
        updated_at=updated["updated_at"],
    )


@router.delete("/subtasks/{subtask_id}")
def delete_subtask(
    subtask_id: int,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    row = execute_db("SELECT * FROM SubTask WHERE id = ?", (subtask_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="Subtask not found")

    task = execute_db("SELECT user_id FROM Task WHERE id = ?", (row["task_id"],), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    execute_db("DELETE FROM SubTask WHERE id = ?", (subtask_id,))
    return {"message": "Subtask deleted"}
