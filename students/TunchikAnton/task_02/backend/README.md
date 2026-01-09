# Backend — FastAPI

## Запуск

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

Swagger: http://localhost:8000/docs

## Основные эндпоинты (MVP)

- Auth: `POST /register`, `POST /login`, `GET /profile`
- Users (admin): `GET /users`, `GET /users/{id}`, `PUT /users/{id}`, `DELETE /users/{id}`
- Tasks: `POST /tasks`, `GET /tasks`, `GET/PUT/DELETE /tasks/{id}`, `POST /tasks/{id}/generate-next`
- Subtasks: `POST /subtasks`, `GET /subtasks?task_id=...`, `PUT/DELETE /subtasks/{id}`
- Tags: `POST /tags`, `GET /tags`, `PUT/DELETE /tags/{id}`
- Files: `POST /files?task_id=...`, `GET /files?task_id=...`, `GET /files/{id}/download`, `DELETE /files/{id}`
- Reminders: `POST/GET /tasks/{task_id}/reminders`, `PUT/DELETE /tasks/{task_id}/reminders/{id}`
- Calendar: `GET /calendar?date_from=...&date_to=...`
