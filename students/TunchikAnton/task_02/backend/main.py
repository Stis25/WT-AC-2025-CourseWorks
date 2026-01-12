from contextlib import asynccontextmanager
import json
import logging
import os
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Counter, Histogram

from sqliteDB import init_db

from routers.auth import router as auth_router
from routers.calendar import router as calendar_router
from routers.files import router as files_router
from routers.subtasks import router as subtasks_router
from routers.system import router as system_router
from routers.tags import router as tags_router
from routers.tasks import router as tasks_router
from routers.users import router as users_router

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("ne_zabudu_api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(seed=True)
    yield


app = FastAPI(title="Список дел", version="1.0.0", lifespan=lifespan)

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


@app.middleware("http")
async def security_headers(request, call_next):
    start = time.perf_counter()
    status_code = 500
    path = request.url.path
    method = request.method
    try:
        resp = await call_next(request)
        status_code = resp.status_code

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


app.include_router(system_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(tags_router)
app.include_router(tasks_router)
app.include_router(subtasks_router)
app.include_router(calendar_router)
app.include_router(files_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
