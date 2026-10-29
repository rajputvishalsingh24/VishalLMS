import json
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from .database import get_connection

def record_study_session(
    subject_id: Optional[str],
    document_id: Optional[str],
    concept_name: Optional[str],
    duration_seconds: int,
    activity_type: str = "learning"
) -> Dict[str, Any]:
    """
    Records an active study session.
    Guards against unrealistic background tab tracking (caps at 2 hours per session).
    """
    if duration_seconds < 5:
        return {"success": False, "recorded": False, "reason": "Duration too short (<5s)"}

    safe_duration = min(duration_seconds, 7200)
    session_id = f"sess_{uuid.uuid4().hex[:10]}"
    conn = get_connection()

    conn.execute("""
    INSERT INTO study_sessions (id, subject_id, document_id, concept_name, start_time, duration_seconds, activity_type)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    """, (session_id, subject_id, document_id, concept_name or "", safe_duration, activity_type))

    # Update concept progress if concept_name provided
    if document_id and concept_name:
        conn.execute("""
        INSERT INTO concept_progress (id, document_id, concept_name, status, times_studied, last_studied)
        VALUES (?, ?, ?, 'In Progress', 1, CURRENT_TIMESTAMP)
        ON CONFLICT(document_id, concept_name) DO UPDATE SET
            times_studied = times_studied + 1,
            status = CASE WHEN status = 'Not Started' THEN 'In Progress' ELSE status END,
            last_studied = CURRENT_TIMESTAMP
        """, (f"cp_{uuid.uuid4().hex[:8]}", document_id, concept_name))

    conn.commit()
    conn.close()

    return {"success": True, "recorded": True, "session_id": session_id, "duration_recorded": safe_duration}

def update_concept_status(document_id: str, concept_name: str, status: str) -> Dict[str, Any]:
    """
    Manually updates or toggles concept status:
    Not Started, In Progress, Studied, Understood, Needs Revision, Completed.
    """
    valid_statuses = ["Not Started", "In Progress", "Studied", "Understood", "Needs Revision", "Completed"]
    if status not in valid_statuses:
        status = "Studied"

    conn = get_connection()
    conn.execute("""
    INSERT INTO concept_progress (id, document_id, concept_name, status, last_studied)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(document_id, concept_name) DO UPDATE SET
        status = excluded.status,
        last_studied = CURRENT_TIMESTAMP
    """, (f"cp_{uuid.uuid4().hex[:8]}", document_id, concept_name, status))

    conn.commit()
    conn.close()
    return {"success": True, "concept_name": concept_name, "status": status}

def get_learning_analytics() -> Dict[str, Any]:
    """
    Calculates genuine learning metrics directly from stored records.
    Zero fabricated numbers.
    """
    conn = get_connection()
    
    # 1. Total subjects & documents
    subj_count = conn.execute("SELECT count(*) FROM subjects").fetchone()[0]
    doc_count = conn.execute("SELECT count(*) FROM documents").fetchone()[0]
    
    # 2. Studied documents
    studied_docs = conn.execute("SELECT count(DISTINCT document_id) FROM study_sessions WHERE document_id IS NOT NULL").fetchone()[0]
    
    # 3. Concepts total & completed
    summaries = conn.execute("SELECT concepts_json FROM presentation_summaries").fetchall()
    total_identified_concepts = 0
    all_concept_keys = set()
    for s in summaries:
        try:
            clist = json.loads(s["concepts_json"])
            total_identified_concepts += len(clist)
        except Exception:
            pass

    completed_concepts = conn.execute(
        "SELECT count(*) FROM concept_progress WHERE status IN ('Understood', 'Completed')"
    ).fetchone()[0]
    
    needs_rev_concepts = conn.execute(
        "SELECT count(*) FROM concept_progress WHERE status = 'Needs Revision'"
    ).fetchone()[0]

    remaining_concepts = max(0, total_identified_concepts - completed_concepts)

    # 4. Quizzes attempted & accuracy
    quiz_stats = conn.execute("SELECT count(*), COALESCE(AVG(accuracy), 0) FROM quiz_attempts").fetchone()
    quizzes_attempted = quiz_stats[0]
    avg_accuracy = round(float(quiz_stats[1]), 1)

    # 5. Total study time
    time_row = conn.execute("SELECT COALESCE(SUM(duration_seconds), 0) FROM study_sessions").fetchone()
    total_seconds = int(time_row[0]) if time_row else 0
    
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    if hours > 0:
        time_formatted = f"{hours}h {minutes}m"
    elif minutes > 0:
        time_formatted = f"{minutes} mins"
    else:
        time_formatted = f"{total_seconds}s" if total_seconds > 0 else "0m"

    # 6. Overall progress percentage
    if total_identified_concepts > 0:
        overall_progress = min(100, int((completed_concepts / total_identified_concepts) * 100))
    elif doc_count > 0:
        overall_progress = min(100, int((studied_docs / doc_count) * 50))
    else:
        overall_progress = 0

    conn.close()

    return {
        "total_subjects": subj_count,
        "total_presentations": doc_count,
        "presentations_studied": studied_docs,
        "concepts_identified": total_identified_concepts,
        "concepts_completed": completed_concepts,
        "concepts_needs_revision": needs_rev_concepts,
        "concepts_remaining": remaining_concepts,
        "quizzes_attempted": quizzes_attempted,
        "quizzes_taken": quizzes_attempted,
        "average_quiz_accuracy": avg_accuracy,
        "avg_quiz_accuracy": avg_accuracy,
        "total_study_time_seconds": total_seconds,
        "total_study_minutes": total_seconds // 60,
        "study_time_formatted": time_formatted,
        "overall_progress_percentage": overall_progress
    }

def get_subject_progress_cards() -> List[Dict[str, Any]]:
    """
    Generates detailed progress cards for each subject.
    """
    conn = get_connection()
    subjects = conn.execute("SELECT * FROM subjects ORDER BY created_at ASC").fetchall()
    cards = []

    for s in subjects:
        s_id = s["id"]
        # Document count
        docs = conn.execute("SELECT id, name FROM documents WHERE subject_id = ?", (s_id,)).fetchall()
        doc_count = len(docs)
        doc_ids = [d["id"] for d in docs]
        
        # Studied docs
        if doc_ids:
            placeholders = ",".join(["?"] * len(doc_ids))
            studied_doc_count = conn.execute(
                f"SELECT count(DISTINCT document_id) FROM study_sessions WHERE document_id IN ({placeholders})",
                doc_ids
            ).fetchone()[0]
            
            # Concepts
            summaries = conn.execute(
                f"SELECT concepts_json FROM presentation_summaries WHERE document_id IN ({placeholders})",
                doc_ids
            ).fetchall()
            c_count = sum(len(json.loads(row["concepts_json"])) for row in summaries if row["concepts_json"])
            
            completed_c = conn.execute(
                f"SELECT count(*) FROM concept_progress WHERE document_id IN ({placeholders}) AND status IN ('Understood', 'Completed')",
                doc_ids
            ).fetchone()[0]

            # Quiz accuracy for this subject
            quiz_acc = conn.execute(
                f"SELECT COALESCE(AVG(accuracy), 0) FROM quiz_attempts WHERE document_id IN ({placeholders})",
                doc_ids
            ).fetchone()[0]
        else:
            studied_doc_count = 0
            c_count = 0
            completed_c = 0
            quiz_acc = 0.0

        remaining_c = max(0, c_count - completed_c)
        progress_pct = int((completed_c / c_count) * 100) if c_count > 0 else (int((studied_doc_count / doc_count) * 100) if doc_count > 0 else 0)

        cards.append({
            "subject_id": s_id,
            "subject_name": s["name"],
            "description": s["description"] or "MBA Curriculum",
            "color": s["color"] or "#3B82F6",
            "total_presentations": doc_count,
            "presentations_studied": studied_doc_count,
            "concepts_identified": c_count,
            "concepts_completed": completed_c,
            "concepts_remaining": remaining_c,
            "quiz_accuracy": round(float(quiz_acc), 1),
            "progress_percentage": min(100, progress_pct)
        })

    conn.close()
    return cards

def get_presentation_progress_list(subject_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Returns progress for individual presentations.
    """
    conn = get_connection()
    query = """
    SELECT d.id, d.name, d.original_filename, d.slide_count, d.subject_id, s.name as subject_name, d.created_at
    FROM documents d
    LEFT JOIN subjects s ON d.subject_id = s.id
    """
    params = []
    if subject_id:
        query += " WHERE d.subject_id = ?"
        params.append(subject_id)
    query += " ORDER BY d.created_at DESC"

    docs = conn.execute(query, params).fetchall()
    results = []

    for d in docs:
        d_id = d["id"]
        # Summary
        s_row = conn.execute("SELECT concepts_json FROM presentation_summaries WHERE document_id = ?", (d_id,)).fetchone()
        c_list = json.loads(s_row["concepts_json"]) if s_row and s_row["concepts_json"] else []
        total_concepts = len(c_list)

        # Concept statuses
        c_prog = conn.execute("SELECT status, concept_name FROM concept_progress WHERE document_id = ?", (d_id,)).fetchall()
        understood_count = sum(1 for cp in c_prog if cp["status"] in ("Understood", "Completed"))
        revision_count = sum(1 for cp in c_prog if cp["status"] == "Needs Revision")

        # Session last accessed
        sess = conn.execute("SELECT current_concept_name, last_accessed FROM presentation_learning_sessions WHERE document_id = ?", (d_id,)).fetchone()
        last_concept = sess["current_concept_name"] if sess and sess["current_concept_name"] else (c_list[0]["name"] if c_list else "")
        last_studied = sess["last_accessed"] if sess else d["created_at"]

        # Best quiz score
        best_quiz = conn.execute("SELECT MAX(accuracy), count(*) FROM quiz_attempts WHERE document_id = ?", (d_id,)).fetchone()
        best_score = best_quiz[0] if best_quiz and best_quiz[0] is not None else None
        quiz_count = best_quiz[1] if best_quiz else 0

        pct = int((understood_count / total_concepts) * 100) if total_concepts > 0 else 0

        results.append({
            "document_id": d_id,
            "title": d["name"].replace(".pptx", "").replace(".ppt", ""),
            "original_filename": d["original_filename"],
            "subject_name": d["subject_name"] or "MBA Subject",
            "slide_count": d["slide_count"] or 1,
            "concepts_identified": total_concepts,
            "concepts_understood": understood_count,
            "concepts_needs_revision": revision_count,
            "quiz_attempts": quiz_count,
            "best_quiz_score": best_score,
            "last_studied_concept": last_concept,
            "last_studied_date": last_studied,
            "completion_percentage": pct
        })

    conn.close()
    return results

def get_study_recommendations() -> List[Dict[str, Any]]:
    """
    Intelligent recommendation engine based on actual student activity:
    1. Concepts marked Needs Revision
    2. Concepts with low quiz score (<70%)
    3. Next unfinished concept in recent presentations
    """
    conn = get_connection()
    recommendations = []

    # 1. Check concepts requiring revision
    rev_rows = conn.execute("""
    SELECT cp.document_id, cp.concept_name, cp.best_quiz_score, d.name as doc_name, d.subject_id, s.name as subject_name
    FROM concept_progress cp
    JOIN documents d ON cp.document_id = d.id
    LEFT JOIN subjects s ON d.subject_id = s.id
    WHERE cp.status = 'Needs Revision' OR (cp.best_quiz_score > 0 AND cp.best_quiz_score < 70)
    ORDER BY cp.last_studied DESC LIMIT 2
    """).fetchall()

    for r in rev_rows:
        recommendations.append({
            "type": "revision",
            "concept_name": r["concept_name"],
            "document_id": r["document_id"],
            "document_name": r["doc_name"],
            "subject_name": r["subject_name"] or "MBA Core",
            "reason": f"Scored {r['best_quiz_score']}% on recent quiz. Recommended: review key framework before re-testing.",
            "action_label": "Revise Concept"
        })

    # 2. Check unfinished concepts
    summaries = conn.execute("""
    SELECT ps.document_id, ps.concepts_json, d.name as doc_name, s.name as subject_name
    FROM presentation_summaries ps
    JOIN documents d ON ps.document_id = d.id
    LEFT JOIN subjects s ON d.subject_id = s.id
    ORDER BY d.created_at DESC LIMIT 3
    """).fetchall()

    for s in summaries:
        if len(recommendations) >= 3:
            break
        c_list = json.loads(s["concepts_json"]) if s["concepts_json"] else []
        for c in c_list:
            c_name = c.get("name", "")
            prog = conn.execute("SELECT status FROM concept_progress WHERE document_id = ? AND LOWER(concept_name) = LOWER(?)", (s["document_id"], c_name)).fetchone()
            if not prog or prog["status"] in ("Not Started", "In Progress"):
                recommendations.append({
                    "type": "next_up",
                    "concept_name": c_name,
                    "document_id": s["document_id"],
                    "document_name": s["doc_name"],
                    "subject_name": s["subject_name"] or "MBA Core",
                    "reason": f"Next uncompleted concept in {s['doc_name']}. Ready for interactive AI teaching.",
                    "action_label": "Start Learning"
                })
                break

    conn.close()

    if not recommendations:
        recommendations.append({
            "type": "explore",
            "concept_name": "Executive Strategy & Frameworks",
            "document_id": "",
            "document_name": "Class Presentations",
            "subject_name": "MBA Platform",
            "reason": "Upload your first PowerPoint presentation to generate personalized learning recommendations.",
            "action_label": "Upload PPT"
        })

    return recommendations

def get_daily_study_time_chart() -> List[Dict[str, Any]]:
    """
    Returns study time in minutes grouped by day for the last 7 days.
    """
    conn = get_connection()
    chart = []
    today = datetime.utcnow().date()

    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        day_label = day.strftime("%a")

        row = conn.execute("""
        SELECT COALESCE(SUM(duration_seconds), 0)
        FROM study_sessions
        WHERE date(start_time) = ?
        """, (day_str,)).fetchone()

        secs = int(row[0]) if row else 0
        chart.append({
            "date": day_str,
            "day": day_label,
            "day_name": day_label,
            "minutes": round(secs / 60, 1),
            "seconds": secs
        })

    conn.close()
    return chart
