import sqlite3
import json
import os
import tempfile
import shutil
import hashlib
import secrets
from typing import List, Dict, Any, Optional
from datetime import datetime

def is_cloud_env():
    return bool(
        os.environ.get("VERCEL") 
        or os.environ.get("AWS_LAMBDA_FUNCTION_NAME") 
        or not os.access(os.path.dirname(os.path.dirname(__file__)), os.W_OK)
    )

if is_cloud_env():
    DB_PATH = os.path.join(tempfile.gettempdir(), "lms.db")
    ORIGINAL_DB = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "lms.db")
    if not os.path.exists(DB_PATH) and os.path.exists(ORIGINAL_DB):
        try:
            shutil.copyfile(ORIGINAL_DB, DB_PATH)
            try:
                os.chmod(DB_PATH, 0o666)
            except Exception:
                pass
        except Exception as e:
            print(f"Notice copying DB on cloud: {e}")
else:
    DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "lms.db")

_db_is_ready = False

def hash_password(password: str, salt: Optional[str] = None) -> str:
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode('utf-8')).hexdigest()
    return f"{salt}${hashed}"

def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, hashed = stored_hash.split("$", 1)
        return hash_password(password, salt) == stored_hash
    except Exception:
        return False

def _run_init_script(conn):
    cursor = conn.cursor()
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        program TEXT DEFAULT 'Master of Business Administration (MBA)',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        semester TEXT NOT NULL DEFAULT 'Semester 1',
        description TEXT DEFAULT '',
        code TEXT DEFAULT '',
        color TEXT DEFAULT '#3B82F6',
        icon TEXT DEFAULT 'Folder',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS topics (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Not Started',
        progress INTEGER NOT NULL DEFAULT 0,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        subject_id TEXT,
        topic_id TEXT,
        name TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        file_path TEXT NOT NULL,
        semester TEXT DEFAULT 'Semester 1',
        faculty TEXT DEFAULT '',
        tags TEXT DEFAULT '[]',
        slide_count INTEGER DEFAULT 0,
        page_count INTEGER DEFAULT 0,
        is_processed BOOLEAN DEFAULT 0,
        processing_status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        slide_number INTEGER,
        page_number INTEGER,
        title TEXT DEFAULT '',
        content TEXT NOT NULL,
        speaker_notes TEXT DEFAULT '',
        has_visuals BOOLEAN DEFAULT 0,
        visual_description TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_chats (
        id TEXT PRIMARY KEY,
        document_id TEXT,
        slide_number INTEGER,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        citations TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quizzes (
        id TEXT PRIMARY KEY,
        subject_id TEXT,
        topic_id TEXT,
        document_id TEXT,
        title TEXT NOT NULL,
        difficulty TEXT DEFAULT 'Medium',
        total_questions INTEGER DEFAULT 5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        score INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        answers_json TEXT NOT NULL,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        subject_id TEXT,
        topic_id TEXT,
        document_id TEXT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS presentation_summaries (
        id TEXT PRIMARY KEY,
        document_id TEXT UNIQUE NOT NULL,
        overview_json TEXT NOT NULL,
        concepts_json TEXT NOT NULL,
        frameworks_json TEXT NOT NULL,
        glossary_json TEXT NOT NULL,
        formulas_json TEXT NOT NULL,
        connections_json TEXT NOT NULL,
        slide_breakdown_json TEXT NOT NULL,
        revision_sheet_json TEXT NOT NULL,
        learning_path_json TEXT NOT NULL,
        total_slides INTEGER DEFAULT 0,
        concepts_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS presentation_learning_sessions (
        id TEXT PRIMARY KEY,
        document_id TEXT UNIQUE NOT NULL,
        active_module_index INTEGER DEFAULT 0,
        active_concept_id TEXT DEFAULT '',
        completed_concept_ids TEXT DEFAULT '[]',
        teaching_state_json TEXT DEFAULT '{}',
        chat_history_json TEXT DEFAULT '[]',
        progress_percentage REAL DEFAULT 0.0,
        last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS presentation_flashcards (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        concept_name TEXT NOT NULL,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        slide_number INTEGER DEFAULT 1,
        is_mastered BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );
    """)

    try:
        cursor.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
            content,
            title,
            speaker_notes,
            content='document_chunks',
            content_rowid='rowid'
        );
        """)
    except Exception as e:
        print(f"FTS5 setup notice: {e}")

    user_count = cursor.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if user_count == 0:
        default_pwd_hash = hash_password("vishal123")
        cursor.execute("""
        INSERT INTO users (id, username, password_hash, full_name, program)
        VALUES ('user_vishal', 'vishal', ?, 'Vishal Singh', 'Master of Business Administration (MBA)')
        """, (default_pwd_hash,))

    conn.commit()

def get_connection():
    global _db_is_ready
    try:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    except Exception:
        pass
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = DELETE")
    except Exception:
        pass

    if not _db_is_ready:
        _db_is_ready = True
        try:
            c = conn.cursor()
            c.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='presentation_summaries'")
            exists = c.fetchone()[0]
            if exists == 0:
                _run_init_script(conn)
            
            c.execute("SELECT count(*) FROM subjects")
            sub_count = c.fetchone()[0]
            if sub_count == 0:
                from .seed_data import seed_all_data
                seed_all_data()
        except Exception as e:
            print(f"Auto-init DB notice: {e}")

    return conn

def init_db():
    conn = get_connection()
    _run_init_script(conn)
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully!")
