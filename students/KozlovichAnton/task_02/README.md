# Баг-трекер «Не баг, а фича?» (Вариант 11)

Full-stack монорепозиторий: React + Vite (frontend) и Express + Prisma + PostgreSQL (backend).

## Требования

- Node.js 18+
- PostgreSQL доступный по `DATABASE_URL`

## Структура

- apps/backend — API, JWT (access+refresh), Prisma, PostgreSQL
- apps/frontend — SPA на React + TypeScript + react-router

## Быстрый запуск всего проекта

1. В корне: `npm install`
2. Настройте окружения:
   - [apps/backend/.env.example](apps/backend/.env.example) → `.env` (DATABASE_URL, CORS_ORIGIN, JWT_*). Для быстрой проверки ротации можно временно установить `JWT_ACCESS_TTL=15s`.
   - [apps/frontend/.env.example](apps/frontend/.env.example) → `.env` (VITE_API_URL — URL backend, например <http://localhost:4000>)

3. Миграции: `npm run prisma:migrate:dev -w backend -- --name init`
4. Seed: `npm run prisma:seed -w backend`
5. Запуск обоих сервисов одной командой: `npm run dev`

- Backend: <http://localhost:4000/health>
- Frontend: <http://localhost:5173>

## Как проверить работоспособность (ручной сценарий)

1. Открыть фронтенд → Register (создать пользователя) или использовать seed-пользователей из backend README.
2. Login → в шапке видно текущего пользователя.
3. Проверка ротации access:

   - Установите в backend `.env` `JWT_ACCESS_TTL=15s`, перезапустите backend.
   - Подождите 15–20 секунд, выполните действие (например, обновить список проектов). Клиент получит 401, сделает `POST /auth/refresh` с cookie, повторит запрос и останется авторизован.
   - После Logout refresh cookie очищается; повторный `/auth/refresh` вернёт 401, клиент разлогинится.

4. Основной сценарий: создать проект (admin), открыть проект, создать баг, сменить статус, добавить комментарий/вложение.

## Дополнительно

- Детали по API, ролям и seed — в [apps/backend/README.md](apps/backend/README.md)
- Детали по SPA, страницам и ролям UI — в [apps/frontend/README.md](apps/frontend/README.md)
