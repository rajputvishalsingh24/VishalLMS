"""
VISHAL SINGH LMS - Confidence & 2x2 Knowledge Matrix Engine
Tracks student metacognition by pairing subjective confidence levels with objective test accuracy:
- Mastered (High Confidence + Correct)
- Dangerous Misconception (High Confidence + Incorrect)
- Lucky Guess / Shaky Ground (Low Confidence + Correct)
- Known Gap (Low Confidence + Incorrect)
"""

import uuid
from typing import Dict, Any, List, Optional
from backend.database import get_db

def log_confidence_entry(
    quiz_attempt_id: Optional[str],
    question_id: str,
    confidence_level: str,
    is_correct: bool
) -> Dict[str, Any]:
    """Record an individual question's confidence and outcome."""
    valid_levels = ["Guessing", "Somewhat Confident", "Very Confident"]
    conf = confidence_level if confidence_level in valid_levels else "Somewhat Confident"

    entry_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO confidence_logs (id, quiz_attempt_id, question_id, confidence_level, is_correct)
            VALUES (?, ?, ?, ?, ?)
        """, (entry_id, quiz_attempt_id, question_id, conf, 1 if is_correct else 0))
        conn.commit()

    return {
        "id": entry_id,
        "question_id": question_id,
        "confidence_level": conf,
        "is_correct": is_correct
    }


def get_confidence_matrix_analytics(user_id: str = "user_vishal") -> Dict[str, Any]:
    """Compute the 2x2 Metacognitive Knowledge Matrix."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT confidence_level, is_correct, COUNT(*) as count
            FROM confidence_logs
            GROUP BY confidence_level, is_correct
        """)
        rows = cursor.fetchall()

    quadrants = {
        "mastered": 0,             # Very Confident + Correct
        "dangerous_blindspot": 0,  # Very Confident + Incorrect (DANGEROUS)
        "shaky_ground": 0,         # Guessing / Somewhat + Correct
        "known_gap": 0             # Guessing / Somewhat + Incorrect
    }

    total_logs = 0
    for r in rows:
        conf = r["confidence_level"]
        correct = bool(r["is_correct"])
        cnt = r["count"]
        total_logs += cnt

        if conf == "Very Confident":
            if correct:
                quadrants["mastered"] += cnt
            else:
                quadrants["dangerous_blindspot"] += cnt
        else:
            if correct:
                quadrants["shaky_ground"] += cnt
            else:
                quadrants["known_gap"] += cnt

    return {
        "total_evaluated_questions": total_logs,
        "matrix": quadrants,
        "summary": {
            "mastered_pct": round((quadrants["mastered"] / total_logs) * 100, 1) if total_logs > 0 else 0,
            "blindspots_count": quadrants["dangerous_blindspot"],
            "requires_urgent_review": quadrants["dangerous_blindspot"] > 0
        },
        "advisory": (
            "Caution: You have identified high-confidence misconceptions. Prioritize reviewing the 'Dangerous Blindspots' before your exam."
            if quadrants["dangerous_blindspot"] > 0 else
            "Great metacognitive calibration! Your confidence accurately correlates with correctness."
        )
    }
