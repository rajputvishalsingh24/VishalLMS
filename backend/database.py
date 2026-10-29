import sqlite3
import json
import os
from typing import List, Dict, Any, Optional
from datetime import datetime

import shutil

IS_VERCEL = bool(os.environ.get("VERCEL"))

if IS_VERCEL:
    DB_PATH = "/tmp/lms.db"
    ORIGINAL_DB = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "lms.db")
    if not os.path.exists(DB_PATH) and os.path.exists(ORIGINAL_DB):
        try:
            shutil.copy2(ORIGINAL_DB, DB_PATH)
        except Exception as e:
            print(f"Notice copying DB on Vercel: {e}")
else:
    DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "lms.db")

def get_connection():
    try:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    except Exception:
        pass
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
    except Exception:
        pass
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
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
        description TEXT DEFAULT '',
        tags TEXT DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'processed',
        slide_count INTEGER DEFAULT 0,
        page_count INTEGER DEFAULT 0,
        progress INTEGER DEFAULT 0,
        last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        slide_number INTEGER DEFAULT 0,
        page_number INTEGER DEFAULT 0,
        title TEXT DEFAULT '',
        content TEXT NOT NULL,
        takeaways TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_chats (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'ask_materials',
        subject_id TEXT,
        document_id TEXT,
        query TEXT NOT NULL,
        response TEXT NOT NULL,
        citations TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quizzes (
        id TEXT PRIMARY KEY,
        subject_id TEXT,
        topic_id TEXT,
        document_id TEXT,
        title TEXT NOT NULL,
        difficulty TEXT NOT NULL DEFAULT 'Intermediate',
        format TEXT NOT NULL DEFAULT 'Multiple Choice',
        questions_json TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        total_questions INTEGER NOT NULL DEFAULT 0,
        correct_count INTEGER NOT NULL DEFAULT 0,
        incorrect_count INTEGER NOT NULL DEFAULT 0,
        accuracy INTEGER NOT NULL DEFAULT 0,
        answers_json TEXT NOT NULL DEFAULT '[]',
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        subject_id TEXT,
        topic_id TEXT,
        document_id TEXT,
        title TEXT NOT NULL,
        note_type TEXT NOT NULL DEFAULT 'quick_revision',
        content TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)

    # Setup FTS5 for document chunk retrieval
    try:
        cursor.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
            chunk_id UNINDEXED,
            document_id UNINDEXED,
            title,
            content,
            tokenize='porter unicode61'
        );
        """)
    except Exception as e:
        print(f"FTS5 setup notice: {e}")

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully!")
