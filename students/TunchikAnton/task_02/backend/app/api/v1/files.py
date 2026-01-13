import os
import uuid
from typing import List

from fastapi import APIRouter, Depends, File as UploadFileType, HTTPException, UploadFile
from fastapi.responses import FileResponse as StarletteFileResponse

from app.deps import ensure_task_access, execute_db, require_roles
from app.models import *

router = APIRouter(tags=["files"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/files", response_model=FileResponse)
def upload_file(
    task_id: int,
    file: UploadFile = UploadFileType(...),
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

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

    fid = execute_db(
        """
        INSERT INTO File (task_id, user_id, filename, content_type, size_bytes, storage_path)
        VALUES (?, ?, ?, ?, ?, ?)
    """,
        (task_id, task["user_id"], safe_name, file.content_type, size, storage_path),
    )

    row = execute_db("SELECT * FROM File WHERE id = ?", (fid,), fetchone=True)
    return FileResponse(**row)


@router.get("/files", response_model=List[FileResponse])
def list_files(
    task_id: int,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    task = execute_db("SELECT id, user_id FROM Task WHERE id = ?", (task_id,), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    rows = execute_db("SELECT * FROM File WHERE task_id = ? ORDER BY created_at DESC", (task_id,), fetchall=True)
    return [FileResponse(**r) for r in rows]


@router.get("/files/{file_id}/download")
def download_file(
    file_id: int,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    row = execute_db("SELECT * FROM File WHERE id = ?", (file_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    task = execute_db("SELECT user_id FROM Task WHERE id = ?", (row["task_id"],), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    if not os.path.exists(row["storage_path"]):
        raise HTTPException(status_code=404, detail="File missing on disk")

    return StarletteFileResponse(
        path=row["storage_path"],
        filename=row["filename"],
        media_type=row.get("content_type") or "application/octet-stream",
    )


@router.delete("/files/{file_id}")
def delete_file(
    file_id: int,
    current: UserResponse = Depends(require_roles(UserRole.USER, UserRole.ADMIN)),
):
    row = execute_db("SELECT * FROM File WHERE id = ?", (file_id,), fetchone=True)
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    task = execute_db("SELECT user_id FROM Task WHERE id = ?", (row["task_id"],), fetchone=True)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_task_access(task["user_id"], current)

    try:
        if os.path.exists(row["storage_path"]):
            os.remove(row["storage_path"])
    except Exception:
        pass

    execute_db("DELETE FROM File WHERE id = ?", (file_id,))
    return {"message": "File deleted"}
