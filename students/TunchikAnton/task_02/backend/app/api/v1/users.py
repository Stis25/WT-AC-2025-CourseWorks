from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import execute_db, normalize_pagination, require_roles
from app.models import *

router = APIRouter(tags=["users"])


@router.get("/users", response_model=List[UserResponse])
def list_users(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    current: UserResponse = Depends(require_roles(UserRole.ADMIN)),
):
    limit, offset = normalize_pagination(limit, offset)
    q = "SELECT id, email, name, role, created_at FROM User"
    params: list = []
    if search:
        q += " WHERE email LIKE ? OR name LIKE ?"
        params.extend([f"%{search}%", f"%{search}%"])
    q += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    rows = execute_db(q, tuple(params), fetchall=True)
    return [
        UserResponse(
            id=r["id"],
            email=r["email"],
            name=r["name"],
            role=UserRole(r["role"]),
            created_at=r.get("created_at"),
        )
        for r in rows
    ]


@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: int, current: UserResponse = Depends(require_roles(UserRole.ADMIN))):
    row = execute_db(
        "SELECT id, email, name, role, created_at FROM User WHERE id = ?",
        (user_id,),
        fetchone=True,
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        role=UserRole(row["role"]),
        created_at=row.get("created_at"),
    )


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UserUpdate,
    current: UserResponse = Depends(require_roles(UserRole.ADMIN)),
):
    row = execute_db("SELECT id, email, name, role, created_at FROM User WHERE id = ?", (user_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    updates = []
    params = []
    if data.name is not None:
        updates.append("name = ?")
        params.append(data.name.strip())
    if data.role is not None:
        updates.append("role = ?")
        params.append(data.role.value)

    if updates:
        params.append(user_id)
        execute_db(f"UPDATE User SET {', '.join(updates)} WHERE id = ?", tuple(params))

    out = execute_db("SELECT id, email, name, role, created_at FROM User WHERE id = ?", (user_id,), fetchone=True)
    return UserResponse(
        id=out["id"],
        email=out["email"],
        name=out["name"],
        role=UserRole(out["role"]),
        created_at=out.get("created_at"),
    )


@router.delete("/users/{user_id}")
def delete_user(user_id: int, current: UserResponse = Depends(require_roles(UserRole.ADMIN))):
    row = execute_db("SELECT id FROM User WHERE id = ?", (user_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    execute_db("DELETE FROM User WHERE id = ?", (user_id,))
    return {"message": "User deleted"}
