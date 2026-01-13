from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from app.deps import execute_db, require_roles
from app.models import *

router = APIRouter(tags=["tags"])


@router.post("/tags", response_model=TagResponse)
def create_tag(
    data: TagCreate,
    user_id: Optional[int] = None,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    target_user_id = current.id
    if user_id is not None:
        if current.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required for user_id")
        target_user_id = user_id

    try:
        tag_id = execute_db(
            "INSERT INTO Tag (user_id, name) VALUES (?, ?)",
            (target_user_id, data.name.strip()),
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Tag already exists")

    row = execute_db("SELECT id, name, user_id, created_at FROM Tag WHERE id = ?", (tag_id,), fetchone=True)
    return TagResponse(**row)


@router.get("/tags", response_model=List[TagResponse])
def list_tags(
    user_id: Optional[int] = None,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    target_user_id = current.id
    if user_id is not None:
        if current.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required for user_id")
        target_user_id = user_id

    rows = execute_db(
        "SELECT id, name, user_id, created_at FROM Tag WHERE user_id = ? ORDER BY name ASC",
        (target_user_id,),
        fetchall=True,
    )
    return [TagResponse(**r) for r in rows]


@router.put("/tags/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: int,
    data: TagUpdate,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    row = execute_db("SELECT id, user_id FROM Tag WHERE id = ?", (tag_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="Tag not found")
    if row["user_id"] != current.id and current.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")

    if data.name is not None:
        execute_db("UPDATE Tag SET name = ? WHERE id = ?", (data.name.strip(), tag_id))

    out = execute_db("SELECT id, name, user_id, created_at FROM Tag WHERE id = ?", (tag_id,), fetchone=True)
    return TagResponse(**out)


@router.delete("/tags/{tag_id}")
def delete_tag(
    tag_id: int,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    row = execute_db("SELECT id, user_id FROM Tag WHERE id = ?", (tag_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="Tag not found")
    if row["user_id"] != current.id and current.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")

    execute_db("DELETE FROM Tag WHERE id = ?", (tag_id,))
    return {"message": "Tag deleted"}
