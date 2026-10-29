"""
VISHAL SINGH LMS - Doubt Notebook Engine
Persistent doubt capturing, AI resolution grounded in slide context,
status workflow (Unresolved, Understood, Needs Revision), and conversion to smart flashcards.
"""

import json
import uuid
import datetime
from typing import Dict, Any, List, Optional
from backend.database import get_db
from backend.ai_tutor import ask_ai_tutor_internal

def create_doubt(
    title: str,
    doubt_text: str,
    subject_id: Optional[str] = None,
    document_id: Optional[str] = None,
    concept_name: str = "",
    slide_number: int = 1,
    tags: Optional[List[str]] = None,
    user_id: str = "user_vishal",
    auto_resolve: bool = True
) -> Dict[str, Any]:
    """Capture a new doubt and optionally trigger an initial AI explanation."""
    doubt_id = str(uuid.uuid4())
    tags_json = json.dumps(tags or ["MBA", "Concept"])
    ai_resolution = ""

    if auto_resolve:
        prompt = f"Please resolve this doubt regarding '{concept_name or title}' (Slide {slide_number}): {doubt_text}. Provide a crystal-clear explanation, an intuitive real-world business example, and key takeaway points."
        try:
            res = ask_ai_tutor_internal(
                question=prompt,
                document_id=document_id,
                slide_number=slide_number,
                teaching_mode="MBA"
            )
            ai_resolution = res.get("response", "")
        except Exception as e:
            ai_resolution = f"Concept clarification for {title}: Focus on how this connects to core strategic decision making. Specific context: {doubt_text}"

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO doubt_notebook (
                id, user_id, subject_id, document_id, concept_name,
                title, doubt_text, ai_resolution, slide_number, status, tags
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unresolved', ?)
        """, (
            doubt_id, user_id, subject_id, document_id, concept_name,
            title, doubt_text, ai_resolution, slide_number, tags_json
        ))
        conn.commit()

    return {
        "id": doubt_id,
        "title": title,
        "doubt_text": doubt_text,
        "ai_resolution": ai_resolution,
        "concept_name": concept_name,
        "slide_number": slide_number,
        "status": "Unresolved",
        "tags": tags or []
    }


def get_doubts(
    user_id: str = "user_vishal",
    subject_id: Optional[str] = None,
    document_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Retrieve filtered doubts for the Doubt Notebook."""
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT dn.*, COALESCE(d.name, d.original_filename, 'Document') as document_name, s.name as subject_name
            FROM doubt_notebook dn
            LEFT JOIN documents d ON dn.document_id = d.id
            LEFT JOIN subjects s ON dn.subject_id = s.id
            WHERE dn.user_id = ?
        """
        params = [user_id]

        if subject_id:
            query += " AND dn.subject_id = ?"
            params.append(subject_id)
        if document_id:
            query += " AND dn.document_id = ?"
            params.append(document_id)
        if status and status.lower() != "all":
            query += " AND LOWER(dn.status) = LOWER(?)"
            params.append(status)
        if search:
            query += " AND (dn.title LIKE ? OR dn.doubt_text LIKE ? OR dn.concept_name LIKE ?)"
            term = f"%{search}%"
            params.extend([term, term, term])

        query += " ORDER BY dn.created_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()

        result = []
        for r in rows:
            item = dict(r)
            try:
                item["tags"] = json.loads(item.get("tags") or "[]")
            except Exception:
                item["tags"] = []
            result.append(item)
        return result


def update_doubt_status(doubt_id: str, status: str, user_id: str = "user_vishal") -> Dict[str, Any]:
    """Update status of a doubt: Unresolved, Understood, Needs Revision."""
    valid_statuses = ["Unresolved", "Understood", "Needs Revision"]
    matched = next((s for s in valid_statuses if s.lower() == status.lower()), None)
    if not matched:
        raise ValueError(f"Invalid status: {status}. Must be one of {valid_statuses}")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE doubt_notebook
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        """, (matched, doubt_id, user_id))
        conn.commit()

    return {"success": True, "doubt_id": doubt_id, "status": matched}


def resolve_doubt_with_ai(doubt_id: str, clarification_prompt: str = "", user_id: str = "user_vishal") -> Dict[str, Any]:
    """Ask AI tutor to provide a deep, grounded pedagogical answer to this doubt."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM doubt_notebook WHERE id = ? AND user_id = ?", (doubt_id, user_id))
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Doubt {doubt_id} not found")

        doubt = dict(row)
        q = f"Doubt Title: {doubt['title']}\nStudent Question: {doubt['doubt_text']}\nConcept: {doubt.get('concept_name', '')}"
        if clarification_prompt:
            q += f"\nFollow-up Question: {clarification_prompt}"

        res = ask_ai_tutor_internal(
            question=q,
            document_id=doubt.get("document_id"),
            slide_number=doubt.get("slide_number", 1),
            teaching_mode="MBA"
        )
        ai_resp = res.get("response", "")

        cursor.execute("""
            UPDATE doubt_notebook
            SET ai_resolution = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (ai_resp, doubt_id))
        conn.commit()

        return {"success": True, "doubt_id": doubt_id, "ai_resolution": ai_resp}


def convert_doubt_to_flashcard(doubt_id: str, user_id: str = "user_vishal") -> Dict[str, Any]:
    """Convert an understood doubt into an active SM-2 spaced repetition card."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM doubt_notebook WHERE id = ? AND user_id = ?", (doubt_id, user_id))
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Doubt {doubt_id} not found")
        doubt = dict(row)

        front = f"Concept Question: {doubt['title']}\n{doubt['doubt_text']}"
        back = doubt.get("ai_resolution") or "Review core definition and strategic application."

        card_id = str(uuid.uuid4())
        today = datetime.datetime.utcnow().strftime("%Y-%m-%d")

        cursor.execute("""
            INSERT INTO smart_flashcards (
                id, user_id, subject_id, document_id, concept_name, front, back,
                slide_number, difficulty, interval_days, ease_factor, repetitions, next_review_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Medium', 1, 2.5, 0, ?)
        """, (
            card_id, user_id, doubt.get("subject_id"), doubt.get("document_id"),
            doubt.get("concept_name") or doubt["title"], front, back,
            doubt.get("slide_number", 1), today
        ))

        cursor.execute("UPDATE doubt_notebook SET status = 'Understood', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (doubt_id,))
        conn.commit()

        return {
            "success": True,
            "flashcard_id": card_id,
            "message": "Converted doubt to smart flashcard successfully."
        }
