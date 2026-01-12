# Backend (Bug Tracker)

## Что реализовано

- Модели: User, Project, ProjectMember, Bug, Attachment, Comment, RefreshToken
- JWT: access + refresh (rotation, reuse-detection, HttpOnly cookie)
- Роли: admin (глобальная), проектные owner/manager/developer/viewer
- CRUD по проектам, багам, участникам, комментариям, вложениям с матрицей прав

## Требования и окружение

- Node.js 18+
- PostgreSQL (`DATABASE_URL`)
- `.env` на основе `.env.example`:
  - `CORS_ORIGIN` (точный origin фронтенда, CORS работает с `credentials: true`)
  - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
  - `JWT_ACCESS_TTL` (по умолчанию 15m; для проверки ротации можно выставить 15s), `JWT_REFRESH_TTL`
  - `REFRESH_TOKEN_COOKIE_DOMAIN` при необходимости

## Установка и БД

1) `npm install` (из корня)
2) Миграции: `npm run prisma:migrate:dev -w backend -- --name init`
3) Seed: `npm run prisma:seed -w backend` (очистит таблицы и зальёт тестовые данные)
4) Prisma Studio: `npm run prisma:studio -w backend`

## Запуск

- Dev отдельно: `npm run dev:backend`
- Prod build: `npm run build:backend` → `npm run start:backend`

## Логирование запросов к БД (Prisma)

В режиме `npm run dev` (NODE_ENV=development) backend печатает в консоль все SQL-запросы Prisma (время выполнения, target, SQL и параметры).

Управление:

- `PRISMA_LOG_QUERIES=true|false` — принудительно включить/выключить вывод.

## Эндпоинты (основные)

- Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- Users: `GET /users/me`, admin CRUD `GET/POST/GET/:id/PUT/:id/DELETE/:id /users`
- Projects: `/projects`, `/projects/:id`, `/projects/:id/members`, `/projects/:id/board` (фильтры priority, assignedTo)
- Bugs: `/bugs`, `/bugs/:id`, `/bugs/:id/assign`, `/bugs/:id/status`
- Attachments: `POST /attachments` (multipart, 10MB, image/*|pdf|txt|csv), `GET /attachments?bugId=`, `GET /attachments/:id/download`, `DELETE /attachments/:id`
- Comments: `/comments`

## Права доступа (кратко)

- admin — полный доступ ко всем ресурсам
- project owner/manager — управление проектом, участниками, багами
- developer — может менять статус назначенных багов и править их описание
- author бага — может править описание своего бага
- attachments/comments — удаление автором или owner/manager/admin

## Seed (dev)

- Команда: `npm run prisma:seed -w backend` (или в каталоге backend: `npx prisma db seed`)
- Пользователи: <admin@example.com> / Admin123!, <manager@example.com> / Manager123!, <dev@example.com> / Dev123!, <user@example.com> / User123!
- Projects: Public Demo (public) с owner=admin, manager=manager, developer=dev, viewer=user; Private Internal (private) с owner=admin, manager=manager, developer=dev
- Несколько багов, комментарии, вложение

## Примеры curl (PowerShell, используйте `curl.exe`)

### Register

```
curl.exe -X POST http://localhost:4000/auth/register ^
   -H "Content-Type: application/json" ^
   -c cookies.txt ^
   -d "{\"username\":\"demo\",\"email\":\"demo@example.com\",\"password\":\"Demo123!\"}"
```

### Login (access + refresh cookie)

```
curl.exe -X POST http://localhost:4000/auth/login ^
   -H "Content-Type: application/json" ^
   -c cookies.txt ^
   -d "{\"email\":\"admin@example.com\",\"password\":\"Admin123!\"}"
```

### Refresh (ротация)

```
curl.exe -X POST http://localhost:4000/auth/refresh ^
   -b cookies.txt -c cookies.txt
```

### Logout (отзыв refresh)

```
curl.exe -X POST http://localhost:4000/auth/logout ^
   -b cookies.txt -c cookies.txt
```

### Защищённый запрос

```
$ACCESS="<accessToken>"
curl.exe http://localhost:4000/users/me ^
   -H "Authorization: Bearer $ACCESS"
```

### Создание бага

```
$ACCESS="<accessToken>"
curl.exe -X POST http://localhost:4000/bugs ^
   -H "Authorization: Bearer $ACCESS" ^
   -H "Content-Type: application/json" ^
   -d "{\"projectId\":\"<projectId>\",\"title\":\"Test bug\",\"priority\":\"high\"}"
```

### Загрузка вложения (multipart)

```
$ACCESS="<accessToken>"
curl.exe -X POST http://localhost:4000/attachments ^
   -H "Authorization: Bearer $ACCESS" ^
   -b cookies.txt ^
   -F "bugId=<bugId>" ^
   -F "file=@c:/path/to/file.png"
```

### Скачивание вложения

```
curl.exe -X GET http://localhost:4000/attachments/<attachmentId>/download ^
   -b cookies.txt
```

## Ошибки

- 401 Unauthorized — отсутствует/невалидный/просроченный access/refresh
- 403 Forbidden — нарушены права/роль
- 404 Not found — ресурс не найден
- 409 Conflict — дублирующие записи (Prisma P2002)
