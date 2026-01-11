import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, "test.db")
        os.environ["DB_PATH"] = db_path
        os.environ["SECRET_KEY"] = "test-secret"
        os.environ["UPLOAD_DIR"] = os.path.join(tmp, "uploads")

        from main import app 

        with TestClient(app) as c:
            yield c


def register(client: TestClient, email: str, password: str, role: str = "user"):
    r = client.post(
        "/register",
        json={"email": email, "name": "Test", "password": password, "role": role},
    )
    assert r.status_code == 200, r.text
    return r.json()


def login(client: TestClient, email: str, password: str):
    r = client.post("/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def auth_headers(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_user_flow_repeating_task(client: TestClient):
    reg = register(client, "u1@example.com", "password123", role="user")
    token = reg["token"]

    r = client.post("/tags", json={"name": "work"}, headers=auth_headers(token))
    assert r.status_code == 200
    tag_id = r.json()["id"]

    due = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(hours=1)

    r = client.post(
        "/tasks",
        json={
            "title": "My Task",
            "description": "Desc",
            "due_at": due.isoformat(),
            "status": "todo",
            "repeat_interval_minutes": 60,
            "tag_ids": [tag_id],
        },
        headers=auth_headers(token),
    )
    assert r.status_code == 200, r.text
    task = r.json()
    task_id = task["id"]

    r = client.post(f"/tasks/{task_id}/generate-next", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    next_task = r.json()
    assert next_task["repeat_interval_minutes"] == 60

    due_next = datetime.fromisoformat(next_task["due_at"])
    due_orig = datetime.fromisoformat(task["due_at"])
    assert int((due_next - due_orig).total_seconds()) == 3600

    date_from = (due_orig - timedelta(days=1)).isoformat()
    date_to = (due_next + timedelta(days=1)).isoformat()
    r = client.get(
        "/calendar",
        params={"date_from": date_from, "date_to": date_to},
        headers=auth_headers(token),
    )
    assert r.status_code == 200, r.text
    items = r.json()
    assert any(i["task_id"] == task_id for i in items)


def test_admin_can_list_users(client: TestClient):
    register(client, "admin@example.com", "password123", role="admin")
    token = login(client, "admin@example.com", "password123")["token"]

    r = client.get("/users", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    users = r.json()
    assert len(users) >= 1
