# «Список дел» — задачи + календарь (MVP)

Проект состоит из двух частей:

- `backend/` — FastAPI + SQLite (JWT auth, роли user/admin, задачи, подзадачи, теги, файлы, напоминания, календарь, повторяющиеся задачи)
- `frontend/` — React + Vite (клиент под готовый API)

## Быстрый старт (локально)

### Самый простой способ

Можно запустить всё одной командой:

```bash
docker compose up --build
```

Frontend: http://localhost:5173

Backend (Swagger): http://localhost:8000/docs

### 1 Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
source .venv/bin/activate
pip install -r requirements.txt
# .env не обязателен (по умолчанию всё работает и без него)
uvicorn main:app --reload --port 8000
```

Swagger: http://localhost:8000/docs

### 2 Frontend

```bash
cd frontend
npm install
# .env не обязателен (по умолчанию API = http://localhost:8000)
npm run dev
```

Открой: http://localhost:5173

## Роли

- При регистрации можно выбрать роль `user` или `admin`.
- `user` видит/редактирует только свои данные.
- `admin` может просматривать/редактировать данные любого пользователя (в UI — вкладка Admin).

## Повторяющиеся задачи (приёмка MVP)

У задачи есть поле `repeat_interval_minutes`.

- Установи `repeat_interval_minutes` и `due_at`.
- В UI (страница задачи) нажми **Generate next** или вызови API:

`POST /tasks/{task_id}/generate-next`

Будет создана новая задача-копия с `due_at + repeat_interval_minutes`.
