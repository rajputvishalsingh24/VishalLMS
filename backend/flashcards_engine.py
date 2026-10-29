"""
VISHAL SINGH LMS - Smart Flashcards Engine (SM-2 Spaced Repetition)
Implements the SuperMemo-2 (SM-2) spaced repetition algorithm:
- Again (0): Immediate reset, review today/tomorrow
- Difficult (1): Interval 1 day, decrease ease factor
- Good (2): Regular SM-2 interval increase
- Easy (3): Accelerated interval multiplier, increase ease factor
"""

import json
import uuid
import datetime
from typing import Dict, Any, List, Optional
from backend.database import get_db

def calculate_sm2(rating: int, repetitions: int, interval_days: int, ease_factor: float) -> Dict[str, Any]:
    """
    SuperMemo-2 (SM-2) algorithm calculation.
    Ratings:
      0: Again (Fail)
      1: Difficult (Hard recall)
      2: Good (Correct with effort)
      3: Easy (Effortless recall)
    """
    rating = max(0, min(3, int(rating)))
    new_repetitions = repetitions
    new_ease = ease_factor
    new_interval = interval_days

    # Update ease factor based on performance
    # Formula: EF' = EF + (0.1 - (3 - rating) * (0.08 + (3 - rating) * 0.02))
    diff = 3 - rating
    new_ease = ease_factor + (0.1 - diff * (0.08 + diff * 0.02))
    new_ease = max(1.3, round(new_ease, 2))

    if rating < 2:
        # Failed or highly difficult recall: reset repetitions
        new_repetitions = 0 if rating == 0 else 1
        new_interval = 1
    else:
        # Successful recall
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = max(1, round(interval_days * new_ease))
        
        if rating == 3:
            # Bonus for effortless recall
            new_interval = max(new_interval + 1, round(new_interval * 1.3))
        
        new_repetitions += 1

    next_date = (datetime.datetime.utcnow() + datetime.timedelta(days=new_interval)).strftime("%Y-%m-%d")

    return {
        "repetitions": new_repetitions,
        "interval_days": new_interval,
        "ease_factor": new_ease,
        "next_review_date": next_date
    }


def get_due_flashcards(user_id: str = "user_vishal", subject_id: Optional[str] = None, document_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve all flashcards due for review today or earlier."""
    today = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT sf.id, sf.subject_id, sf.document_id, sf.concept_name, sf.front, sf.back,
                   sf.slide_number, sf.difficulty, sf.interval_days, sf.ease_factor,
                   sf.repetitions, sf.next_review_date, sf.last_reviewed,
                   COALESCE(d.name, d.original_filename, 'Document') as document_name, s.name as subject_name
            FROM smart_flashcards sf
            LEFT JOIN documents d ON sf.document_id = d.id
            LEFT JOIN subjects s ON sf.subject_id = s.id
            WHERE sf.user_id = ?
              AND (sf.next_review_date IS NULL OR sf.next_review_date <= ?)
        """
        params = [user_id, today]

        if subject_id:
            query += " AND sf.subject_id = ?"
            params.append(subject_id)
        if document_id:
            query += " AND sf.document_id = ?"
            params.append(document_id)

        query += " ORDER BY sf.next_review_date ASC, sf.interval_days ASC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


def get_all_flashcards(user_id: str = "user_vishal", subject_id: Optional[str] = None, document_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve all flashcards for user with metadata."""
    with get_db() as conn:
        cursor = conn.cursor()
        query = """
            SELECT sf.id, sf.subject_id, sf.document_id, sf.concept_name, sf.front, sf.back,
                   sf.slide_number, sf.difficulty, sf.interval_days, sf.ease_factor,
                   sf.repetitions, sf.next_review_date, sf.last_reviewed,
                   COALESCE(d.name, d.original_filename, 'Document') as document_name, s.name as subject_name
            FROM smart_flashcards sf
            LEFT JOIN documents d ON sf.document_id = d.id
            LEFT JOIN subjects s ON sf.subject_id = s.id
            WHERE sf.user_id = ?
        """
        params = [user_id]
        if subject_id:
            query += " AND sf.subject_id = ?"
            params.append(subject_id)
        if document_id:
            query += " AND sf.document_id = ?"
            params.append(document_id)

        query += " ORDER BY sf.created_at DESC"
        cursor.execute(query, params)
        return [dict(r) for r in cursor.fetchall()]


def review_flashcard(card_id: str, rating: int, user_id: str = "user_vishal") -> Dict[str, Any]:
    """Process an SM-2 spaced repetition review for a card."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM smart_flashcards WHERE id = ? AND user_id = ?", (card_id, user_id))
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Flashcard {card_id} not found")

        current = dict(row)
        sm2_result = calculate_sm2(
            rating=rating,
            repetitions=current.get("repetitions", 0) or 0,
            interval_days=current.get("interval_days", 1) or 1,
            ease_factor=current.get("ease_factor", 2.5) or 2.5
        )

        now_str = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            UPDATE smart_flashcards
            SET repetitions = ?,
                interval_days = ?,
                ease_factor = ?,
                next_review_date = ?,
                last_reviewed = ?
            WHERE id = ?
        """, (
            sm2_result["repetitions"],
            sm2_result["interval_days"],
            sm2_result["ease_factor"],
            sm2_result["next_review_date"],
            now_str,
            card_id
        ))

        # Check for milestone (e.g. 10 reviews)
        cursor.execute("SELECT COUNT(*) as count FROM smart_flashcards WHERE last_reviewed IS NOT NULL AND user_id = ?", (user_id,))
        review_count = cursor.fetchone()["count"]
        if review_count >= 10:
            cursor.execute("""
                INSERT OR IGNORE INTO user_milestones (id, user_id, milestone_key, title, description, badge_icon)
                VALUES (?, ?, 'flashcard_master_10', 'Spaced Recall Pioneer', 'Completed 10 active spaced repetition reviews.', 'zap')
            """, (str(uuid.uuid4()), user_id))

        conn.commit()

        return {
            "success": True,
            "card_id": card_id,
            "rating": rating,
            **sm2_result,
            "last_reviewed": now_str
        }


def create_flashcard(
    front: str,
    back: str,
    concept_name: str = "General",
    subject_id: Optional[str] = None,
    document_id: Optional[str] = None,
    slide_number: int = 1,
    difficulty: str = "Medium",
    user_id: str = "user_vishal"
) -> Dict[str, Any]:
    """Create a new smart flashcard."""
    card_id = str(uuid.uuid4())
    today = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO smart_flashcards (
                id, user_id, subject_id, document_id, concept_name, front, back,
                slide_number, difficulty, interval_days, ease_factor, repetitions, next_review_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 2.5, 0, ?)
        """, (card_id, user_id, subject_id, document_id, concept_name, front, back, slide_number, difficulty, today))
        conn.commit()

    return {
        "id": card_id,
        "front": front,
        "back": back,
        "concept_name": concept_name,
        "interval_days": 1,
        "ease_factor": 2.5,
        "repetitions": 0,
        "next_review_date": today
    }


def generate_smart_flashcards_from_doc(document_id: str, user_id: str = "user_vishal") -> List[Dict[str, Any]]:
    """Automatically synthesize high-yield MBA flashcards from document concepts & slides."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, subject_id, name, original_filename FROM documents WHERE id = ?", (document_id,))
        doc = cursor.fetchone()
        if not doc:
            raise ValueError("Document not found")
        subject_id = doc["subject_id"]

        # Check presentation summaries first for rich concept breakdown
        cursor.execute("SELECT concepts_json, frameworks_json, glossary_json FROM presentation_summaries WHERE document_id = ?", (document_id,))
        summary = cursor.fetchone()

        cards_to_insert = []
        if summary:
            concepts = json.loads(summary["concepts_json"] or "[]")
            glossary = json.loads(summary["glossary_json"] or "[]")
            frameworks = json.loads(summary["frameworks_json"] or "[]")

            for c in concepts[:8]:
                c_name = c.get("name") or c.get("title") or "Key Concept"
                explanation = c.get("explanation") or c.get("description") or ""
                slide_num = c.get("slide_number") or c.get("slide_index") or 1
                if c_name and explanation:
                    cards_to_insert.append({
                        "front": f"What is the definition, strategic objective, and core mechanism of: {c_name}?",
                        "back": explanation,
                        "concept_name": c_name,
                        "slide_number": slide_num
                    })

            for g in glossary[:6]:
                term = g.get("term") or g.get("word")
                defn = g.get("definition") or g.get("meaning")
                if term and defn:
                    cards_to_insert.append({
                        "front": f"Define term: {term}",
                        "back": defn,
                        "concept_name": term,
                        "slide_number": 1
                    })

            for f in frameworks[:4]:
                f_name = f.get("name") or "Framework"
                f_desc = f.get("description") or f.get("components") or ""
                if f_name and f_desc:
                    cards_to_insert.append({
                        "front": f"Explain the structure and business application of the {f_name} framework.",
                        "back": str(f_desc),
                        "concept_name": f_name,
                        "slide_number": 1
                    })

        # Fallback to chunks/slides if summary is empty
        if not cards_to_insert:
            cursor.execute("SELECT slide_number, content FROM document_chunks WHERE document_id = ? ORDER BY slide_number ASC LIMIT 10", (document_id,))
            chunks = cursor.fetchall()
            for chunk in chunks:
                lines = [line.strip() for line in chunk["content"].split("\n") if line.strip() and len(line.strip()) > 10]
                if lines:
                    title = lines[0]
                    body = " ".join(lines[1:4]) if len(lines) > 1 else lines[0]
                    cards_to_insert.append({
                        "front": f"Explain key concept from Slide {chunk['slide_number']}: {title}",
                        "back": body,
                        "concept_name": title[:40],
                        "slide_number": chunk["slide_number"]
                    })

        created = []
        today = datetime.datetime.utcnow().strftime("%Y-%m-%d")
        for card in cards_to_insert:
            card_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO smart_flashcards (
                    id, user_id, subject_id, document_id, concept_name, front, back,
                    slide_number, difficulty, interval_days, ease_factor, repetitions, next_review_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Medium', 1, 2.5, 0, ?)
            """, (
                card_id, user_id, subject_id, document_id,
                card["concept_name"], card["front"], card["back"],
                card["slide_number"], today
            ))
            card["id"] = card_id
            created.append(card)

        conn.commit()
        return created
