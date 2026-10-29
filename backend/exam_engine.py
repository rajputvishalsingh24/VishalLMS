"""
VISHAL SINGH LMS - Exam Preparation & Mock Exam Engine
Provides structured revision plans (1, 3, 7, 14 days) and balanced full-length mock exams.
"""

import json
import uuid
import datetime
from typing import Dict, Any, List, Optional
from backend.database import get_db

def generate_exam_plan(
    subject_id: str,
    duration_days: int = 7,
    exam_date: Optional[str] = None,
    user_id: str = "user_vishal"
) -> Dict[str, Any]:
    """Generate an intensive daily study roadmap for an upcoming examination."""
    duration_days = duration_days if duration_days in [1, 3, 7, 14] else 7
    if not exam_date:
        exam_date = (datetime.datetime.utcnow() + datetime.timedelta(days=duration_days)).strftime("%Y-%m-%d")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM subjects WHERE id = ?", (subject_id,))
        sub_row = cursor.fetchone()
        subject_name = sub_row["name"] if sub_row else "MBA Subject"

        cursor.execute("SELECT id, name, original_filename, slide_count FROM documents WHERE subject_id = ?", (subject_id,))
        docs = [dict(d) for d in cursor.fetchall()]

    schedule = []
    total_docs = len(docs)

    if duration_days == 1:
        # Cram Mode
        schedule = [
            {
                "day": 1,
                "title": "Rapid Concept Sprint & High-Yield Formulas",
                "focus": "Review all key definitions, summary cheatsheets, and solve 2 diagnostic quizzes.",
                "target_hours": 4.5,
                "milestones": [
                    "Morning: Scan Presentation Summaries & Core Frameworks (2 hrs)",
                    "Afternoon: Spaced Repetition Flashcard Blitz (1 hr)",
                    "Evening: Full-Length Timed Mock Exam & Error Review (1.5 hrs)"
                ]
            }
        ]
    elif duration_days == 3:
        schedule = [
            {
                "day": 1,
                "title": "Foundations & High-Weightage Chapters",
                "focus": "Review primary lecture presentations, map key frameworks, and clear pending doubts.",
                "target_hours": 3.0,
                "milestones": [
                    "Review top 50% presentation slides & take notes",
                    "Complete 1 Concept Quiz per document"
                ]
            },
            {
                "day": 2,
                "title": "Quantitative Problems & Case Scenarios",
                "focus": "Master mathematical calculations (NPV, Breakeven, LTV:CAC) and complete 1 business case.",
                "target_hours": 3.5,
                "milestones": [
                    "Execute 3 MBA formula simulations in Calculator Hub",
                    "Solve 1 simulated role-based business case study"
                ]
            },
            {
                "day": 3,
                "title": "Full Mock Exam & Final Recall",
                "focus": "Complete 30-minute timed mock exam, review high-risk misconceptions, rest before exam.",
                "target_hours": 2.5,
                "milestones": [
                    "Take Timed Mock Exam (30 mins)",
                    "Audit 2x2 Knowledge Matrix for high-confidence errors",
                    "Final Flashcard review sweep"
                ]
            }
        ]
    elif duration_days == 7:
        schedule = [
            {"day": 1, "title": "Diagnostic Assessment & Scope Mapping", "focus": "Review syllabus, audit uploaded PPTs, take diagnostic quiz.", "target_hours": 2.0, "milestones": ["Audit all subject documents", "Identify 3 weakest topic areas"]},
            {"day": 2, "title": "Core Theoretical Frameworks", "focus": "SWOT, Porter's 5 Forces, PESTEL, and strategic theories.", "target_hours": 2.5, "milestones": ["Deep-dive 4 strategy frameworks", "Review Doubt Notebook"]},
            {"day": 3, "title": "Quantitative & Numerical Deep Dive", "focus": "Formulas, financial models, break-even, and operational metrics.", "target_hours": 3.0, "milestones": ["Run 4 formula calculations", "Resolve calculation doubts"]},
            {"day": 4, "title": "Midway Mock Exam #1", "focus": "Simulate real exam conditions with timed 15-question test.", "target_hours": 2.5, "milestones": ["Complete Mock Exam #1", "Analyze mistake explanations"]},
            {"day": 5, "title": "Case Studies & Practical Application", "focus": "Product sense, marketing attribution, and executive decision-making.", "target_hours": 3.0, "milestones": ["Submit 1 Business Case solution", "Complete 1 Interview simulation"]},
            {"day": 6, "title": "Spaced Repetition & High-Yield Flashcards", "focus": "Active recall on all due cards and formula constants.", "target_hours": 2.5, "milestones": ["Clear 100% of due flashcards", "Review revision sheet summaries"]},
            {"day": 7, "title": "Final Mock Exam & Exam Strategy", "focus": "Timed Mock Exam #2, mental relaxation, and pacing check.", "target_hours": 2.0, "milestones": ["Complete Final Mock Exam", "Review high-yield exam checklist"]}
        ]
    else:  # 14 days
        for d in range(1, 15):
            schedule.append({
                "day": d,
                "title": f"Module {d}: Structured Mastery Phase",
                "focus": f"Systematic review of study blocks, daily 15-minute active recall, and case analysis.",
                "target_hours": 1.5,
                "milestones": [f"Study designated slides block {d}", "Review daily flashcards", "Solve 5-question checkpoint"]
            })

    plan_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO exam_plans (
                id, user_id, subject_id, title, exam_date,
                duration_days, daily_schedule_json, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')
        """, (
            plan_id, user_id, subject_id,
            f"{subject_name} — {duration_days}-Day Exam Mastery Plan",
            exam_date, duration_days, json.dumps(schedule)
        ))
        conn.commit()

    return {
        "id": plan_id,
        "subject_id": subject_id,
        "subject_name": subject_name,
        "duration_days": duration_days,
        "exam_date": exam_date,
        "schedule": schedule
    }


def get_exam_plans(user_id: str = "user_vishal", subject_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve active exam plans."""
    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT ep.*, s.name as subject_name FROM exam_plans ep LEFT JOIN subjects s ON ep.subject_id = s.id WHERE ep.user_id = ?"
        params = [user_id]
        if subject_id:
            query += " AND ep.subject_id = ?"
            params.append(subject_id)
        query += " ORDER BY ep.created_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        result = []
        for r in rows:
            item = dict(r)
            try:
                item["daily_schedule_json"] = json.loads(item["daily_schedule_json"])
            except Exception:
                pass
            result.append(item)
        return result


def generate_mock_exam(
    subject_id: str,
    document_id: Optional[str] = None,
    question_count: int = 10,
    time_limit_minutes: int = 30,
    user_id: str = "user_vishal"
) -> Dict[str, Any]:
    """Generate a realistic mock examination with anti-cheat answers hidden until submit."""
    question_count = max(5, min(20, question_count))

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM subjects WHERE id = ?", (subject_id,))
        sub_row = cursor.fetchone()
        subject_name = sub_row["name"] if sub_row else "MBA Mock Exam"

        # Gather pre-existing quiz questions or generate high-quality MBA questions
        cursor.execute("""
            SELECT qq.* FROM quiz_questions qq
            JOIN quizzes q ON qq.quiz_id = q.id
            WHERE q.subject_id = ?
            ORDER BY RANDOM() LIMIT ?
        """, (subject_id, question_count))
        existing_qs = cursor.fetchall()

    questions = []
    if existing_qs and len(existing_qs) >= 5:
        for idx, eq in enumerate(existing_qs[:question_count]):
            opts = json.loads(eq["options_json"])
            correct = json.loads(eq["correct_indices_json"])
            questions.append({
                "id": str(uuid.uuid4()),
                "index": idx + 1,
                "question": eq["question_text"],
                "type": eq["question_type"],
                "difficulty": eq["difficulty"],
                "options": opts,
                "correct_indices": correct,
                "explanation": eq["explanation"],
                "source_concept": eq["concept_name"]
            })
    else:
        # Generate rich standard mock exam questions
        standard_bank = [
            {
                "question": "Which of the following conditions most significantly threatens an incumbent's sustainable competitive advantage according to Porter's Five Forces?",
                "type": "single_choice",
                "difficulty": "Hard",
                "options": [
                    "High initial capital requirements for new market entrants",
                    "High buyer switching costs due to multi-year enterprise contracts",
                    "Low supplier concentration with many undifferentiated raw component providers",
                    "Rapid decline in multi-homing costs allowing consumers to alternate freely between platforms"
                ],
                "correct_indices": [3],
                "explanation": "When multi-homing costs drop, buyer power surges and threat of substitutes escalates, eroding the incumbent's pricing power.",
                "source_concept": "Competitive Strategy"
            },
            {
                "question": "A SaaS business reports ARPU = $120/month, Gross Margin = 80%, and Monthly Churn = 4%. Its CAC is $600. What is its LTV and LTV:CAC Ratio?",
                "type": "single_choice",
                "difficulty": "Medium",
                "options": [
                    "LTV = $1,800, LTV:CAC = 3.0x",
                    "LTV = $2,400, LTV:CAC = 4.0x",
                    "LTV = $3,000, LTV:CAC = 5.0x",
                    "LTV = $1,200, LTV:CAC = 2.0x"
                ],
                "correct_indices": [1],
                "explanation": "LTV = (ARPU * Gross Margin) / Churn = ($120 * 0.80) / 0.04 = $96 / 0.04 = $2,400. LTV:CAC = $2,400 / $600 = 4.0x.",
                "source_concept": "Unit Economics"
            },
            {
                "question": "Which criteria are core components of the RICE prioritization scoring model? (Select all that apply)",
                "type": "multiple_choice",
                "difficulty": "Medium",
                "options": [
                    "Reach (Number of people impacted over a time frame)",
                    "Impact (Expected contribution to key outcome)",
                    "Revenue (Immediate gross top-line generated)",
                    "Confidence (Degree of certainty in estimates)",
                    "Effort (Estimated person-weeks required)"
                ],
                "correct_indices": [0, 1, 3, 4],
                "explanation": "RICE stands for Reach, Impact, Confidence, and Effort. Revenue is not an independent parameter in the formula.",
                "source_concept": "Product Prioritization"
            },
            {
                "question": "If a manufacturing plant has fixed annual costs of $500,000, unit variable costs of $30, and unit selling price of $80, how many units must it produce to break even?",
                "type": "single_choice",
                "difficulty": "Medium",
                "options": [
                    "6,250 units",
                    "10,000 units",
                    "16,667 units",
                    "25,000 units"
                ],
                "correct_indices": [1],
                "explanation": "Contribution margin = $80 - $30 = $50. Break-even units = $500,000 / $50 = 10,000 units.",
                "source_concept": "Break-Even Analysis"
            },
            {
                "question": "In the BCG Growth-Share Matrix, how should executive management treat a business unit categorized as a 'Cash Cow'?",
                "type": "single_choice",
                "difficulty": "Easy",
                "options": [
                    "Reinvest 100% of generated profits into hyper-growth advertising",
                    "Liquidate the unit immediately as market share is under threat",
                    "Harvest steady cash flows to fund high-growth Stars and Question Marks",
                    "Merge the business unit with low-share Dogs to achieve economies of scale"
                ],
                "correct_indices": [2],
                "explanation": "Cash Cows have high relative market share in low-growth industries, generating high cash flow that funds other high-potential units.",
                "source_concept": "BCG Matrix"
            }
        ]

        for i, q in enumerate(standard_bank[:question_count]):
            q_copy = dict(q)
            q_copy["id"] = str(uuid.uuid4())
            q_copy["index"] = i + 1
            questions.append(q_copy)

    mock_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO mock_exams (
                id, user_id, subject_id, document_id, title,
                time_limit_minutes, questions_json, answers_json,
                total_questions, completed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, 0)
        """, (
            mock_id, user_id, subject_id, document_id,
            f"{subject_name} — Comprehensive Timed Mock Exam",
            time_limit_minutes, json.dumps(questions), len(questions)
        ))
        conn.commit()

    # Deliver client questions WITHOUT revealing correct answers before submission
    client_questions = []
    for q in questions:
        client_questions.append({
            "id": q["id"],
            "index": q["index"],
            "question": q["question"],
            "type": q["type"],
            "difficulty": q["difficulty"],
            "options": q["options"],
            "source_concept": q.get("source_concept", "")
        })

    return {
        "mock_exam_id": mock_id,
        "title": f"{subject_name} — Comprehensive Timed Mock Exam",
        "time_limit_minutes": time_limit_minutes,
        "total_questions": len(questions),
        "questions": client_questions
    }


def submit_mock_exam(mock_exam_id: str, answers: Dict[str, Any], user_id: str = "user_vishal") -> Dict[str, Any]:
    """Grade mock exam answers and deliver complete diagnostic breakdown."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM mock_exams WHERE id = ? AND user_id = ?", (mock_exam_id, user_id))
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Mock exam {mock_exam_id} not found")

        exam_obj = dict(row)
        questions = json.loads(exam_obj["questions_json"])

    total_q = len(questions)
    correct_count = 0
    results_breakdown = []

    for q in questions:
        q_id = q["id"]
        user_choice = answers.get(q_id, answers.get(str(q["index"]), []))
        if isinstance(user_choice, int):
            user_choice = [user_choice]
        elif not isinstance(user_choice, list):
            user_choice = []

        is_correct = sorted(user_choice) == sorted(q["correct_indices"])
        if is_correct:
            correct_count += 1

        results_breakdown.append({
            "question_id": q_id,
            "index": q["index"],
            "question": q["question"],
            "user_answers": user_choice,
            "correct_answers": q["correct_indices"],
            "is_correct": is_correct,
            "explanation": q["explanation"],
            "source_concept": q.get("source_concept", "")
        })

    accuracy = round((correct_count / total_q) * 100, 1) if total_q > 0 else 0.0

    now_str = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE mock_exams
            SET answers_json = ?,
                results_json = ?,
                score = ?,
                accuracy = ?,
                completed = 1,
                completed_at = ?
            WHERE id = ?
        """, (
            json.dumps(answers),
            json.dumps(results_breakdown),
            correct_count,
            accuracy,
            now_str,
            mock_exam_id
        ))

        if accuracy >= 80.0:
            cursor.execute("""
                INSERT OR IGNORE INTO user_milestones (id, user_id, milestone_key, title, description, badge_icon)
                VALUES (?, ?, 'mock_exam_ace_80', 'Exam Distinction', 'Achieved 80%+ on an official timed mock examination.', 'trophy')
            """, (str(uuid.uuid4()), user_id))

        conn.commit()

    return {
        "mock_exam_id": mock_exam_id,
        "score": correct_count,
        "total_questions": total_q,
        "accuracy": accuracy,
        "completed_at": now_str,
        "results": results_breakdown
    }
