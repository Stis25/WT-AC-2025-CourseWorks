import sqlite3
import os

DB_PATH = os.getenv("DB_PATH", "app.db")

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db(seed: bool = True):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        cur = conn.cursor()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS User (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS Task (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                due_at DATETIME,
                status TEXT NOT NULL DEFAULT 'todo',
                repeat_interval_minutes INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES User(id) ON DELETE CASCADE
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS SubTask (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                is_done BOOLEAN NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(task_id) REFERENCES Task(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES User(id) ON DELETE CASCADE
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS Tag (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, name),
                FOREIGN KEY(user_id) REFERENCES User(id) ON DELETE CASCADE
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS TaskTag (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                UNIQUE(task_id, tag_id),
                FOREIGN KEY(task_id) REFERENCES Task(id) ON DELETE CASCADE,
                FOREIGN KEY(tag_id) REFERENCES Tag(id) ON DELETE CASCADE
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS File (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                content_type TEXT,
                size_bytes INTEGER NOT NULL,
                storage_path TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(task_id) REFERENCES Task(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES User(id) ON DELETE CASCADE
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS Reminder (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                every_minutes INTEGER NOT NULL,
                start_at DATETIME,
                end_at DATETIME,
                is_enabled BOOLEAN NOT NULL DEFAULT 1,
                next_run_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(task_id) REFERENCES Task(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES User(id) ON DELETE CASCADE
            )
        """)

        cur.execute("CREATE INDEX IF NOT EXISTS idx_task_user_due ON Task(user_id, due_at)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_task_status ON Task(status)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_subtask_task ON SubTask(task_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tag_user ON Tag(user_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_file_task ON File(task_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_reminder_task ON Reminder(task_id)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_reminder_next_run ON Reminder(next_run_at, is_enabled)")

        cur.execute("""
            CREATE TRIGGER IF NOT EXISTS trg_task_updated_at
            AFTER UPDATE ON Task
            FOR EACH ROW
            BEGIN
                UPDATE Task SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
            END;
        """)
        cur.execute("""
            CREATE TRIGGER IF NOT EXISTS trg_subtask_updated_at
            AFTER UPDATE ON SubTask
            FOR EACH ROW
            BEGIN
                UPDATE SubTask SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
            END;
        """)

        conn.commit()
