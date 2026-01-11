from fastapi import APIRouter, Depends, HTTPException

from deps import execute_db, require_roles
from models import *
from utilities import create_access_token, hash_password, verify_password

router = APIRouter(tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(user: UserCreate):
    if execute_db("SELECT id FROM User WHERE email = ?", (user.email,), fetchone=True):
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = execute_db(
        "INSERT INTO User (email, name, password, role) VALUES (?, ?, ?, ?)",
        (user.email, user.name, hash_password(user.password), user.role.value),
    )

    row = execute_db(
        "SELECT id, email, name, role, created_at FROM User WHERE id = ?",
        (user_id,),
        fetchone=True,
    )

    token = create_access_token({"sub": row["email"], "user_id": row["id"], "role": row["role"]})
    return AuthResponse(
        token=token,
        user_data=UserResponse(
            id=row["id"],
            email=row["email"],
            name=row["name"],
            role=UserRole(row["role"]),
            created_at=row["created_at"],
        ),
    )


@router.post("/login", response_model=AuthResponse)
def login(data: LoginRequest):
    row = execute_db(
        "SELECT id, email, password, role FROM User WHERE email = ?",
        (data.email,),
        fetchone=True,
    )
    if not row:
        raise HTTPException(status_code=400, detail="User not found")
    if not verify_password(data.password, row["password"]):
        raise HTTPException(status_code=400, detail="Invalid password")

    user_row = execute_db(
        "SELECT id, email, name, role, created_at FROM User WHERE id = ?",
        (row["id"],),
        fetchone=True,
    )
    token = create_access_token({"sub": user_row["email"], "user_id": user_row["id"], "role": user_row["role"]})
    return AuthResponse(
        token=token,
        user_data=UserResponse(
            id=user_row["id"],
            email=user_row["email"],
            name=user_row["name"],
            role=UserRole(user_row["role"]),
            created_at=user_row["created_at"],
        ),
    )


@router.get("/profile", response_model=UserResponse)
def profile(current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN))):
    return current
