import sqlite3
import json
import os
import tempfile
import shutil
import hashlib
import secrets
from typing import List, Dict, Any, Optional
from datetime import datetime
from contextlib import contextmanager

@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()

def is_cloud_env():
    return bool(
        os.environ.get("VERCEL") 
        or os.environ.get("AWS_LAMBDA_FUNCTION_NAME") 
        or not os.access(os.path.dirname(os.path.dirname(__file__)), os.W_OK)
    )

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
        concept_name TEXT DEFAULT '',
        title TEXT NOT NULL,
        difficulty TEXT DEFAULT 'Medium',
        total_questions INTEGER DEFAULT 5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
        id TEXT PRIMARY KEY,
        quiz_id TEXT,
        document_id TEXT NOT NULL,
        concept_name TEXT NOT NULL,
        question_index INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        question_type TEXT NOT NULL DEFAULT 'single_choice',
        difficulty TEXT NOT NULL DEFAULT 'Medium',
        options_json TEXT NOT NULL,
        correct_indices_json TEXT NOT NULL,
        explanation TEXT NOT NULL,
        distractor_explanations_json TEXT DEFAULT '{}',
        source_slide_number INTEGER DEFAULT 1,
        practical_example TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        document_id TEXT,
        concept_name TEXT DEFAULT '',
        score INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        accuracy REAL NOT NULL,
        time_taken_seconds INTEGER DEFAULT 0,
        answers_json TEXT NOT NULL,
        results_json TEXT NOT NULL DEFAULT '[]',
        strong_areas_json TEXT DEFAULT '[]',
        needs_revision_json TEXT DEFAULT '[]',
        recommended_activity TEXT DEFAULT '',
        mode TEXT DEFAULT 'assessment',
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
        id TEXT PRIMARY KEY,
        subject_id TEXT,
        document_id TEXT,
        concept_name TEXT DEFAULT '',
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        duration_seconds INTEGER DEFAULT 0,
        activity_type TEXT DEFAULT 'learning',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS concept_progress (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        concept_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Not Started',
        slide_numbers_json TEXT DEFAULT '[]',
        times_studied INTEGER DEFAULT 0,
        best_quiz_score REAL DEFAULT 0.0,
        last_studied TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(document_id, concept_name) ON CONFLICT REPLACE
    );

    CREATE TABLE IF NOT EXISTS slide_assets (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        slide_number INTEGER NOT NULL,
        title TEXT DEFAULT '',
        layout_json TEXT DEFAULT '{}',
        speaker_notes TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(document_id, slide_number) ON CONFLICT REPLACE
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
        current_module_id TEXT DEFAULT 'mod_1',
        current_concept_name TEXT DEFAULT '',
        current_slide_number INTEGER DEFAULT 1,
        understood_concepts TEXT DEFAULT '[]',
        revision_needed_concepts TEXT DEFAULT '[]',
        messages_json TEXT DEFAULT '[]',
        last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

    CREATE TABLE IF NOT EXISTS smart_flashcards (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        subject_id TEXT,
        document_id TEXT,
        concept_name TEXT NOT NULL,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        slide_number INTEGER DEFAULT 1,
        difficulty TEXT DEFAULT 'Medium',
        interval_days INTEGER DEFAULT 1,
        ease_factor REAL DEFAULT 2.5,
        repetitions INTEGER DEFAULT 0,
        next_review_date TEXT,
        last_reviewed TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS doubt_notebook (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        subject_id TEXT,
        document_id TEXT,
        concept_name TEXT DEFAULT '',
        title TEXT NOT NULL,
        doubt_text TEXT NOT NULL,
        ai_resolution TEXT DEFAULT '',
        slide_number INTEGER DEFAULT 1,
        status TEXT DEFAULT 'Unresolved',
        tags TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS business_cases (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        subject_id TEXT,
        document_id TEXT,
        concept_name TEXT DEFAULT '',
        role TEXT NOT NULL DEFAULT 'Product Manager',
        title TEXT NOT NULL,
        industry TEXT DEFAULT 'Tech & SaaS',
        difficulty TEXT DEFAULT 'Medium',
        case_json TEXT NOT NULL,
        student_attempt TEXT DEFAULT '',
        evaluation_json TEXT DEFAULT '{}',
        score REAL DEFAULT 0.0,
        status TEXT DEFAULT 'Draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS interview_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        subject_id TEXT,
        role TEXT NOT NULL DEFAULT 'Product Manager',
        mode TEXT NOT NULL DEFAULT 'product_sense',
        difficulty TEXT DEFAULT 'Medium',
        current_q_index INTEGER DEFAULT 0,
        questions_json TEXT NOT NULL,
        responses_json TEXT DEFAULT '[]',
        evaluation_json TEXT DEFAULT '{}',
        overall_score REAL DEFAULT 0.0,
        completed BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exam_plans (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        subject_id TEXT NOT NULL,
        title TEXT NOT NULL,
        exam_date TEXT,
        duration_days INTEGER DEFAULT 7,
        daily_schedule_json TEXT NOT NULL,
        status TEXT DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mock_exams (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        subject_id TEXT NOT NULL,
        document_id TEXT,
        title TEXT NOT NULL,
        time_limit_minutes INTEGER DEFAULT 45,
        questions_json TEXT NOT NULL,
        answers_json TEXT DEFAULT '[]',
        results_json TEXT DEFAULT '{}',
        score INTEGER DEFAULT 0,
        total_questions INTEGER DEFAULT 10,
        accuracy REAL DEFAULT 0.0,
        completed BOOLEAN DEFAULT 0,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS confidence_logs (
        id TEXT PRIMARY KEY,
        quiz_attempt_id TEXT,
        question_id TEXT,
        confidence_level TEXT NOT NULL,
        is_correct BOOLEAN NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_milestones (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        milestone_key TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        badge_icon TEXT DEFAULT 'award',
        achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS framework_notes (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        framework_id TEXT NOT NULL,
        notes TEXT NOT NULL,
        linked_doc_id TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, framework_id) ON CONFLICT REPLACE
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

    # Run safe column migrations on existing tables
    try:
        q_cols = [r[1] for r in cursor.execute("PRAGMA table_info(quizzes)").fetchall()]
        if "concept_name" not in q_cols:
            cursor.execute("ALTER TABLE quizzes ADD COLUMN concept_name TEXT DEFAULT ''")
    except Exception as e:
        print(f"Migration notice quizzes: {e}")

    try:
        qa_cols = [r[1] for r in cursor.execute("PRAGMA table_info(quiz_attempts)").fetchall()]
        if "document_id" not in qa_cols:
            cursor.execute("ALTER TABLE quiz_attempts ADD COLUMN document_id TEXT")
        if "concept_name" not in qa_cols:
            cursor.execute("ALTER TABLE quiz_attempts ADD COLUMN concept_name TEXT DEFAULT ''")
    except Exception as e:
        print(f"Migration notice quiz_attempts: {e}")

    user_count = cursor.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if user_count == 0:
        default_pwd_hash = hash_password("vishal123")
        cursor.execute("""
        INSERT INTO users (id, username, password_hash, full_name, program)
        VALUES ('user_vishal', 'vishal', ?, 'Vishal Singh', 'Master of Business Administration (MBA)')
        """, (default_pwd_hash,))

    conn.commit()

def _run_safe_migrations(conn):
    c = conn.cursor()
    # Ensure new tables exist
    c.executescript("""
    CREATE TABLE IF NOT EXISTS smart_flashcards (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        subject_id TEXT,
        document_id TEXT,
        concept_name TEXT NOT NULL,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        slide_number INTEGER DEFAULT 1,
        difficulty TEXT DEFAULT 'Medium',
        interval_days INTEGER DEFAULT 1,
        ease_factor REAL DEFAULT 2.5,
        repetitions INTEGER DEFAULT 0,
        next_review_date TEXT,
        last_reviewed TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS doubt_notebook (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        subject_id TEXT,
        document_id TEXT,
        concept_name TEXT DEFAULT '',
        title TEXT NOT NULL,
        doubt_text TEXT NOT NULL,
        ai_resolution TEXT DEFAULT '',
        slide_number INTEGER DEFAULT 1,
        status TEXT DEFAULT 'Unresolved',
        tags TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS business_cases (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        subject_id TEXT,
        document_id TEXT,
        concept_name TEXT DEFAULT '',
        role TEXT NOT NULL DEFAULT 'Product Manager',
        title TEXT NOT NULL,
        industry TEXT DEFAULT 'Tech & SaaS',
        difficulty TEXT DEFAULT 'Medium',
        case_json TEXT NOT NULL,
        student_attempt TEXT DEFAULT '',
        evaluation_json TEXT DEFAULT '{}',
        score REAL DEFAULT 0.0,
        status TEXT DEFAULT 'Draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS interview_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        subject_id TEXT,
        role TEXT NOT NULL DEFAULT 'Product Manager',
        mode TEXT NOT NULL DEFAULT 'product_sense',
        difficulty TEXT DEFAULT 'Medium',
        current_q_index INTEGER DEFAULT 0,
        questions_json TEXT NOT NULL,
        responses_json TEXT DEFAULT '[]',
        evaluation_json TEXT DEFAULT '{}',
        overall_score REAL DEFAULT 0.0,
        completed BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exam_plans (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        subject_id TEXT NOT NULL,
        title TEXT NOT NULL,
        exam_date TEXT,
        duration_days INTEGER DEFAULT 7,
        daily_schedule_json TEXT NOT NULL,
        status TEXT DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mock_exams (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        subject_id TEXT NOT NULL,
        document_id TEXT,
        title TEXT NOT NULL,
        time_limit_minutes INTEGER DEFAULT 45,
        questions_json TEXT NOT NULL,
        answers_json TEXT DEFAULT '[]',
        results_json TEXT DEFAULT '{}',
        score INTEGER DEFAULT 0,
        total_questions INTEGER DEFAULT 10,
        accuracy REAL DEFAULT 0.0,
        completed BOOLEAN DEFAULT 0,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS confidence_logs (
        id TEXT PRIMARY KEY,
        quiz_attempt_id TEXT,
        question_id TEXT,
        confidence_level TEXT NOT NULL,
        is_correct BOOLEAN NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_milestones (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        milestone_key TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        badge_icon TEXT DEFAULT 'award',
        achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS framework_notes (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'user_vishal',
        framework_id TEXT NOT NULL,
        notes TEXT NOT NULL,
        linked_doc_id TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, framework_id) ON CONFLICT REPLACE
    );
    """)

    try:
        q_cols = [r[1] for r in c.execute("PRAGMA table_info(quizzes)").fetchall()]
        if "concept_name" not in q_cols:
            c.execute("ALTER TABLE quizzes ADD COLUMN concept_name TEXT DEFAULT ''")
        if "total_questions" not in q_cols:
            c.execute("ALTER TABLE quizzes ADD COLUMN total_questions INTEGER DEFAULT 5")
    except Exception:
        pass
    try:
        qa_cols = [r[1] for r in c.execute("PRAGMA table_info(quiz_attempts)").fetchall()]
        for col_name, col_type in [
            ("document_id", "TEXT"),
            ("concept_name", "TEXT DEFAULT ''"),
            ("time_taken_seconds", "INTEGER DEFAULT 0"),
            ("results_json", "TEXT DEFAULT '[]'"),
            ("strong_areas_json", "TEXT DEFAULT '[]'"),
            ("needs_revision_json", "TEXT DEFAULT '[]'"),
            ("recommended_activity", "TEXT DEFAULT ''"),
            ("mode", "TEXT DEFAULT 'assessment'")
        ]:
            if col_name not in qa_cols:
                try:
                    c.execute(f"ALTER TABLE quiz_attempts ADD COLUMN {col_name} {col_type}")
                except Exception:
                    pass
    except Exception:
        pass
    conn.commit()

def get_connection():
    global _db_is_ready
    if is_cloud_env():
        db_path = os.path.join(tempfile.gettempdir(), "lms.db")
        if not os.path.exists(db_path):
            orig_db = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "lms.db")
            if os.path.exists(orig_db):
                try:
                    shutil.copyfile(orig_db, db_path)
                except Exception as e:
                    print(f"Notice copying original DB: {e}")
    else:
        db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "lms.db")

    try:
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
    except Exception:
        pass

    conn = sqlite3.connect(db_path, timeout=30.0)
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
            c.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='quiz_questions'")
            exists = c.fetchone()[0]
            if exists == 0:
                _run_init_script(conn)
            else:
                _run_safe_migrations(conn)
            
            c.execute("SELECT count(*) FROM user_settings WHERE key = 'seed_completed'")
            has_seeded = c.fetchone()[0]
            if has_seeded == 0:
                c.execute("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('seed_completed', 'true')")
                conn.commit()
                c.execute("SELECT count(*) FROM subjects")
                if c.fetchone()[0] == 0:
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
