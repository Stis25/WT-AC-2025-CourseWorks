# Kubernetes (k8s) манифесты

Папка содержит минимальный набор манифестов для деплоя **frontend** и **backend**.

## Быстрый старт (локально, minikube/kind)

### 1. Собрать образы локально

```bash
docker build -t todo-backend:latest ./backend
docker build -t todo-frontend:latest ./frontend
```

### 2 Применить манифесты

```bash
kubectl apply -f k8s
```

### 3 Добавить хосты (если используешь Ingress + host)

```
127.0.0.1 todo.local
127.0.0.1 api.todo.local
```

Frontend: `http://todo.local`

Backend (Swagger): `http://api.todo.local/docs`

Метрики: `http://api.todo.local/metrics`
