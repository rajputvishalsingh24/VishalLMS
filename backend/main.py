import os
import sys
import json
import uuid
import tempfile
import traceback
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse, Response
from pydantic import BaseModel

import secrets
from .database import get_connection, init_db, verify_password, hash_password, is_cloud_env
from .extractor import extract_document, extract_slide_layouts
from .ai_tutor import answer_tutor_query, generate_quiz_for_topic, generate_notes_for_topic, get_configured_api_key
from .seed_data import seed_all_data
from .summarizer import analyze_presentation, get_concept_teaching_package, process_tutor_conversation
from .quiz_engine import get_concept_quiz_prep, generate_or_get_concept_quiz, submit_quiz_evaluation, get_presentation_quiz_catalog
from .tracker import (
    record_study_session, update_concept_status, get_learning_analytics,
    get_subject_progress_cards, get_presentation_progress_list,
    get_study_recommendations, get_daily_study_time_chart
)
from .flashcards_engine import (
    get_due_flashcards, get_all_flashcards, review_flashcard,
    create_flashcard, generate_smart_flashcards_from_doc
)
from .doubt_engine import (
    create_doubt, get_doubts, update_doubt_status,
    resolve_doubt_with_ai, convert_doubt_to_flashcard
)
from .case_engine import (
    generate_business_case, get_business_cases, submit_case_solution,
    ROLE_TEMPLATES, EVALUATION_RUBRICS
)
from .interview_engine import (
    start_interview_session, submit_interview_answer, get_interview_history
)
from .calculator_engine import (
    calculate_ltv_cac, calculate_npv_payback, calculate_breakeven,
    calculate_eoq_inventory, calculate_rice_score, calculate_wacc
)
from .framework_engine import (
    get_all_frameworks, get_framework_by_id, save_framework_notes
)
from .exam_engine import (
    generate_exam_plan, get_exam_plans, generate_mock_exam, submit_mock_exam
)
from .prerequisite_engine import analyze_student_prerequisite_gaps
from .cross_search import cross_search_presentations, synthesize_cross_presentation_query
from .confidence_engine import log_confidence_entry, get_confidence_matrix_analytics
app = FastAPI(title="VISHAL SINGH - AI Learning Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_upload_dir() -> str:
    if is_cloud_env():
        d = os.path.join(tempfile.gettempdir(), "uploads")
    else:
        d = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "uploads")
    try:
        os.makedirs(d, exist_ok=True)
    except Exception:
        pass
    return d

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print("UNHANDLED ERROR DURING REQUEST:", tb, file=sys.stderr)
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "traceback": tb}
    )

@app.get("/api/health")
def api_health():
    return {"status": "online", "mode": "full_lms"}

# ----------------- AUTHENTICATION ----------------- #
class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginRequest):
    conn = get_connection()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (req.username.strip(),)).fetchone()
    if not user or not verify_password(req.password, user["password_hash"]):
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    token = secrets.token_hex(32)
    conn.execute("INSERT INTO user_sessions (token, user_id) VALUES (?, ?)", (token, user["id"]))
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "program": user["program"]
        }
    }

@app.post("/api/auth/logout")
def logout(token: Optional[str] = Query(None)):
    if token:
        conn = get_connection()
        conn.execute("DELETE FROM user_sessions WHERE token = ?", (token,))
        conn.commit()
        conn.close()
    return {"success": True, "message": "Logged out successfully"}

def get_auth_user(request: Request, conn=None) -> Dict[str, Any]:
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True
    try:
        token = None
        # Check Authorization header (Bearer <token>)
        auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
        if auth_header:
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1].strip()
            else:
                token = auth_header.strip()
        
        # Check X-Auth-Token header
        if not token:
            token = request.headers.get("X-Auth-Token") or request.headers.get("x-auth-token")
            
        # Check query params
        if not token:
            token = request.query_params.get("token")
            
        if token:
            session = conn.execute("""
            SELECT u.id, u.username, u.full_name, u.program 
            FROM user_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ?
            """, (token,)).fetchone()
            if session:
                return dict(session)

        # Default fallback to primary user or first user
        user = conn.execute("SELECT id, username, full_name, program FROM users WHERE id = 'user_vishal' LIMIT 1").fetchone()
        if not user:
            user = conn.execute("SELECT id, username, full_name, program FROM users LIMIT 1").fetchone()
        if user:
            return dict(user)
        return {"id": "user_vishal", "username": "vishal", "full_name": "Vishal Singh", "program": "Master of Business Administration (MBA)"}
    finally:
        if should_close:
            conn.close()

@app.get("/api/auth/me")
def get_current_user(request: Request, token: Optional[str] = Query(None)):
    conn = get_connection()
    try:
        user = get_auth_user(request, conn)
        return {"authenticated": True, "user": user}
    finally:
        conn.close()

# ----------------- STATS & DASHBOARD ----------------- #
@app.get("/api/stats")
def get_dashboard_stats():
    conn = get_connection()
    c = conn.cursor()

    total_presentations = c.execute("SELECT COUNT(*) FROM documents WHERE LOWER(file_type) IN ('ppt', 'pptx')").fetchone()[0] or 0
    total_docs = c.execute("SELECT COUNT(*) FROM documents").fetchone()[0] or 0
    total_subjects = c.execute("SELECT COUNT(*) FROM subjects").fetchone()[0] or 0
    topics_completed = c.execute("SELECT COUNT(*) FROM topics WHERE status = 'Completed'").fetchone()[0] or 0
    quizzes_attempted = c.execute("SELECT COUNT(*) FROM quiz_attempts").fetchone()[0] or 0
    
    # Calculate overall progress from topics
    avg_topic_prog = c.execute("SELECT AVG(progress) FROM topics").fetchone()[0] or 0
    overall_progress = round(avg_topic_prog)

    # Continue learning cards
    continue_rows = c.execute("""
    SELECT d.id, d.name, d.file_type, d.progress, d.last_accessed, s.name as subject_name, s.color as subject_color, t.name as topic_name
    FROM documents d
    LEFT JOIN subjects s ON d.subject_id = s.id
    LEFT JOIN topics t ON d.topic_id = t.id
    ORDER BY d.last_accessed DESC LIMIT 4
    """).fetchall()

    continue_learning = [dict(r) for r in continue_rows]

    # Recent uploads
    recent_rows = c.execute("""
    SELECT d.id, d.name, d.original_filename, d.file_type, d.file_size, d.created_at, d.slide_count, d.page_count,
           s.name as subject_name, s.color as subject_color
    FROM documents d
    LEFT JOIN subjects s ON d.subject_id = s.id
    ORDER BY d.created_at DESC LIMIT 8
    """).fetchall()

    recent_uploads = [dict(r) for r in recent_rows]

    conn.close()

    return {
        "stats": {
            "presentations": total_presentations,
            "documents": total_docs,
            "subjects": total_subjects,
            "topics_completed": topics_completed,
            "quizzes_attempted": quizzes_attempted,
            "overall_progress": overall_progress
        },
        "continue_learning": continue_learning,
        "recent_uploads": recent_uploads
    }

# ----------------- SUBJECTS & TOPICS ----------------- #
@app.get("/api/subjects")
def get_subjects(request: Request):
    conn = get_connection()
    user = get_auth_user(request, conn)
    user_id = user.get("id", "user_vishal")
    c = conn.cursor()
    
    subjects = c.execute("""
    SELECT s.*, 
           COUNT(DISTINCT t.id) as topic_count,
           COUNT(DISTINCT d.id) as document_count,
           COALESCE(AVG(t.progress), 0) as avg_progress
    FROM subjects s
    LEFT JOIN topics t ON s.id = t.subject_id
    LEFT JOIN documents d ON s.id = d.subject_id
    WHERE s.user_id = ? OR s.user_id = 'user_vishal' OR s.user_id IS NULL OR ? = 'user_vishal'
    GROUP BY s.id
    ORDER BY s.semester ASC, s.created_at DESC, s.name ASC
    """, (user_id, user_id)).fetchall()

    result = []
    for s in subjects:
        s_dict = dict(s)
        s_dict["avg_progress"] = round(s_dict["avg_progress"])
        # Fetch topics for this subject
        topics = c.execute("SELECT * FROM topics WHERE subject_id = ? ORDER BY order_index ASC", (s["id"],)).fetchall()
        s_dict["topics"] = [dict(t) for t in topics]
        result.append(s_dict)

    conn.close()
    return result

class SubjectCreate(BaseModel):
    name: str
    semester: str = "Semester 1"
    description: str = ""
    color: str = "#3B82F6"

@app.get("/api/subjects/{id}")
def get_subject_detail(id: str, request: Request):
    conn = get_connection()
    subj = conn.execute("SELECT * FROM subjects WHERE id = ?", (id,)).fetchone()
    if not subj:
        conn.close()
        raise HTTPException(status_code=404, detail="Subject not found")
    docs = conn.execute("SELECT * FROM documents WHERE subject_id = ? ORDER BY created_at DESC", (id,)).fetchall()
    topics = conn.execute("SELECT * FROM topics WHERE subject_id = ? ORDER BY order_index ASC", (id,)).fetchall()
    conn.close()
    res = dict(subj)
    res["documents"] = [dict(d) for d in docs]
    res["topics"] = [dict(t) for t in topics]
    return res

@app.post("/api/subjects")
def create_subject(subj: SubjectCreate, request: Request):
    name = subj.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Subject name cannot be empty")
    
    conn = get_connection()
    user = get_auth_user(request, conn)
    user_id = user.get("id", "user_vishal")
    
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    s_id = f"sub_{uuid.uuid4().hex[:8]}"
    
    conn.execute(
        """
        INSERT INTO subjects (id, user_id, name, semester, description, color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (s_id, user_id, name, subj.semester, subj.description.strip(), subj.color, now_str, now_str)
    )
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "id": s_id,
        "user_id": user_id,
        "name": name,
        "semester": subj.semester,
        "description": subj.description.strip(),
        "color": subj.color,
        "created_at": now_str,
        "updated_at": now_str,
        "message": f"Subject '{name}' created successfully."
    }

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

@app.put("/api/subjects/{id}")
def update_subject(id: str, subj: SubjectUpdate, request: Request):
    conn = get_connection()
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    if subj.name:
        name = subj.name.strip()
        if not name:
            conn.close()
            raise HTTPException(status_code=400, detail="Subject name cannot be empty")
        conn.execute("UPDATE subjects SET name = ?, description = COALESCE(?, description), updated_at = ? WHERE id = ?", (name, subj.description, now_str, id))
    elif subj.description is not None:
        conn.execute("UPDATE subjects SET description = ?, updated_at = ? WHERE id = ?", (subj.description.strip(), now_str, id))
    
    updated = conn.execute("SELECT * FROM subjects WHERE id = ?", (id,)).fetchone()
    conn.commit()
    conn.close()
    return {"success": True, "id": id, "name": updated["name"] if updated else "", "description": updated["description"] if updated else ""}

@app.delete("/api/subjects/{id}")
def delete_subject(id: str, request: Request):
    conn = get_connection()
    # Cascade delete documents and chunks
    conn.execute("DELETE FROM document_chunks WHERE document_id IN (SELECT id FROM documents WHERE subject_id = ?)", (id,))
    conn.execute("DELETE FROM documents WHERE subject_id = ?", (id,))
    conn.execute("DELETE FROM topics WHERE subject_id = ?", (id,))
    conn.execute("DELETE FROM subjects WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Subject deleted successfully"}

class TopicStatusUpdate(BaseModel):
    status: str
    progress: int

@app.put("/api/topics/{id}/status")
def update_topic_status(id: str, data: TopicStatusUpdate):
    conn = get_connection()
    conn.execute("UPDATE topics SET status = ?, progress = ? WHERE id = ?", (data.status, data.progress, id))
    conn.commit()
    conn.close()
    return {"success": True}

# ----------------- DOCUMENTS & UPLOADS ----------------- #
@app.get("/api/documents")
def get_documents(
    request: Request,
    subject_id: Optional[str] = None,
    file_type: Optional[str] = None,
    semester: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "newest"
):
    conn = get_connection()
    user = get_auth_user(request, conn)
    user_id = user.get("id", "user_vishal")
    query = """
    SELECT d.*, s.name as subject_name, s.color as subject_color, t.name as topic_name
    FROM documents d
    LEFT JOIN subjects s ON d.subject_id = s.id
    LEFT JOIN topics t ON d.topic_id = t.id
    WHERE (d.user_id = ? OR d.user_id = 'user_vishal' OR d.user_id IS NULL OR ? = 'user_vishal')
    """
    params = [user_id, user_id]

    if subject_id and subject_id != "all":
        query += " AND d.subject_id = ?"
        params.append(subject_id)

    if file_type and file_type != "all":
        query += " AND LOWER(d.file_type) = ?"
        params.append(file_type.lower())

    if semester and semester != "all":
        query += " AND d.semester = ?"
        params.append(semester)

    if search:
        query += " AND (d.name LIKE ? OR d.description LIKE ? OR t.name LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term])

    if sort_by == "name":
        query += " ORDER BY d.name ASC"
    elif sort_by == "oldest":
        query += " ORDER BY d.created_at ASC"
    else: # newest
        query += " ORDER BY d.created_at DESC"

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/documents/{id}")
def get_document_details(id: str):
    conn = get_connection()
    doc = conn.execute("""
    SELECT d.*, s.name as subject_name, s.color as subject_color, t.name as topic_name
    FROM documents d
    LEFT JOIN subjects s ON d.subject_id = s.id
    LEFT JOIN topics t ON d.topic_id = t.id
    WHERE d.id = ?
    """, (id,)).fetchone()

    if not doc:
        conn.close()
        raise HTTPException(status_code=404, detail="Document not found")

    # Update last_accessed
    conn.execute("UPDATE documents SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?", (id,))
    conn.commit()

    # Get slide / page chunks
    chunks = conn.execute("""
    SELECT chunk_index, slide_number, page_number, title, content, takeaways
    FROM document_chunks
    WHERE document_id = ?
    ORDER BY chunk_index ASC
    """, (id,)).fetchall()

    chunks_list = []
    for c in chunks:
        c_dict = dict(c)
        try:
            c_dict["takeaways"] = json.loads(c_dict["takeaways"])
        except:
            c_dict["takeaways"] = []
        chunks_list.append(c_dict)

    conn.close()
    doc_dict = dict(doc)
    doc_dict["chunks"] = chunks_list
    return doc_dict

@app.post("/api/documents/upload")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    subject_id: Optional[str] = Form(None),
    topic_id: Optional[str] = Form(None),
    semester: str = Form("Semester 1"),
    faculty: str = Form(""),
    description: str = Form(""),
    tags: str = Form("[]")
):
    safe_filename = os.path.basename(file.filename or "presentation.pptx")
    ext = os.path.splitext(safe_filename)[1].lower().replace(".", "")

    # Reject dangerous executable formats
    if ext in ["exe", "bat", "sh", "cmd", "vbs", "ps1", "dll", "so", "bin"]:
        raise HTTPException(status_code=400, detail="Executable files are not permitted for security reasons.")

    contents = await file.read()
    if not contents or len(contents) == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty. Please select a valid PowerPoint or PDF file.")

    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds the 50 MB limit. Please upload a smaller presentation.")

    # Detect actual file signature from header bytes
    from .extractor import detect_file_signature
    real_ext = ext
    if contents.startswith(b"PK\x03\x04"):
        if ext in ["docx", "doc"]:
            real_ext = "docx"
        else:
            real_ext = "pptx"
    elif contents.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        if ext in ["doc", "docx"]:
            real_ext = "docx"
        else:
            real_ext = "ppt"
    elif contents.startswith(b"%PDF-"):
        real_ext = "pdf"

    if real_ext not in ["ppt", "pptx", "pdf", "docx", "doc", "txt", "md"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format .{ext}. Supported formats: PowerPoint (.ppt, .pptx), PDF (.pdf), Word (.docx), and text (.txt, .md)"
        )

    doc_id = f"doc_{uuid.uuid4().hex[:10]}"
    saved_filename = f"{doc_id}_{safe_filename}"
    file_path = os.path.join(get_upload_dir(), saved_filename)

    with open(file_path, "wb") as f:
        f.write(contents)

    file_size = len(contents)

    # Resolve and validate target subject to guarantee valid foreign key
    conn = get_connection()
    user = get_auth_user(request, conn)
    user_id = user.get("id", "user_vishal")
    c = conn.cursor()

    target_subject_id = None
    if subject_id and str(subject_id).strip() not in ("", "null", "undefined", "None"):
        s_row = c.execute("SELECT id FROM subjects WHERE id = ?", (str(subject_id).strip(),)).fetchone()
        if s_row:
            target_subject_id = s_row["id"]

    if not target_subject_id:
        first_sub = c.execute("SELECT id FROM subjects WHERE user_id = ? OR user_id = 'user_vishal' ORDER BY created_at ASC LIMIT 1", (user_id,)).fetchone()
        if first_sub:
            target_subject_id = first_sub["id"]
        else:
            default_sub_id = f"sub_{uuid.uuid4().hex[:8]}"
            c.execute(
                "INSERT INTO subjects (id, user_id, name, description) VALUES (?, ?, 'MBA Core Curriculum', 'Default subject for uploaded class presentations and study materials')",
                (default_sub_id, user_id)
            )
            conn.commit()
            target_subject_id = default_sub_id

    # Resolve optional topic_id
    clean_topic_id = None
    if topic_id and str(topic_id).strip() not in ("", "null", "undefined", "None"):
        t_row = c.execute("SELECT id FROM topics WHERE id = ?", (str(topic_id).strip(),)).fetchone()
        if t_row:
            clean_topic_id = t_row["id"]

    # Extract text & slides
    try:
        extracted_chunks = extract_document(file_path, real_ext)
    except Exception as e:
        extracted_chunks = [{
            "slide_number": 1,
            "page_number": 1,
            "title": safe_filename,
            "content": f"Document uploaded. Text extraction note: {str(e)}",
            "takeaways": ["Review presentation manually"]
        }]

    slide_count = max(1, len(extracted_chunks))
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    c.execute("""
    INSERT INTO documents (
        id, user_id, subject_id, topic_id, name, original_filename, file_type, file_size,
        file_path, semester, faculty, description, tags, slide_count, page_count, progress,
        status, processing_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'ready', 'completed', ?, ?)
    """, (
        doc_id, user_id, target_subject_id, clean_topic_id, safe_filename, safe_filename,
        real_ext.upper(), file_size, file_path, semester, faculty, description, tags,
        slide_count, slide_count, now_str, now_str
    ))

    for idx, chunk in enumerate(extracted_chunks, start=1):
        chunk_id = str(uuid.uuid4())
        takeaways_json = json.dumps(chunk.get("takeaways", []))
        c.execute("""
        INSERT INTO document_chunks (id, document_id, chunk_index, slide_number, page_number, title, content, takeaways)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            chunk_id, doc_id, idx, chunk.get("slide_number", idx),
            chunk.get("page_number", idx), chunk.get("title", f"Slide {idx}"),
            chunk.get("content", ""), takeaways_json
        ))

        try:
            c.execute("""
            INSERT INTO document_chunks_fts (title, content)
            VALUES (?, ?)
            """, (chunk.get("title", ""), chunk.get("content", "")))
        except Exception:
            pass

    conn.commit()
    conn.close()

    # Pre-generate presentation summary & concepts immediately so learning view is ready instantly
    try:
        analyze_presentation(doc_id)
    except Exception as e:
        print(f"Notice auto-analyzing presentation: {e}")

    return {
        "success": True,
        "id": doc_id,
        "name": safe_filename,
        "subject_id": target_subject_id,
        "user_id": user_id,
        "slide_count": slide_count,
        "file_size": file_size,
        "status": "ready",
        "processing_status": "completed",
        "message": f"Successfully uploaded and processed {slide_count} slides!"
    }

@app.delete("/api/documents/{id}")
def delete_document(id: str):
    conn = get_connection()
    doc = conn.execute("SELECT file_path FROM documents WHERE id = ?", (id,)).fetchone()
    if doc and os.path.exists(doc["file_path"]):
        try:
            os.remove(doc["file_path"])
        except Exception:
            pass
    conn.execute("DELETE FROM documents WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return {"success": True}

class DocumentUpdate(BaseModel):
    name: str

@app.put("/api/documents/{id}")
def update_document(id: str, doc_update: DocumentUpdate):
    name = doc_update.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Document name cannot be empty")
    conn = get_connection()
    conn.execute("UPDATE documents SET name = ? WHERE id = ?", (name, id))
    conn.commit()
    conn.close()
    return {"success": True, "name": name}

# ----------------- AI TUTOR ----------------- #
class TutorChatRequest(BaseModel):
    query: str
    mode: str = "ask_materials" # simple_explanation, teach_step_by_step, presentation_explainer, ask_materials
    teaching_mode: Optional[str] = "MBA" # Beginner, MBA, Exam, Expert
    subject_id: Optional[str] = None
    document_id: Optional[str] = None
    detail_level: str = "normal"

@app.post("/api/tutor/chat")
def tutor_chat(req: TutorChatRequest):
    result = answer_tutor_query(
        query=req.query,
        mode=req.mode,
        subject_id=req.subject_id,
        document_id=req.document_id,
        detail_level=req.detail_level,
        teaching_mode=req.teaching_mode or "MBA"
    )

    # Save to chat history
    conn = get_connection()
    chat_id = f"chat_{uuid.uuid4().hex[:8]}"
    conn.execute("""
    INSERT INTO ai_chats (id, session_id, mode, subject_id, document_id, query, response, citations)
    VALUES (?, 'default_session', ?, ?, ?, ?, ?, ?)
    """, (chat_id, req.mode, req.subject_id, req.document_id, req.query, result["response"], json.dumps(result["citations"])))
    conn.commit()
    conn.close()

    return result

@app.get("/api/tutor/history")
def get_tutor_history(limit: int = 20):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM ai_chats ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    res = []
    for r in rows:
        d = dict(r)
        try:
            d["citations"] = json.loads(d["citations"])
        except:
            d["citations"] = []
        res.append(d)
    return res

# ----------------- QUIZZES ----------------- #
class QuizGenerateRequest(BaseModel):
    subject_id: Optional[str] = None
    topic_id: Optional[str] = None
    document_id: Optional[str] = None
    difficulty: str = "MBA Examination Level"
    format: str = "Multiple Choice"
    num_questions: int = 5

@app.post("/api/quizzes/generate")
def create_quiz(req: QuizGenerateRequest):
    quiz_data = generate_quiz_for_topic(
        subject_id=req.subject_id,
        topic_id=req.topic_id,
        document_id=req.document_id,
        difficulty=req.difficulty,
        format_type=req.format,
        num_questions=req.num_questions
    )

    quiz_id = f"quiz_{uuid.uuid4().hex[:8]}"
    conn = get_connection()
    conn.execute("""
    INSERT INTO quizzes (id, subject_id, topic_id, document_id, title, difficulty, format, questions_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (quiz_id, req.subject_id, req.topic_id, req.document_id, quiz_data["title"], req.difficulty, req.format, json.dumps(quiz_data["questions"])))
    conn.commit()
    conn.close()

    quiz_data["id"] = quiz_id
    return quiz_data

@app.get("/api/quizzes/{id}")
def get_quiz(id: str):
    conn = get_connection()
    row = conn.execute("SELECT * FROM quizzes WHERE id = ?", (id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Quiz not found")
    res = dict(row)
    res["questions"] = json.loads(res["questions_json"])
    return res

class QuizSubmitRequest(BaseModel):
    answers: List[Any]
    time_taken_seconds: Optional[int] = 0
    mode: Optional[str] = "assessment"

@app.post("/api/quizzes/{id}/submit")
def submit_quiz_answers(id: str, sub: QuizSubmitRequest):
    conn = get_connection()
    q_count = conn.execute("SELECT count(*) FROM quiz_questions WHERE quiz_id = ?", (id,)).fetchone()[0]
    conn.close()

    if q_count > 0:
        return submit_quiz_evaluation(id, sub.answers, sub.time_taken_seconds or 0, sub.mode or "assessment")

    conn = get_connection()
    row = conn.execute("SELECT * FROM quizzes WHERE id = ?", (id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Quiz not found")

    questions = json.loads(row["questions_json"]) if row["questions_json"] else []
    q_map = {q.get("id"): q for q in questions if isinstance(q, dict)}

    total = len(questions)
    correct_count = 0
    results_detail = []

    for ans in sub.answers:
        q_id = ans.get("question_id")
        user_choice = ans.get("selected_answer", "").strip()
        q = q_map.get(q_id)
        if not q:
            continue

        is_correct = (user_choice.lower() == q["correct_answer"].strip().lower())
        if is_correct:
            correct_count += 1

        results_detail.append({
            "question_id": q_id,
            "question": q["question"],
            "selected_answer": user_choice,
            "correct_answer": q["correct_answer"],
            "is_correct": is_correct,
            "explanation": q.get("explanation", ""),
            "mistake_analysis": q.get("mistake_analysis", ""),
            "source_citation": q.get("source_citation", "")
        })

    accuracy = round((correct_count / total * 100)) if total > 0 else 0
    incorrect_count = total - correct_count

    # Save attempt
    att_id = f"att_{uuid.uuid4().hex[:8]}"
    conn.execute("""
    INSERT INTO quiz_attempts (id, quiz_id, score, total_questions, correct_count, incorrect_count, accuracy, answers_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (att_id, id, correct_count, total, correct_count, incorrect_count, accuracy, json.dumps(results_detail)))

    # Dynamically update topic and document learning progress based on actual quiz result
    topic_id = row["topic_id"]
    doc_id = row["document_id"]
    if topic_id:
        new_status = 'Completed' if accuracy >= 80 else ('Understood' if accuracy >= 60 else 'Needs Revision')
        conn.execute("UPDATE topics SET status = ?, progress = MAX(progress, ?) WHERE id = ?", (new_status, accuracy, topic_id))
    if doc_id:
        conn.execute("UPDATE documents SET progress = MAX(progress, ?) WHERE id = ?", (accuracy, doc_id))

    conn.commit()
    conn.close()

    return {
        "attempt_id": att_id,
        "score": correct_count,
        "total": total,
        "accuracy": accuracy,
        "correct_count": correct_count,
        "incorrect_count": incorrect_count,
        "results": results_detail
    }

@app.get("/api/quizzes/attempts/history")
def get_quiz_history():
    conn = get_connection()
    rows = conn.execute("""
    SELECT qa.*, q.title as quiz_title, q.difficulty, q.format, s.name as subject_name
    FROM quiz_attempts qa
    JOIN quizzes q ON qa.quiz_id = q.id
    LEFT JOIN subjects s ON q.subject_id = s.id
    ORDER BY qa.completed_at DESC LIMIT 15
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ----------------- NOTES & FLASHCARDS ----------------- #
@app.get("/api/notes")
def get_notes(subject_id: Optional[str] = None, note_type: Optional[str] = None):
    conn = get_connection()
    query = """
    SELECT n.*, s.name as subject_name, s.color as subject_color, t.name as topic_name
    FROM notes n
    LEFT JOIN subjects s ON n.subject_id = s.id
    LEFT JOIN topics t ON n.topic_id = t.id
    WHERE 1=1
    """
    params = []
    if subject_id and subject_id != "all":
        query += " AND n.subject_id = ?"
        params.append(subject_id)
    if note_type and note_type != "all":
        query += " AND n.note_type = ?"
        params.append(note_type)

    query += " ORDER BY n.updated_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

class NoteCreate(BaseModel):
    title: str
    subject_id: Optional[str] = None
    topic_id: Optional[str] = None
    note_type: str = "quick_revision"
    content: str

@app.post("/api/notes")
def create_note(n: NoteCreate):
    conn = get_connection()
    note_id = f"note_{uuid.uuid4().hex[:8]}"
    conn.execute("""
    INSERT INTO notes (id, subject_id, topic_id, title, note_type, content)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (note_id, n.subject_id, n.topic_id, n.title, n.note_type, n.content))
    conn.commit()
    conn.close()
    return {"id": note_id, "title": n.title}

class NoteGenerateRequest(BaseModel):
    subject_id: Optional[str] = None
    topic_id: Optional[str] = None
    note_type: str = "quick_revision" # quick_revision, detailed_study, exam_notes, one_page, flashcards, formula_sheet, important_questions
    title: str = "Generated MBA Notes"

@app.post("/api/notes/generate")
def generate_note_endpoint(req: NoteGenerateRequest):
    note_data = generate_notes_for_topic(
        subject_id=req.subject_id,
        topic_id=req.topic_id,
        note_type=req.note_type,
        title=req.title
    )
    note_id = f"note_{uuid.uuid4().hex[:8]}"
    conn = get_connection()
    conn.execute("""
    INSERT INTO notes (id, subject_id, topic_id, title, note_type, content)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (note_id, req.subject_id, req.topic_id, note_data["title"], req.note_type, note_data["content"]))
    conn.commit()
    conn.close()
    note_data["id"] = note_id
    return note_data

@app.delete("/api/notes/{id}")
def delete_note(id: str):
    conn = get_connection()
    conn.execute("DELETE FROM notes WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return {"success": True}

# ----------------- PROGRESS & RECOMMENDATIONS ----------------- #
@app.get("/api/progress")
def get_learning_progress():
    conn = get_connection()
    c = conn.cursor()

    subjects = c.execute("""
    SELECT s.id, s.name, s.color, s.semester,
           COUNT(DISTINCT t.id) as total_topics,
           SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) as completed_topics,
           SUM(CASE WHEN t.status = 'Needs Revision' THEN 1 ELSE 0 END) as revision_topics,
           COALESCE(AVG(t.progress), 0) as avg_progress
    FROM subjects s
    LEFT JOIN topics t ON s.id = t.subject_id
    GROUP BY s.id
    """).fetchall()

    recommendations = [
        {
            "type": "quiz_mistake",
            "topic": "Product Roadmaps",
            "subject": "Product Management",
            "reason": "Scored 40% in recent practice questions. Recommended: Review Agile roadmaps & stakeholder trade-offs.",
            "action": "Take Quiz"
        },
        {
            "type": "needs_revision",
            "topic": "Capital Budgeting",
            "subject": "Finance",
            "reason": "Marked for revision 4 days ago. Key topics: NPV, IRR, and payback period formulas.",
            "action": "Revise Notes"
        },
        {
            "type": "next_up",
            "topic": "Market Segmentation & STP",
            "subject": "Marketing Management",
            "reason": "Ready for MBA examination level self-assessment quiz.",
            "action": "Learn Topic"
        }
    ]

    conn.close()
    return {
        "subject_progress": [dict(s) for s in subjects],
        "recommendations": recommendations,
        "study_streak_days": 6,
        "weekly_hours_studied": 18.5
    }

# ----------------- SETTINGS ----------------- #
@app.get("/api/settings")
def get_settings():
    api_key = get_configured_api_key()
    has_key = bool(api_key and len(api_key) > 5)
    masked_key = (api_key[:4] + "..." + api_key[-4:]) if has_key else ""
    return {
        "user_name": "Vishal Singh",
        "program": "Master of Business Administration (MBA)",
        "has_gemini_api_key": has_key,
        "masked_gemini_api_key": masked_key,
        "theme": "light",
        "version": "1.0.0"
    }

class SettingsUpdate(BaseModel):
    gemini_api_key: Optional[str] = None
    theme: Optional[str] = "light"

@app.post("/api/settings")
def update_settings(data: SettingsUpdate):
    conn = get_connection()
    if data.gemini_api_key is not None:
        conn.execute("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('gemini_api_key', ?)", (data.gemini_api_key.strip(),))
    if data.theme:
        conn.execute("INSERT OR REPLACE INTO user_settings (key, value) VALUES ('theme', ?)", (data.theme,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Settings updated successfully"}

@app.post("/api/settings/reset-sample")
def reset_sample_data():
    seed_all_data()
    return {"success": True, "message": "Sample MBA curriculum re-initialized successfully"}

# ----------------- PRESENTATION LEARNING & DETAILED SUMMARY ----------------- #
@app.post("/api/presentations/{doc_id}/analyze")
def api_analyze_presentation(doc_id: str):
    try:
        summary = analyze_presentation(doc_id)
        return {"success": True, "summary": summary}
    except Exception as e:
        print(f"Notice in api_analyze_presentation: {e}")
        return {"success": True, "summary": {}, "warning": str(e)}

@app.get("/api/presentations/{doc_id}/summary")
def api_get_presentation_summary(doc_id: str):
    conn = get_connection()
    row = conn.execute("SELECT * FROM presentation_summaries WHERE document_id = ?", (doc_id,)).fetchone()
    conn.close()
    if not row:
        # Generate summary automatically if not already generated
        try:
            summary = analyze_presentation(doc_id)
            return summary
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Summary not found: {e}")
    return {
        "id": row["id"],
        "document_id": row["document_id"],
        "title": row["title"],
        "overview": json.loads(row["overview_json"]),
        "concepts": json.loads(row["concepts_json"]),
        "frameworks": json.loads(row["frameworks_json"]),
        "glossary": json.loads(row["glossary_json"]),
        "formulas": json.loads(row["formulas_json"]),
        "connections": json.loads(row["connections_json"]),
        "slide_summaries": json.loads(row["slide_summaries_json"]),
        "revision": json.loads(row["revision_json"]),
        "learning_path": json.loads(row["learning_path_json"])
    }

@app.get("/api/presentations/{doc_id}/session")
def api_get_presentation_session(doc_id: str):
    conn = get_connection()
    row = conn.execute("SELECT * FROM presentation_learning_sessions WHERE document_id = ?", (doc_id,)).fetchone()
    conn.close()
    if not row:
        # Initialize
        analyze_presentation(doc_id)
        conn = get_connection()
        row = conn.execute("SELECT * FROM presentation_learning_sessions WHERE document_id = ?", (doc_id,)).fetchone()
        conn.close()
    
    return {
        "id": row["id"],
        "document_id": row["document_id"],
        "current_module_id": row["current_module_id"],
        "current_concept_name": row["current_concept_name"],
        "current_slide_number": row["current_slide_number"],
        "understood_concepts": json.loads(row["understood_concepts"] or "[]"),
        "revision_needed_concepts": json.loads(row["revision_needed_concepts"] or "[]"),
        "messages": json.loads(row["messages_json"] or "[]")
    }

class SessionUpdateRequest(BaseModel):
    current_module_id: Optional[str] = None
    current_concept_name: Optional[str] = None
    current_slide_number: Optional[int] = None
    mark_understood: Optional[str] = None
    mark_revision: Optional[str] = None

@app.post("/api/presentations/{doc_id}/session")
def api_update_presentation_session(doc_id: str, req: SessionUpdateRequest):
    conn = get_connection()
    row = conn.execute("SELECT * FROM presentation_learning_sessions WHERE document_id = ?", (doc_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Session not found")
    
    understood = json.loads(row["understood_concepts"] or "[]")
    revision = json.loads(row["revision_needed_concepts"] or "[]")

    if req.mark_understood:
        if req.mark_understood not in understood:
            understood.append(req.mark_understood)
        if req.mark_understood in revision:
            revision.remove(req.mark_understood)
            
    if req.mark_revision:
        if req.mark_revision not in revision:
            revision.append(req.mark_revision)
        if req.mark_revision in understood:
            understood.remove(req.mark_revision)

    curr_mod = req.current_module_id if req.current_module_id is not None else row["current_module_id"]
    curr_concept = req.current_concept_name if req.current_concept_name is not None else row["current_concept_name"]
    curr_slide = req.current_slide_number if req.current_slide_number is not None else row["current_slide_number"]

    conn.execute("""
    UPDATE presentation_learning_sessions
    SET current_module_id = ?, current_concept_name = ?, current_slide_number = ?,
        understood_concepts = ?, revision_needed_concepts = ?, last_accessed = CURRENT_TIMESTAMP
    WHERE document_id = ?
    """, (curr_mod, curr_concept, curr_slide, json.dumps(understood), json.dumps(revision), doc_id))
    
    # Update document progress
    summary_row = conn.execute("SELECT concepts_json FROM presentation_summaries WHERE document_id = ?", (doc_id,)).fetchone()
    if summary_row:
        all_concepts = json.loads(summary_row["concepts_json"])
        if all_concepts:
            pct = int((len(understood) / len(all_concepts)) * 100)
            conn.execute("UPDATE documents SET progress = ?, last_accessed = CURRENT_TIMESTAMP WHERE id = ?", (pct, doc_id))
    
    conn.commit()
    conn.close()

    return {
        "success": True,
        "understood_concepts": understood,
        "revision_needed_concepts": revision,
        "current_concept_name": curr_concept,
        "current_slide_number": curr_slide
    }

class TeachRequest(BaseModel):
    concept_name: str
    control_action: Optional[str] = None
    teaching_mode: Optional[str] = "MBA"

@app.post("/api/presentations/{doc_id}/teach")
def api_teach_presentation_concept(doc_id: str, req: TeachRequest):
    try:
        teaching_mode = req.teaching_mode or "MBA"
        pkg = get_concept_teaching_package(doc_id, req.concept_name, req.control_action, teaching_mode)
        return pkg
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class TutorChatRequest(BaseModel):
    query: str
    concept_name: str
    slide_number: Optional[int] = 1

@app.post("/api/presentations/{doc_id}/chat")
def api_presentation_tutor_chat(doc_id: str, req: TutorChatRequest):
    try:
        resp = process_tutor_conversation(doc_id, req.query, req.concept_name, req.slide_number or 1)
        return resp
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/presentations/{doc_id}/chat")
def api_get_presentation_chat_history(doc_id: str):
    conn = get_connection()
    sess = conn.execute("SELECT messages_json FROM presentation_learning_sessions WHERE document_id = ?", (doc_id,)).fetchone()
    conn.close()
    if not sess or not sess["messages_json"]:
        return {"messages": []}
    return {"messages": json.loads(sess["messages_json"])}

@app.delete("/api/presentations/{doc_id}/chat")
def api_clear_presentation_chat(doc_id: str):
    conn = get_connection()
    conn.execute("UPDATE presentation_learning_sessions SET messages_json = '[]' WHERE document_id = ?", (doc_id,))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/api/presentations/{doc_id}/flashcards")
def api_get_presentation_flashcards(doc_id: str):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM presentation_flashcards WHERE document_id = ? ORDER BY slide_number ASC", (doc_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/presentations/{doc_id}/flashcards/{card_id}/master")
def api_master_flashcard(doc_id: str, card_id: str):
    conn = get_connection()
    conn.execute("UPDATE presentation_flashcards SET mastered = 1 WHERE id = ? AND document_id = ?", (card_id, doc_id))
    conn.commit()
    conn.close()
    return {"success": True}

@app.get("/api/presentations/{doc_id}/export-printable")
def api_export_presentation_printable(doc_id: str):
    conn = get_connection()
    row = conn.execute("SELECT * FROM presentation_summaries WHERE document_id = ?", (doc_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Summary not found")
    
    overview = json.loads(row["overview_json"])
    concepts = json.loads(row["concepts_json"])
    frameworks = json.loads(row["frameworks_json"])
    revision = json.loads(row["revision_json"])

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{overview.get('title')} — Detailed MBA Summary</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; padding: 40px; max-width: 900px; margin: 0 auto; }}
        h1 {{ color: #1e40af; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }}
        h2 {{ color: #2563eb; margin-top: 30px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; }}
        h3 {{ color: #0f172a; margin-top: 20px; }}
        .badge {{ display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; }}
        .box {{ background: #f8fafc; border-left: 4px solid #3b82f6; padding: 14px 18px; margin: 15px 0; border-radius: 0 8px 8px 0; }}
        .meta {{ color: #64748b; font-size: 14px; margin-bottom: 20px; }}
        ul {{ padding-left: 20px; }}
        li {{ margin-bottom: 6px; }}
    </style>
</head>
<body>
    <span class="badge">VISHAL SINGH — MBA Executive Study Material</span>
    <h1>{overview.get('title')}</h1>
    <div class="meta">Subject: {overview.get('subject')} | Total Slides: {overview.get('total_slides')} | Grounded MBA Summary</div>
    
    <div class="box">
        <strong>Central Objective:</strong> {overview.get('central_objective')}
    </div>

    <h2>1. Concept-by-Concept Detailed Breakdown</h2>
"""
    for c in concepts:
        html += f"""
        <h3>{c.get('name')} <span style="font-size: 12px; color: #64748b;">(Slides {', '.join(map(str, c.get('slide_numbers', [])))})</span></h3>
        <p><strong>Definition:</strong> {c.get('definition')}</p>
        <p>{c.get('detailed_explanation')}</p>
        <div class="box">
            <strong>Real-World Case Example:</strong> {c.get('example')}
        </div>
        <ul>
            {''.join([f"<li>{pt}</li>" for pt in c.get('key_points', [])])}
        </ul>
"""

    if frameworks:
        html += "<h2>2. Strategic Frameworks & Decision Models</h2>"
        for fw in frameworks:
            html += f"""
            <h3>{fw.get('name')}</h3>
            <p><strong>Why Used:</strong> {fw.get('why_used')}</p>
            <p><strong>How It Works:</strong> {fw.get('how_works')}</p>
            <p><strong>Step-by-Step Example:</strong> {fw.get('step_by_step_example')}</p>
"""

    html += f"""
    <h2>3. High-Yield Revision Sheet (Exam Prep)</h2>
    <h3>Must-Know Key Takeaways</h3>
    <ul>
        {''.join([f"<li>{pt}</li>" for pt in revision.get('must_know_points', [])])}
    </ul>
    <h3>Likely MBA Exam Questions</h3>
    <ul>
        {''.join([f"<li><strong>{q}</strong></li>" for q in revision.get('likely_exam_questions', [])])}
    </ul>
</body>
</html>"""
    return HTMLResponse(content=html)

# ----------------- ORIGINAL PPT VIEWER & ASSETS ----------------- #
@app.get("/api/presentations/{doc_id}/slides")
def api_get_presentation_slides(doc_id: str):
    conn = get_connection()
    doc = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if not doc:
        conn.close()
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = doc["file_path"]
    doc_name = doc["name"]
    conn.close()

    if not os.path.exists(file_path):
        conn = get_connection()
        chunks = conn.execute("SELECT slide_number, title, content FROM document_chunks WHERE document_id = ? ORDER BY slide_number ASC", (doc_id,)).fetchall()
        conn.close()
        slides = []
        for c in chunks:
            s_num = c["slide_number"]
            title = c["title"]
            lines = [l.strip() for l in c["content"].split("\n") if l.strip()]
            slides.append({
                "slide_number": s_num,
                "title": title,
                "aspect_ratio": "16:9",
                "shapes": [
                    {"type": "text", "is_title": True, "left": 8.0, "top": 8.0, "width": 84.0, "height": 14.0, "paragraphs": [{"text": title, "is_title": True}]},
                    {"type": "text", "is_title": False, "left": 8.0, "top": 26.0, "width": 84.0, "height": 65.0, "paragraphs": [{"text": l, "is_title": False} for l in lines[:8]]}
                ],
                "notes": ""
            })
        return {
            "document_id": doc_id,
            "document_name": doc_name,
            "total_slides": len(slides),
            "aspect_ratio": "16:9",
            "slides": slides,
            "download_url": f"/api/documents/{doc_id}/download"
        }

    slides = extract_slide_layouts(file_path, doc_id)
    ratio = slides[0].get("aspect_ratio", "16:9") if slides else "16:9"
    return {
        "document_id": doc_id,
        "document_name": doc_name,
        "total_slides": len(slides),
        "aspect_ratio": ratio,
        "slides": slides,
        "download_url": f"/api/documents/{doc_id}/download"
    }

@app.get("/api/documents/{doc_id}/download")
def api_download_original_document(doc_id: str):
    conn = get_connection()
    doc = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    conn.close()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = doc["file_path"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File is not available on disk")

    filename = doc["original_filename"] or doc["name"]
    media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation" if filename.lower().endswith(".pptx") else "application/octet-stream"
    return FileResponse(file_path, filename=filename, media_type=media_type)

@app.get("/api/documents/{doc_id}/assets/{asset_name}")
def api_get_document_asset(doc_id: str, asset_name: str):
    assets_dir = tempfile.gettempdir() if is_cloud_env() else os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "uploads")
    safe_name = os.path.basename(asset_name)
    path = os.path.join(assets_dir, safe_name)
    if os.path.exists(path):
        return FileResponse(path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Asset not found")

# ----------------- CONCEPT-BY-CONCEPT 5-QUESTION QUIZZES ----------------- #
@app.get("/api/presentations/{doc_id}/quiz-catalog")
def api_get_quiz_catalog(doc_id: str):
    cat = get_presentation_quiz_catalog(doc_id)
    return {"catalog": cat, "total": len(cat)}

@app.get("/api/presentations/{doc_id}/concepts/{concept_name}/quiz-prep")
def api_get_quiz_prep(doc_id: str, concept_name: str):
    return get_concept_quiz_prep(doc_id, concept_name)

class QuizCreateReq(BaseModel):
    difficulty: Optional[str] = "Medium"
    force_regenerate: Optional[bool] = False

@app.post("/api/presentations/{doc_id}/concepts/{concept_name}/quiz")
def api_generate_concept_quiz(doc_id: str, concept_name: str, req: QuizCreateReq = QuizCreateReq()):
    try:
        return generate_or_get_concept_quiz(doc_id, concept_name, req.difficulty or "Medium", req.force_regenerate or False, count=5)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/api/quizzes/{quiz_id}/regenerate")
def api_regenerate_quiz(quiz_id: str):
    conn = get_connection()
    quiz = conn.execute("SELECT * FROM quizzes WHERE id = ?", (quiz_id,)).fetchone()
    conn.close()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return generate_or_get_concept_quiz(quiz["document_id"], quiz["concept_name"], quiz["difficulty"], force_regenerate=True, count=5)

# ----------------- STUDY TRACKING & LEARNING PROGRESS ----------------- #
class StudySessionReq(BaseModel):
    subject_id: Optional[str] = None
    document_id: Optional[str] = None
    doc_id: Optional[str] = None
    concept_name: Optional[str] = None
    duration_seconds: int
    activity_type: Optional[str] = "learning"

@app.post("/api/study/session")
def api_record_study_session(req: StudySessionReq):
    target_doc_id = req.document_id or req.doc_id
    return record_study_session(
        req.subject_id, target_doc_id, req.concept_name,
        req.duration_seconds, req.activity_type or "learning"
    )

class ConceptStatusReq(BaseModel):
    status: str

@app.post("/api/presentations/{doc_id}/concepts/{concept_name}/status")
def api_update_concept_status(doc_id: str, concept_name: str, req: ConceptStatusReq):
    return update_concept_status(doc_id, concept_name, req.status)

@app.get("/api/progress/analytics")
def api_get_learning_analytics():
    stats = get_learning_analytics()
    cards = get_subject_progress_cards()
    return {
        "global_stats": stats,
        "metrics": stats,
        "subject_cards": cards,
        "subject_progress": cards,
        "presentation_progress": get_presentation_progress_list(),
        "recommendations": get_study_recommendations(),
        "daily_chart": get_daily_study_time_chart()
    }

# ----------------- SMART FLASHCARDS (SM-2 SPACED REPETITION) ----------------- #
class FlashcardCreateReq(BaseModel):
    front: str
    back: str
    concept_name: Optional[str] = "General"
    subject_id: Optional[str] = None
    document_id: Optional[str] = None
    slide_number: Optional[int] = 1
    difficulty: Optional[str] = "Medium"

class FlashcardReviewReq(BaseModel):
    rating: int # 0=Again, 1=Difficult, 2=Good, 3=Easy

@app.get("/api/flashcards/due")
def api_get_due_flashcards(subject_id: Optional[str] = None, document_id: Optional[str] = None):
    cards = get_due_flashcards(user_id="user_vishal", subject_id=subject_id, document_id=document_id)
    return {"due_flashcards": cards, "count": len(cards)}

@app.get("/api/flashcards")
def api_get_all_flashcards(subject_id: Optional[str] = None, document_id: Optional[str] = None):
    cards = get_all_flashcards(user_id="user_vishal", subject_id=subject_id, document_id=document_id)
    return {"flashcards": cards, "count": len(cards)}

@app.post("/api/flashcards")
def api_create_flashcard(req: FlashcardCreateReq):
    return create_flashcard(
        front=req.front, back=req.back, concept_name=req.concept_name or "General",
        subject_id=req.subject_id, document_id=req.document_id,
        slide_number=req.slide_number or 1, difficulty=req.difficulty or "Medium"
    )

@app.post("/api/flashcards/{card_id}/review")
def api_review_flashcard(card_id: str, req: FlashcardReviewReq):
    try:
        return review_flashcard(card_id, req.rating, user_id="user_vishal")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/documents/{doc_id}/generate-flashcards")
def api_generate_flashcards_from_doc(doc_id: str):
    try:
        cards = generate_smart_flashcards_from_doc(doc_id, user_id="user_vishal")
        return {"success": True, "created_cards": cards, "total": len(cards)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- DOUBT NOTEBOOK ----------------- #
class DoubtCreateReq(BaseModel):
    title: str
    doubt_text: str
    subject_id: Optional[str] = None
    document_id: Optional[str] = None
    concept_name: Optional[str] = ""
    slide_number: Optional[int] = 1
    tags: Optional[List[str]] = None
    auto_resolve: Optional[bool] = True

class DoubtStatusReq(BaseModel):
    status: str # Unresolved, Understood, Needs Revision

class DoubtResolveReq(BaseModel):
    clarification_prompt: Optional[str] = ""

@app.get("/api/doubts")
def api_get_doubts(subject_id: Optional[str] = None, document_id: Optional[str] = None, status: Optional[str] = None, search: Optional[str] = None):
    doubts = get_doubts(user_id="user_vishal", subject_id=subject_id, document_id=document_id, status=status, search=search)
    return {"doubts": doubts, "count": len(doubts)}

@app.post("/api/doubts")
def api_create_doubt(req: DoubtCreateReq):
    return create_doubt(
        title=req.title, doubt_text=req.doubt_text,
        subject_id=req.subject_id, document_id=req.document_id,
        concept_name=req.concept_name or "", slide_number=req.slide_number or 1,
        tags=req.tags, auto_resolve=req.auto_resolve if req.auto_resolve is not None else True
    )

@app.patch("/api/doubts/{doubt_id}/status")
def api_update_doubt_status(doubt_id: str, req: DoubtStatusReq):
    try:
        return update_doubt_status(doubt_id, req.status, user_id="user_vishal")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/doubts/{doubt_id}/resolve")
def api_resolve_doubt_ai(doubt_id: str, req: DoubtResolveReq = DoubtResolveReq()):
    try:
        return resolve_doubt_with_ai(doubt_id, req.clarification_prompt or "", user_id="user_vishal")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/doubts/{doubt_id}/to-flashcard")
def api_convert_doubt_flashcard(doubt_id: str):
    try:
        return convert_doubt_to_flashcard(doubt_id, user_id="user_vishal")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- AI BUSINESS CASES (6 ROLES & 8 RUBRICS) ----------------- #
class CaseGenerateReq(BaseModel):
    role: Optional[str] = "Product Manager"
    industry: Optional[str] = None
    difficulty: Optional[str] = "Medium"
    subject_id: Optional[str] = None
    document_id: Optional[str] = None

class CaseSubmitReq(BaseModel):
    solution_text: str

@app.get("/api/cases")
def api_list_cases(subject_id: Optional[str] = None, role: Optional[str] = None):
    cases = get_business_cases(user_id="user_vishal", subject_id=subject_id, role=role)
    return {"cases": cases, "count": len(cases), "roles": list(ROLE_TEMPLATES.keys())}

@app.post("/api/cases/generate")
def api_generate_case(req: CaseGenerateReq):
    try:
        return generate_business_case(
            subject_id=req.subject_id, document_id=req.document_id,
            role=req.role or "Product Manager", industry=req.industry,
            difficulty=req.difficulty or "Medium", user_id="user_vishal"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/cases/{case_id}/submit")
def api_submit_case(case_id: str, req: CaseSubmitReq):
    try:
        return submit_case_solution(case_id, req.solution_text, user_id="user_vishal")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- AI INTERVIEW PREPARATION (4 MODES) ----------------- #
class InterviewStartReq(BaseModel):
    role: Optional[str] = "Product Manager"
    mode: Optional[str] = "product_sense"
    difficulty: Optional[str] = "Medium"
    subject_id: Optional[str] = None

class InterviewAnswerReq(BaseModel):
    question_index: int
    answer_text: str

@app.get("/api/interviews/history")
def api_get_interview_history(subject_id: Optional[str] = None):
    hist = get_interview_history(user_id="user_vishal", subject_id=subject_id)
    return {"history": hist, "count": len(hist)}

@app.post("/api/interviews/start")
def api_start_interview(req: InterviewStartReq):
    try:
        return start_interview_session(
            subject_id=req.subject_id, role=req.role or "Product Manager",
            mode=req.mode or "product_sense", difficulty=req.difficulty or "Medium",
            user_id="user_vishal"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/interviews/{session_id}/answer")
def api_submit_interview_answer(session_id: str, req: InterviewAnswerReq):
    try:
        return submit_interview_answer(session_id, req.question_index, req.answer_text, user_id="user_vishal")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- DETERMINISTIC MBA CALCULATORS ----------------- #
class LtvCacReq(BaseModel):
    arpu: float
    gross_margin_pct: float
    monthly_churn_pct: float
    cac: float

class NpvReq(BaseModel):
    initial_investment: float
    discount_rate_pct: float
    cash_flows: List[float]

class BreakevenReq(BaseModel):
    fixed_costs: float
    selling_price_per_unit: float
    variable_cost_per_unit: float
    expected_sales_units: Optional[float] = 0

class EoqReq(BaseModel):
    annual_demand: float
    order_cost_per_order: float
    holding_cost_per_unit_year: float

class RiceReq(BaseModel):
    reach: float
    impact: float
    confidence_pct: float
    effort_person_weeks: float

class WaccReq(BaseModel):
    market_value_equity: float
    market_value_debt: float
    cost_of_equity_pct: float
    cost_of_debt_pct: float
    tax_rate_pct: float

@app.post("/api/calculator/ltv-cac")
def api_calc_ltv_cac(req: LtvCacReq):
    try:
        return calculate_ltv_cac(req.arpu, req.gross_margin_pct, req.monthly_churn_pct, req.cac)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/calculator/npv-payback")
def api_calc_npv(req: NpvReq):
    try:
        return calculate_npv_payback(req.initial_investment, req.discount_rate_pct, req.cash_flows)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/calculator/breakeven")
def api_calc_breakeven(req: BreakevenReq):
    try:
        return calculate_breakeven(req.fixed_costs, req.selling_price_per_unit, req.variable_cost_per_unit, req.expected_sales_units or 0)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/calculator/eoq")
def api_calc_eoq(req: EoqReq):
    try:
        return calculate_eoq_inventory(req.annual_demand, req.order_cost_per_order, req.holding_cost_per_unit_year)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/calculator/rice")
def api_calc_rice(req: RiceReq):
    try:
        return calculate_rice_score(req.reach, req.impact, req.confidence_pct, req.effort_person_weeks)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/calculator/wacc")
def api_calc_wacc(req: WaccReq):
    try:
        return calculate_wacc(req.market_value_equity, req.market_value_debt, req.cost_of_equity_pct, req.cost_of_debt_pct, req.tax_rate_pct)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ----------------- BUSINESS FRAMEWORKS LIBRARY ----------------- #
class FrameworkNotesReq(BaseModel):
    notes: str
    linked_doc_id: Optional[str] = None

@app.get("/api/frameworks")
def api_get_frameworks(category: Optional[str] = None, search: Optional[str] = None):
    fw = get_all_frameworks(category=category, search=search)
    return {"frameworks": fw, "count": len(fw)}

@app.get("/api/frameworks/{framework_id}")
def api_get_framework_detail(framework_id: str):
    fw = get_framework_by_id(framework_id, user_id="user_vishal")
    if not fw:
        raise HTTPException(status_code=404, detail="Framework not found")
    return fw

@app.post("/api/frameworks/{framework_id}/notes")
def api_save_framework_notes(framework_id: str, req: FrameworkNotesReq):
    return save_framework_notes(framework_id, req.notes, req.linked_doc_id, user_id="user_vishal")

# ----------------- EXAM PREPARATION & MOCK EXAMS ----------------- #
class ExamPlanReq(BaseModel):
    subject_id: str
    duration_days: Optional[int] = 7
    exam_date: Optional[str] = None

class MockExamGenReq(BaseModel):
    subject_id: str
    document_id: Optional[str] = None
    question_count: Optional[int] = 10
    time_limit_minutes: Optional[int] = 30

class MockExamSubmitReq(BaseModel):
    answers: Dict[str, Any]

@app.get("/api/exams/plans")
def api_get_exam_plans(subject_id: Optional[str] = None):
    plans = get_exam_plans(user_id="user_vishal", subject_id=subject_id)
    return {"plans": plans, "count": len(plans)}

@app.post("/api/exams/plans/generate")
def api_generate_exam_plan(req: ExamPlanReq):
    try:
        return generate_exam_plan(req.subject_id, req.duration_days or 7, req.exam_date, user_id="user_vishal")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/exams/mock/generate")
def api_generate_mock_exam(req: MockExamGenReq):
    try:
        return generate_mock_exam(
            req.subject_id, req.document_id,
            req.question_count or 10, req.time_limit_minutes or 30,
            user_id="user_vishal"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/exams/mock/{mock_id}/submit")
def api_submit_mock_exam(mock_id: str, req: MockExamSubmitReq):
    try:
        return submit_mock_exam(mock_id, req.answers, user_id="user_vishal")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- PREREQUISITES & DIAGNOSTIC GAPS ----------------- #
@app.get("/api/prerequisites/gaps")
def api_get_prerequisite_gaps(subject_id: Optional[str] = None):
    return {"gaps": analyze_student_prerequisite_gaps(user_id="user_vishal", subject_id=subject_id)}

# ----------------- CROSS-PRESENTATION SEARCH & SYNTHESIS ----------------- #
class CrossSynthesizeReq(BaseModel):
    query: str
    subject_id: Optional[str] = None

@app.get("/api/search/cross-presentation")
def api_cross_search(query: str = Query(...), subject_id: Optional[str] = None, limit: int = 15):
    return cross_search_presentations(query=query, subject_id=subject_id, limit=limit)

@app.post("/api/search/cross-presentation/synthesize")
def api_synthesize_cross_search(req: CrossSynthesizeReq):
    return synthesize_cross_presentation_query(query=req.query, subject_id=req.subject_id)

# ----------------- CONFIDENCE & 2x2 KNOWLEDGE MATRIX ----------------- #
class ConfidenceLogReq(BaseModel):
    quiz_attempt_id: Optional[str] = None
    question_id: str
    confidence_level: str # Guessing, Somewhat Confident, Very Confident
    is_correct: bool

@app.post("/api/confidence/log")
def api_log_confidence(req: ConfidenceLogReq):
    return log_confidence_entry(req.quiz_attempt_id, req.question_id, req.confidence_level, req.is_correct)

@app.get("/api/confidence/matrix")
def api_get_confidence_matrix():
    return get_confidence_matrix_analytics(user_id="user_vishal")

# ----------------- EXPORT TOOLS (MARKDOWN & JSON) ----------------- #
@app.get("/api/export/notes/markdown")
def api_export_notes_markdown():
    conn = get_connection()
    notes = conn.execute("SELECT n.*, s.name as subject_name FROM notes n LEFT JOIN subjects s ON n.subject_id = s.id ORDER BY n.created_at DESC").fetchall()
    summaries = conn.execute("SELECT ps.*, COALESCE(d.name, d.original_filename, 'Presentation') as filename FROM presentation_summaries ps JOIN documents d ON ps.document_id = d.id").fetchall()
    conn.close()

    md = "# VISHAL SINGH LMS — Study Notes & Master Summaries\n\n"
    md += f"Generated on: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n---\n\n"

    for s in summaries:
        md += f"## Presentation Summary: {s['filename']}\n"
        try:
            ov = json.loads(s["overview_json"])
            md += f"**Core Essence:** {ov.get('core_essence', '')}\n\n"
        except Exception:
            pass
        try:
            rev = json.loads(s["revision_sheet_json"])
            md += "### Key Takeaways:\n"
            for pt in rev.get("must_know_points", []):
                md += f"- {pt}\n"
            md += "\n"
        except Exception:
            pass

    for n in notes:
        n_dict = dict(n)
        subj = n_dict.get("subject_name") or "General"
        md += f"## Note: {n_dict['title']} ({subj})\n\n{n_dict['content']}\n\n---\n\n"

    return Response(
        content=md,
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=Vishal_Singh_MBA_Notes.md"}
    )

@app.get("/api/export/progress/json")
def api_export_progress_json():
    conn = get_connection()
    stats = get_learning_analytics()
    cards = get_subject_progress_cards()
    attempts = [dict(r) for r in conn.execute("SELECT * FROM quiz_attempts ORDER BY completed_at DESC LIMIT 50").fetchall()]
    milestones = [dict(r) for r in conn.execute("SELECT * FROM user_milestones ORDER BY achieved_at DESC").fetchall()]
    conn.close()

    payload = {
        "user": "Vishal Singh",
        "exported_at": datetime.utcnow().isoformat(),
        "analytics": stats,
        "subjects": cards,
        "recent_quiz_attempts": attempts,
        "achieved_milestones": milestones
    }
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": "attachment; filename=Vishal_Singh_LMS_Progress.json"}
    )

# ----------------- STATIC FRONTEND SERVING ----------------- #
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/")
@app.get("/api/index.py")
@app.get("/api/index")
def serve_index():
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read(), status_code=200)
    return JSONResponse({"message": "VISHAL SINGH API is running. Frontend index not found."})

@app.get("/{full_path:path}")
def serve_spa_paths(full_path: str):
    if full_path in ("api/index.py", "api/index", "index.py", "index.html", ""):
        return serve_index()
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
        
    rel_path = full_path
    if rel_path.startswith("static/"):
        rel_path = rel_path[7:]

    potential_file = os.path.join(FRONTEND_DIR, rel_path)
    if os.path.isfile(potential_file):
        media_type = "text/plain"
        if rel_path.endswith(".js"):
            media_type = "application/javascript"
        elif rel_path.endswith(".css"):
            media_type = "text/css"
        elif rel_path.endswith(".html"):
            media_type = "text/html"
        elif rel_path.endswith(".png"):
            media_type = "image/png"
        elif rel_path.endswith(".svg"):
            media_type = "image/svg+xml"
        try:
            with open(potential_file, "rb") as f:
                return Response(content=f.read(), media_type=media_type)
        except Exception:
            return FileResponse(potential_file)
            
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read(), status_code=200)
    raise HTTPException(status_code=404, detail="Page not found")
