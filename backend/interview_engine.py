"""
VISHAL SINGH LMS - AI Interview Preparation Engine
Simulates high-stakes MBA recruitment and technical interviews across 4 modes:
1. Concept Rigor
2. Product Sense
3. Case Interview
4. Behavioral (STAR method)
"""

import json
import uuid
import datetime
import os
from typing import Dict, Any, List, Optional
from backend.database import get_db

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

INTERVIEW_QUESTION_BANK = {
    "product_sense": [
        {
            "question": "How would you design an AI-first learning experience for executive MBA students who only have 20 minutes of study time per day?",
            "context": "Focus on user segmentation, time-boxing constraints, core pain points, 3 prioritized feature solutions, and a North Star metric.",
            "rubric": "User empathy (30%), Prioritization & Trade-offs (35%), Metrics & Vision (35%)"
        },
        {
            "question": "Imagine you are the Head of Product at Uber. Active driver retention has dipped by 9% in secondary metro markets. How do you diagnose and fix this?",
            "context": "Walk through root-cause decomposition (earnings, gamification, vehicle wear, incentives), hypothesis generation, and an A/B test proposal.",
            "rubric": "Diagnostic structure (40%), Solution feasibility (30%), Experiment design (30%)"
        },
        {
            "question": "Choose your favorite consumer app. What is one feature you would sunset tomorrow, and why?",
            "context": "Demonstrate strategic courage, understanding of maintenance overhead vs customer value, and how you would mitigate user backlash.",
            "rubric": "Strategic rationale (40%), Customer impact mitigation (30%), Telemetry (30%)"
        }
    ],
    "concept": [
        {
            "question": "Explain the difference between Customer Lifetime Value (LTV) calculated via simple ARPU versus cohort-based retention decay, and how cost of capital factors in.",
            "context": "Detail the mathematical formulation, why simple averages distort early churn spikes, and discount rate application.",
            "rubric": "Mathematical accuracy (40%), Practical business implications (35%), Clarity (25%)"
        },
        {
            "question": "Walk me through Porter's Five Forces and explain how digital network effects alter the threat of new entrants and supplier power.",
            "context": "Analyze direct vs indirect network effects, multi-homing costs, and switching moats.",
            "rubric": "Framework mastery (40%), Digital strategy nuance (40%), Real-world examples (20%)"
        },
        {
            "question": "When evaluating an M&A transaction, what is the precise economic distinction between accretive EPS and true NPV value creation?",
            "context": "Explain how P/E multiple arbitrage can mask value-destructive deals.",
            "rubric": "Financial rigor (50%), Strategic insight (30%), Precision (20%)"
        }
    ],
    "case": [
        {
            "question": "A national grocery chain is considering launching a 15-minute ultra-fast grocery delivery service. Estimate the annual market size in Tier-1 cities and determine the break-even basket size.",
            "context": "Structure your top-down market sizing, define rider economics (deliveries per hour, batching), and calculate required contribution margin per order.",
            "rubric": "Sizing logic (35%), Unit economics breakdown (35%), Synthesis & Recommendation (30%)"
        },
        {
            "question": "A premium subscription fitness app with 2M paying subscribers saw monthly churn rise from 3.5% to 5.2% over the last two quarters. Break down how you would identify the problem.",
            "context": "Use an MECE diagnostic tree covering user segments, pricing, app performance, content refresh cycle, and macro factors.",
            "rubric": "MECE problem tree (40%), Quantitative intuition (30%), Next steps (30%)"
        }
    ],
    "behavioral": [
        {
            "question": "Tell me about a time you had to make a high-stakes decision with incomplete data and strong disagreement from key senior stakeholders.",
            "context": "Structure your answer strictly using the STAR framework (Situation, Task, Action, Result). Highlight how you handled dissent and validated assumptions.",
            "rubric": "STAR structure (30%), Stakeholder management (35%), Quantifiable result & Learnings (35%)"
        },
        {
            "question": "Describe a project that failed or missed its core deadline under your leadership. What was your accountability and what systemic changes did you implement?",
            "context": "Focus on extreme ownership, post-mortem analysis, and lasting organizational resilience.",
            "rubric": "Ownership (40%), Root-cause post-mortem (30%), Long-term remedy (30%)"
        }
    ]
}


def start_interview_session(
    subject_id: Optional[str] = None,
    role: str = "Product Manager",
    mode: str = "product_sense",
    difficulty: str = "Medium",
    user_id: str = "user_vishal"
) -> Dict[str, Any]:
    """Initialize a structured interview session with tailored questions."""
    mode_key = mode if mode in INTERVIEW_QUESTION_BANK else "product_sense"
    questions = INTERVIEW_QUESTION_BANK[mode_key]

    session_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO interview_sessions (
                id, user_id, subject_id, role, mode, difficulty,
                current_q_index, questions_json, responses_json,
                evaluation_json, overall_score, completed
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, '[]', '{}', 0.0, 0)
        """, (
            session_id, user_id, subject_id, role, mode_key, difficulty,
            json.dumps(questions)
        ))
        conn.commit()

    return {
        "session_id": session_id,
        "role": role,
        "mode": mode_key,
        "difficulty": difficulty,
        "total_questions": len(questions),
        "current_question_index": 0,
        "current_question": questions[0]
    }


def submit_interview_answer(
    session_id: str,
    q_index: int,
    answer_text: str,
    user_id: str = "user_vishal"
) -> Dict[str, Any]:
    """Evaluate an individual question answer and advance the interview session."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM interview_sessions WHERE id = ? AND user_id = ?", (session_id, user_id))
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Interview session {session_id} not found")

        session_obj = dict(row)
        questions = json.loads(session_obj["questions_json"])
        responses = json.loads(session_obj["responses_json"] or "[]")

        if q_index >= len(questions):
            raise IndexError("Question index out of bounds")

        question = questions[q_index]

    api_key = os.environ.get("GEMINI_API_KEY")
    eval_item = None

    if genai and api_key and len(answer_text.strip()) > 25:
        try:
            client = genai.Client(api_key=api_key)
            prompt = f"""
            You are an elite Executive Interviewer evaluating an MBA candidate.
            Interview Mode: {session_obj.get('mode')}
            Target Role: {session_obj.get('role')}
            Question: {question.get('question')}
            Guidance Context: {question.get('context')}
            Student's Response:
            \"\"\"{answer_text}\"\"\"

            Return ONLY valid JSON matching:
            {{
                "score": 85.0,
                "feedback": "Direct evaluation of response strengths and gaps.",
                "structure_assessment": "How well the candidate framed and structured the response (e.g. MECE, STAR).",
                "key_highlights": ["Strong point 1", "Strong point 2"],
                "missed_opportunities": ["Missed point 1", "Missed point 2"],
                "model_answer_snippet": "A 1% benchmark response demonstrating how to ace this exact question."
            }}
            """
            resp = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            eval_item = json.loads(resp.text)
        except Exception:
            eval_item = None

    if not eval_item:
        words = len(answer_text.split())
        score = 68.0
        if words > 150:
            score += 16.0
        elif words > 80:
            score += 10.0

        if any(term in answer_text.lower() for term in ["metric", "kpi", "tradeoff", "user", "result", "framework"]):
            score += 6.0

        score = min(95.0, round(score, 1))

        eval_item = {
            "score": score,
            "feedback": f"Structured attempt addressing the core premise of {session_obj.get('role')} interview expectations. Strengthen concrete quantification and counter-metric considerations.",
            "structure_assessment": "Good sequential logic. In higher-tier rounds, articulate trade-offs upfront before detailing solutions.",
            "key_highlights": [
                "Promptly addressed the core stakeholder perspective.",
                "Demonstrated awareness of operational constraints."
            ],
            "missed_opportunities": [
                "Explicit risk-mitigation fallback plan.",
                "Clear leading vs lagging indicator differentiation."
            ],
            "model_answer_snippet": (
                "To tackle this systematically: 1) Clarify scope and identify primary user persona; "
                "2) Deconstruct current customer funnel friction using MECE analysis; "
                "3) Propose 3 mutually reinforcing interventions prioritized by Impact vs Effort; "
                "4) Establish a North Star Metric alongside 2 guardrail metrics to prevent unintended churn."
            )
        }

    responses.append({
        "question_index": q_index,
        "question": question["question"],
        "answer": answer_text,
        "evaluation": eval_item
    })

    next_index = q_index + 1
    is_completed = (next_index >= len(questions))

    # Calculate overall running score
    total_scores = [r["evaluation"]["score"] for r in responses]
    overall_score = round(sum(total_scores) / len(total_scores), 1)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE interview_sessions
            SET current_q_index = ?,
                responses_json = ?,
                overall_score = ?,
                completed = ?
            WHERE id = ?
        """, (
            next_index,
            json.dumps(responses),
            overall_score,
            1 if is_completed else 0,
            session_id
        ))

        if is_completed and overall_score >= 80.0:
            cursor.execute("""
                INSERT OR IGNORE INTO user_milestones (id, user_id, milestone_key, title, description, badge_icon)
                VALUES (?, ?, 'interview_ace_80', 'Interview Master', 'Scored 80%+ on an executive MBA interview simulation.', 'target')
            """, (str(uuid.uuid4()), user_id))

        conn.commit()

    return {
        "session_id": session_id,
        "current_question_index": next_index,
        "is_completed": is_completed,
        "evaluation": eval_item,
        "overall_score": overall_score,
        "next_question": questions[next_index] if not is_completed else None
    }


def get_interview_history(user_id: str = "user_vishal", subject_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve user's completed and active interview sessions."""
    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM interview_sessions WHERE user_id = ?"
        params = [user_id]
        if subject_id:
            query += " AND subject_id = ?"
            params.append(subject_id)
        query += " ORDER BY created_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()

        result = []
        for r in rows:
            item = dict(r)
            try:
                item["questions_json"] = json.loads(item["questions_json"])
            except Exception:
                pass
            try:
                item["responses_json"] = json.loads(item.get("responses_json") or "[]")
            except Exception:
                item["responses_json"] = []
            result.append(item)
        return result
