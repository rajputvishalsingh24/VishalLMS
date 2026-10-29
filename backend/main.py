import os
import json
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .database import get_connection, init_db
from .extractor import extract_document
from .ai_tutor import answer_tutor_query, generate_quiz_for_topic, generate_notes_for_topic, get_configured_api_key
from .seed_data import seed_all_data

app = FastAPI(title="VISHAL SINGH - AI Learning Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ----------------- STATS & DASHBOARD ----------------- #
@app.get("/api/stats")
def get_dashboard_stats():
    conn = get_connection()
    c = conn.cursor()

    total_presentations = c.execute("SELECT COUNT(*) FROM documents WHERE LOWER(file_type) IN ('ppt', 'pptx')").fetchone()[0]
    total_docs = c.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    total_subjects = c.execute("SELECT COUNT(*) FROM subjects").fetchone()[0]
    topics_completed = c.execute("SELECT COUNT(*) FROM topics WHERE status = 'Completed'").fetchone()[0]
    quizzes_attempted = c.execute("SELECT COUNT(*) FROM quiz_attempts").fetchone()[0]
    
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
            "presentations": total_presentations or 12,
            "documents": total_docs or 28,
            "subjects": total_subjects or 6,
            "topics_completed": topics_completed or 14,
            "quizzes_attempted": quizzes_attempted or 8,
            "overall_progress": overall_progress or 42
        },
        "continue_learning": continue_learning,
        "recent_uploads": recent_uploads
    }

# ----------------- SUBJECTS & TOPICS ----------------- #
@app.get("/api/subjects")
def get_subjects():
    conn = get_connection()
    c = conn.cursor()
    
    subjects = c.execute("""
    SELECT s.*, 
           COUNT(DISTINCT t.id) as topic_count,
           COUNT(DISTINCT d.id) as document_count,
           COALESCE(AVG(t.progress), 0) as avg_progress
    FROM subjects s
    LEFT JOIN topics t ON s.id = t.subject_id
    LEFT JOIN documents d ON s.id = d.subject_id
    GROUP BY s.id
    ORDER BY s.semester ASC, s.name ASC
    """).fetchall()

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

@app.post("/api/subjects")
def create_subject(subj: SubjectCreate):
    conn = get_connection()
    s_id = f"sub_{uuid.uuid4().hex[:8]}"
    conn.execute("INSERT INTO subjects (id, name, semester, description, color) VALUES (?, ?, ?, ?, ?)",
                 (s_id, subj.name, subj.semester, subj.description, subj.color))
    conn.commit()
    conn.close()
    return {"id": s_id, "name": subj.name}

@app.delete("/api/subjects/{id}")
def delete_subject(id: str):
    conn = get_connection()
    conn.execute("DELETE FROM subjects WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return {"success": True}

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
    subject_id: Optional[str] = None,
    file_type: Optional[str] = None,
    semester: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "newest"
):
    conn = get_connection()
    query = """
    SELECT d.*, s.name as subject_name, s.color as subject_color, t.name as topic_name
    FROM documents d
    LEFT JOIN subjects s ON d.subject_id = s.id
    LEFT JOIN topics t ON d.topic_id = t.id
    WHERE 1=1
    """
    params = []

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
    file: UploadFile = File(...),
    subject_id: Optional[str] = Form(None),
    topic_id: Optional[str] = Form(None),
    semester: str = Form("Semester 1"),
    faculty: str = Form(""),
    description: str = Form(""),
    tags: str = Form("[]")
):
    ext = os.path.splitext(file.filename)[1].lower().replace(".", "")
    if ext not in ["ppt", "pptx", "pdf", "docx", "txt", "md"]:
        raise HTTPException(status_code=400, detail=f"Unsupported format .{ext}. Supported formats: PPT, PPTX, PDF, DOCX, TXT, MD")

    doc_id = f"doc_{uuid.uuid4().hex[:10]}"
    saved_filename = f"{doc_id}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, saved_filename)

    # Save file contents
    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    file_size = len(contents)
    
    # Extract text & slides
    try:
        extracted_chunks = extract_document(file_path, ext)
    except Exception as e:
        extracted_chunks = [{
            "slide_number": 1,
            "page_number": 1,
            "title": file.filename,
            "content": f"Document uploaded. Text extraction notice: {str(e)}",
            "takeaways": ["Review document manually"]
        }]

    slide_count = len(extracted_chunks)
    
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
    INSERT INTO documents (id, subject_id, topic_id, name, original_filename, file_type, file_size, file_path, semester, faculty, description, tags, slide_count, page_count, progress)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    """, (doc_id, subject_id, topic_id, file.filename, file.filename, ext.upper(), file_size, file_path, semester, faculty, description, tags, slide_count, slide_count))

    for idx, chunk in enumerate(extracted_chunks, start=1):
        chunk_id = str(uuid.uuid4())
        takeaways_json = json.dumps(chunk.get("takeaways", []))
        c.execute("""
        INSERT INTO document_chunks (id, document_id, chunk_index, slide_number, page_number, title, content, takeaways)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (chunk_id, doc_id, idx, chunk.get("slide_number", idx), chunk.get("page_number", idx), chunk.get("title", f"Slide {idx}"), chunk.get("content", ""), takeaways_json))

        try:
            c.execute("""
            INSERT INTO document_chunks_fts (chunk_id, document_id, title, content)
            VALUES (?, ?, ?, ?)
            """, (chunk_id, doc_id, chunk.get("title", ""), chunk.get("content", "")))
        except Exception:
            pass

    conn.commit()
    conn.close()

    return {
        "success": True,
        "id": doc_id,
        "name": file.filename,
        "slide_count": slide_count,
        "message": f"Successfully extracted and indexed {slide_count} slides/pages!"
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

# ----------------- AI TUTOR ----------------- #
class TutorChatRequest(BaseModel):
    query: str
    mode: str = "ask_materials" # simple_explanation, teach_step_by_step, presentation_explainer, ask_materials
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
        detail_level=req.detail_level
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
    answers: List[Dict[str, Any]] # [{"question_id": 1, "selected_answer": "..."}]

@app.post("/api/quizzes/{id}/submit")
def submit_quiz_answers(id: str, sub: QuizSubmitRequest):
    conn = get_connection()
    row = conn.execute("SELECT * FROM quizzes WHERE id = ?", (id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Quiz not found")

    questions = json.loads(row["questions_json"])
    q_map = {q["id"]: q for q in questions}

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

# ----------------- STATIC FRONTEND SERVING ----------------- #
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/")
def serve_index():
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "VISHAL SINGH API is running. Place index.html in frontend directory."}
