from fastapi import (
    FastAPI, HTTPException, Depends, status,
    UploadFile, File as UploadFileType, Query
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse as StarletteFileResponse
from contextlib import asynccontextmanager
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import os
import uuid
import logging
import time
import json

from starlette.responses import Response
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

from sqliteDB import get_db, init_db
from models import *
from utilities import hash_password, verify_password, create_access_token, verify_token

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("ne_zabudu_api")

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(seed=True)
    yield

app = FastAPI(title="Список дел", version="1.0.0", lifespan=lifespan)

# CORS (MVP)
cors_origins_env = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost,http://127.0.0.1",
)
cors_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# Basic metrics (Prometheus) + structured request logs
HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total HTTP requests",
    labelnames=("method", "path", "status"),
)
HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    labelnames=("method", "path"),
)

# Helmet-like security headers + basic caching
@app.middleware("http")
async def security_headers(request, call_next):
    start = time.perf_counter()
    status_code = 500
    path = request.url.path
    method = request.method
    try:
        resp = await call_next(request)
        status_code = resp.status_code

        # security headers
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        resp.headers["Cache-Control"] = "no-store"
        return resp
    finally:
        duration = time.perf_counter() - start
        try:
            HTTP_REQUESTS_TOTAL.labels(method=method, path=path, status=str(status_code)).inc()
            HTTP_REQUEST_DURATION_SECONDS.labels(method=method, path=path).observe(duration)
        except Exception:
            # never break the app due to metrics
            pass

        try:
            logger.info(
                json.dumps(
                    {
                        "event": "http_request",
                        "method": method,
                        "path": path,
                        "status": status_code,
                        "duration_ms": round(duration * 1000, 2),
                        "client": request.client.host if request.client else None,
                    },
                    ensure_ascii=False,
                )
            )
        except Exception:
            pass


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

security = HTTPBearer()

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
        fetchone=True
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

async def get_current_admin(current: UserResponse = Depends(get_current_user)) -> UserResponse:
    if current.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current

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
    """
    next_run_at для Reminder: если start_at задан — от него, иначе от сейчас.
    """
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
    rows = execute_db("""
        SELECT t.id, t.name, t.user_id, t.created_at
        FROM Tag t
        JOIN TaskTag tt ON tt.tag_id = t.id
        WHERE tt.task_id = ?
        ORDER BY t.name ASC
    """, (task_id,), fetchall=True)
    return [TagResponse(**r) for r in rows]

def task_counters(task_id: int) -> dict:
    s = execute_db("SELECT COUNT(*) as c FROM SubTask WHERE task_id = ?", (task_id,), fetchone=True)["c"]
    f = execute_db("SELECT COUNT(*) as c FROM File WHERE task_id = ?", (task_id,), fetchone=True)["c"]
    r = execute_db("SELECT COUNT(*) as c FROM Reminder WHERE task_id = ?", (task_id,), fetchone=True)["c"]
    return {"subtasks_count": s, "files_count": f, "reminders_count": r}

def sync_task_tags(task_id: int, current_user_id: int, tag_ids: Optional[List[int]]):
    # tag_ids=None => не трогаем; tag_ids=[] => очистить
    if tag_ids is None:
        return

    # Проверяем, что теги принадлежат пользователю (или админ может привязать любые? лучше: только владельца задачи)
    if tag_ids:
        existing = execute_db(
            f"SELECT id FROM Tag WHERE user_id = ? AND id IN ({','.join(['?']*len(tag_ids))})",
            (current_user_id, *tag_ids),
            fetchall=True
        )
        ok_ids = {r["id"] for r in existing}
        bad = [tid for tid in tag_ids if tid not in ok_ids]
        if bad:
            raise HTTPException(status_code=400, detail=f"Unknown tag_ids for this user: {bad}")

    execute_db("DELETE FROM TaskTag WHERE task_id = ?", (task_id,))
    if tag_ids:
        for tid in tag_ids:
            execute_db("INSERT OR IGNORE INTO TaskTag (task_id, tag_id) VALUES (?, ?)", (task_id, tid))

@app.get("/health")
def health():
    return {"status": "ok"}

# ---------------- Auth ----------------

@app.post("/register", response_model=AuthResponse)
def register(user: UserCreate):
    if execute_db("SELECT id FROM User WHERE email = ?", (user.email,), fetchone=True):
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = execute_db(
        "INSERT INTO User (email, name, password, role) VALUES (?, ?, ?, ?)",
        (user.email, user.name, hash_password(user.password), user.role.value)
    )

    row = execute_db(
        "SELECT id, email, name, role, created_at FROM User WHERE id = ?",
        (user_id,),
        fetchone=True
    )

    token = create_access_token({"sub": row["email"], "user_id": row["id"], "role": row["role"]})
    return AuthResponse(
        token=token,
        user_data=UserResponse(id=row["id"], email=row["email"], name=row["name"], role=UserRole(row["role"]), created_at=row["created_at"])
    )

@app.post("/login", response_model=AuthResponse)
def login(data: LoginRequest):
    row = execute_db("SELECT id, email, password, role FROM User WHERE email = ?", (data.email,), fetchone=True)
    if not row:
        raise HTTPException(status_code=400, detail="User not found")
    if not verify_password(data.password, row["password"]):
        raise HTTPException(status_code=400, detail="Invalid password")

    user_row = execute_db("SELECT id, email, name, role, created_at FROM User WHERE id = ?", (row["id"],), fetchone=True)
    token = create_access_token({"sub": user_row["email"], "user_id": user_row["id"], "role": user_row["role"]})
    return AuthResponse(
        token=token,
        user_data=UserResponse(id=user_row["id"], email=user_row["email"], name=user_row["name"], role=UserRole(user_row["role"]), created_at=user_row["created_at"])
    )

@app.get("/profile", response_model=UserResponse)
def profile(current: UserResponse = Depends(get_current_user)):
    return current

# ---------------- Admin: Users (/users) ----------------

@app.get("/users", response_model=List[UserResponse])
def list_users(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
    current: UserResponse = Depends(get_current_admin),
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


@app.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: int, current: UserResponse = Depends(get_current_admin)):
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


@app.put("/users/{user_id}", response_model=UserResponse)
def update_user(user_id: int, data: UserUpdate, current: UserResponse = Depends(get_current_admin)):
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


@app.delete("/users/{user_id}")
def delete_user(user_id: int, current: UserResponse = Depends(get_current_admin)):
    row = execute_db("SELECT id FROM User WHERE id = ?", (user_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    execute_db("DELETE FROM User WHERE id = ?", (user_id,))
    return {"message": "User deleted"}

# ---------------- Tags (/tags) ----------------

@app.post("/tags", response_model=TagResponse)
def create_tag(
    data: TagCreate,
    user_id: Optional[int] = None,  # admin can create tag for selected user
    current: UserResponse = Depends(get_current_user),
):
    target_user_id = current.id
    if user_id is not None:
        if current.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required for user_id")
        target_user_id = user_id

    try:
        tag_id = execute_db(
            "INSERT INTO Tag (user_id, name) VALUES (?, ?)",
            (target_user_id, data.name.strip())
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Tag already exists")

    row = execute_db("SELECT id, name, user_id, created_at FROM Tag WHERE id = ?", (tag_id,), fetchone=True)
    return TagResponse(**row)

@app.get("/tags", response_model=List[TagResponse])
def list_tags(
    user_id: Optional[int] = None,
    current: UserResponse = Depends(get_current_user),
):
    target_user_id = current.id
    if user_id is not None:
        if current.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required for user_id")
        target_user_id = user_id
    rows = execute_db(
        "SELECT id, name, user_id, created_at FROM Tag WHERE user_id = ? ORDER BY name ASC",
        (target_user_id,),
        fetchall=True
    )
    return [TagResponse(**r) for r in rows]

@app.put("/tags/{tag_id}", response_model=TagResponse)
def update_tag(tag_id: int, data: TagUpdate, current: UserResponse = Depends(get_current_user)):
    row = execute_db("SELECT id, user_id FROM Tag WHERE id = ?", (tag_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="Tag not found")
    if row["user_id"] != current.id and current.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")

    if data.name is not None:
        execute_db("UPDATE Tag SET name = ? WHERE id = ?", (data.name.strip(), tag_id))

    out = execute_db("SELECT id, name, user_id, created_at FROM Tag WHERE id = ?", (tag_id,), fetchone=True)
    return TagResponse(**out)

@app.delete("/tags/{tag_id}")
def delete_tag(tag_id: int, current: UserResponse = Depends(get_current_user)):
    row = execute_db("SELECT id, user_id FROM Tag WHERE id = ?", (tag_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="Tag not found")
    if row["user_id"] != current.id and current.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")

    execute_db("DELETE FROM Tag WHERE id = ?", (tag_id,))
    return {"message": "Tag deleted"}

# ---------------- Tasks (/tasks) ----------------

@app.post("/tasks", response_model=TaskResponse)
def create_task(
    data: TaskCreate,
    user_id: Optional[int] = None,  # admin can create a task for selected user
    current: UserResponse = Depends(get_current_user),
):
    target_user_id = current.id
    if user_id is not None:
        if current.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required for user_id")
        # validate target user exists
        if not execute_db("SELECT id FROM User WHERE id = ?", (user_id,), fetchone=True):
            raise HTTPException(status_code=404, detail="Target user not found")
        target_user_id = user_id

    task_id = execute_db("""
        INSERT INTO Task (user_id, title, description, due_at, status, repeat_interval_minutes)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        target_user_id,
        data.title.strip(),
        data.description,
        data.due_at.isoformat() if data.due_at else None,
        data.status.value,
        data.repeat_interval_minutes
    ))

    sync_task_tags(task_id, target_user_id, data.tag_ids)

    # Создание подзадач вместе с задачей (UX: "создать задачу сразу с подзадачами")
    if getattr(data, "subtasks", None):
        subtasks = [st for st in (data.subtasks or []) if st and st.title and st.title.strip()]
        # мягкий лимит, чтобы не уронить БД огромным запросом
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
        **counters
    )

@app.get("/tasks", response_model=List[TaskResponse])
def list_tasks(
    search: Optional[str] = None,
    status_filter: Optional[TaskStatus] = None,
    due_from: Optional[datetime] = None,
    due_to: Optional[datetime] = None,
    user_id: Optional[int] = None,  # для админа
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current: UserResponse = Depends(get_current_user)
):
    limit, offset = normalize_pagination(limit, offset)

    # user_id фильтр доступен только админу
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
        out.append(TaskResponse(
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
            **counters
        ))
    return out

@app.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: int, current: UserResponse = Depends(get_current_user)):
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
        **counters
    )

@app.put("/tasks/{task_id}", response_model=TaskResponse)
def update_task(task_id: int, data: TaskUpdate, current: UserResponse = Depends(get_current_user)):
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

    # tags
    # IMPORTANT: теги принадлежат владельцу задачи (row["user_id"]), а не админу
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
        **counters
    )

@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, current: UserResponse = Depends(get_current_user)):
    row = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(row["user_id"], current)

    # удаляем файлы с диска
    files = execute_db("SELECT storage_path FROM File WHERE task_id = ?", (task_id,), fetchall=True)
    for f in files:
        try:
            if os.path.exists(f["storage_path"]):
                os.remove(f["storage_path"])
        except Exception:
            logger.warning(f"Could not delete file: {f}")

    execute_db("DELETE FROM Task WHERE id = ?", (task_id,))
    return {"message": "Task deleted"}

# ---- MVP: “повторение задачи” как действие (создать следующую копию) ----
@app.post("/tasks/{task_id}/generate-next", response_model=TaskResponse)
def generate_next_occurrence(task_id: int, current: UserResponse = Depends(get_current_user)):
    """
    MVP-логика:
    - если у задачи есть repeat_interval_minutes и due_at, создаём новую задачу
      с due_at + interval, status=todo
    - это не планировщик, а ручная генерация (для приёмки “повторяющихся задач” достаточно).
    """
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

    new_id = execute_db("""
        INSERT INTO Task (user_id, title, description, due_at, status, repeat_interval_minutes)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        row["user_id"],
        row["title"],
        row["description"],
        next_due.isoformat(),
        TaskStatus.TODO.value,
        row["repeat_interval_minutes"]
    ))

    # копируем теги
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
        **counters
    )

# ---------------- SubTasks (/subtasks) ----------------

@app.post("/subtasks", response_model=SubTaskResponse)
def create_subtask(data: SubTaskCreate, current: UserResponse = Depends(get_current_user)):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (data.task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    sid = execute_db(
        "INSERT INTO SubTask (task_id, user_id, title, is_done) VALUES (?, ?, ?, ?)",
        (data.task_id, task["user_id"], data.title.strip(), int(data.is_done))
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

@app.get("/subtasks", response_model=List[SubTaskResponse])
def list_subtasks(task_id: int, current: UserResponse = Depends(get_current_user)):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    rows = execute_db("SELECT * FROM SubTask WHERE task_id = ? ORDER BY created_at ASC", (task_id,), fetchall=True)
    return [
        SubTaskResponse(
            id=r["id"], task_id=r["task_id"], user_id=r["user_id"],
            title=r["title"], is_done=bool(r["is_done"]),
            created_at=r["created_at"], updated_at=r["updated_at"]
        )
        for r in rows
    ]

@app.put("/subtasks/{subtask_id}", response_model=SubTaskResponse)
def update_subtask(subtask_id: int, data: SubTaskUpdate, current: UserResponse = Depends(get_current_user)):
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

@app.delete("/subtasks/{subtask_id}")
def delete_subtask(subtask_id: int, current: UserResponse = Depends(get_current_user)):
    row = execute_db("SELECT * FROM SubTask WHERE id = ?", (subtask_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="Subtask not found")

    task = execute_db("SELECT user_id FROM Task WHERE id = ?", (row["task_id"],), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    execute_db("DELETE FROM SubTask WHERE id = ?", (subtask_id,))
    return {"message": "Subtask deleted"}

# ---------------- Calendar (/calendar) ----------------

@app.get("/calendar", response_model=List[CalendarItem])
def calendar_view(
    date_from: datetime,
    date_to: datetime,
    user_id: Optional[int] = None,
    current: UserResponse = Depends(get_current_user)
):
    """
    Календарь = задачи с due_at в диапазоне.
    Админ может смотреть любой user_id.
    """
    target_user_id = current.id
    if user_id is not None:
        if current.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required for user_id")
        target_user_id = user_id

    rows = execute_db("""
        SELECT id as task_id, title, due_at, status, user_id
        FROM Task
        WHERE user_id = ?
          AND due_at IS NOT NULL
          AND due_at >= ?
          AND due_at <= ?
        ORDER BY due_at ASC
    """, (target_user_id, date_from.isoformat(), date_to.isoformat()), fetchall=True)

    out = []
    for r in rows:
        out.append(CalendarItem(
            task_id=r["task_id"],
            title=r["title"],
            due_at=datetime.fromisoformat(r["due_at"]),
            status=TaskStatus(r["status"]),
            user_id=r["user_id"]
        ))
    return out

# ---------------- Files (/files) ----------------

@app.post("/files", response_model=FileResponse)
def upload_file(
    task_id: int,
    file: UploadFile = UploadFileType(...),
    current: UserResponse = Depends(get_current_user)
):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    # Сохраняем на диск
    safe_name = file.filename or "file"
    file_id = str(uuid.uuid4())
    storage_path = os.path.join(UPLOAD_DIR, f"{file_id}__{safe_name}")

    content = file.file.read()
    size = len(content)
    if size == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if size > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 25MB)")

    with open(storage_path, "wb") as f:
        f.write(content)

    fid = execute_db("""
        INSERT INTO File (task_id, user_id, filename, content_type, size_bytes, storage_path)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (task_id, task["user_id"], safe_name, file.content_type, size, storage_path))

    row = execute_db("SELECT * FROM File WHERE id = ?", (fid,), fetchone=True)
    return FileResponse(**row)

@app.get("/files", response_model=List[FileResponse])
def list_files(task_id: int, current: UserResponse = Depends(get_current_user)):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    rows = execute_db("SELECT * FROM File WHERE task_id = ? ORDER BY created_at DESC", (task_id,), fetchall=True)
    return [FileResponse(**r) for r in rows]

@app.get("/files/{file_id}/download")
def download_file(file_id: int, current: UserResponse = Depends(get_current_user)):
    row = execute_db("SELECT * FROM File WHERE id = ?", (file_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    # проверим доступ по задаче
    task = execute_db("SELECT user_id FROM Task WHERE id = ?", (row["task_id"],), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    if not os.path.exists(row["storage_path"]):
        raise HTTPException(status_code=404, detail="File missing on disk")

    return StarletteFileResponse(
        path=row["storage_path"],
        filename=row["filename"],
        media_type=row.get("content_type") or "application/octet-stream"
    )

@app.delete("/files/{file_id}")
def delete_file(file_id: int, current: UserResponse = Depends(get_current_user)):
    row = execute_db("SELECT * FROM File WHERE id = ?", (file_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    task = execute_db("SELECT user_id FROM Task WHERE id = ?", (row["task_id"],), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    # удалим с диска
    try:
        if os.path.exists(row["storage_path"]):
            os.remove(row["storage_path"])
    except Exception:
        logger.warning("Could not delete file from disk")

    execute_db("DELETE FROM File WHERE id = ?", (file_id,))
    return {"message": "File deleted"}

# ---------------- Reminders (в рамках /tasks, но сущность Reminder есть) ----------------

@app.post("/tasks/{task_id}/reminders", response_model=ReminderResponse)
def create_reminder(task_id: int, data: ReminderCreate, current: UserResponse = Depends(get_current_user)):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    start_at = data.start_at.isoformat() if data.start_at else None
    end_at = data.end_at.isoformat() if data.end_at else None

    rid = execute_db("""
        INSERT INTO Reminder (task_id, user_id, every_minutes, start_at, end_at, is_enabled, next_run_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        task_id, task["user_id"], data.every_minutes,
        start_at, end_at, int(data.is_enabled),
        compute_next_run(start_at, data.every_minutes)
    ))

    row = execute_db("SELECT * FROM Reminder WHERE id = ?", (rid,), fetchone=True)
    return ReminderResponse(**row)

@app.get("/tasks/{task_id}/reminders", response_model=List[ReminderResponse])
def list_reminders(task_id: int, current: UserResponse = Depends(get_current_user)):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    rows = execute_db("SELECT * FROM Reminder WHERE task_id = ? ORDER BY created_at DESC", (task_id,), fetchall=True)
    return [ReminderResponse(**r) for r in rows]

@app.put("/tasks/{task_id}/reminders/{reminder_id}", response_model=ReminderResponse)
def update_reminder(task_id: int, reminder_id: int, data: ReminderUpdate, current: UserResponse = Depends(get_current_user)):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    row = execute_db("SELECT * FROM Reminder WHERE id = ? AND task_id = ?", (reminder_id, task_id), fetchone=True)
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
        # пересчёт next_run_at если меняли интервал/старт
        new_every = data.every_minutes if data.every_minutes is not None else row["every_minutes"]
        new_start = (data.start_at.isoformat() if data.start_at is not None else row["start_at"])
        updates.append("next_run_at = ?")
        params.append(compute_next_run(new_start, int(new_every)))

        params.append(reminder_id)
        execute_db(f"UPDATE Reminder SET {', '.join(updates)} WHERE id = ?", tuple(params))

    out = execute_db("SELECT * FROM Reminder WHERE id = ?", (reminder_id,), fetchone=True)
    return ReminderResponse(**out)

@app.delete("/tasks/{task_id}/reminders/{reminder_id}")
def delete_reminder(task_id: int, reminder_id: int, current: UserResponse = Depends(get_current_user)):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    row = execute_db("SELECT id FROM Reminder WHERE id = ? AND task_id = ?", (reminder_id, task_id), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="Reminder not found")

    execute_db("DELETE FROM Reminder WHERE id = ?", (reminder_id,))
    return {"message": "Reminder deleted"}

# ---------------- Bonus: NLU stub ----------------

@app.post("/tasks/nlu", response_model=NLUResult)
def nlu_stub(data: NLUInput, current: UserResponse = Depends(get_current_user)):
    # Заглушка: в будущем тут будет извлечение title/due_at/tags из текста
    return NLUResult(
        intent="create_task_stub",
        extracted={
            "raw_text": data.text,
            "hint": "NLU not implemented yet. Map this text to TaskCreate on client side."
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
