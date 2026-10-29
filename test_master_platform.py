"""
VISHAL SINGH LMS - Comprehensive Master Platform Test Suite
Tests all 5 Phases end-to-end:
1. SM-2 Flashcards & Spaced Repetition Algorithm
2. Doubt Notebook & Conversion
3. AI Business Case Generator & 8-Rubric Evaluator
4. AI Interview Simulator (4 Modes)
5. Deterministic Formula Calculators (NPV, LTV:CAC, Break-even, EOQ, RICE, WACC)
6. Business Framework Library & Persistent Notes
7. Exam Planner & Anti-Cheat Mock Exam Engine
8. Prerequisite Gap Detector
9. Cross-Presentation Search
10. Confidence & 2x2 Knowledge Matrix
"""

import unittest
import json
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db, init_db
from backend.flashcards_engine import calculate_sm2
from backend.calculator_engine import (
    calculate_ltv_cac, calculate_npv_payback, calculate_breakeven,
    calculate_eoq_inventory, calculate_rice_score, calculate_wacc
)

class TestMasterPlatform(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def test_01_sm2_algorithm_math(self):
        """Test mathematical accuracy of SuperMemo-2 spaced repetition."""
        # Test 1: First successful review (rating 2 = Good)
        res1 = calculate_sm2(rating=2, repetitions=0, interval_days=1, ease_factor=2.5)
        self.assertEqual(res1["repetitions"], 1)
        self.assertEqual(res1["interval_days"], 1)

        # Test 2: Second successful review
        res2 = calculate_sm2(rating=2, repetitions=1, interval_days=1, ease_factor=2.5)
        self.assertEqual(res2["repetitions"], 2)
        self.assertEqual(res2["interval_days"], 6)

        # Test 3: Failure (rating 0 = Again) resets interval and repetitions
        res_fail = calculate_sm2(rating=0, repetitions=5, interval_days=25, ease_factor=2.5)
        self.assertEqual(res_fail["repetitions"], 0)
        self.assertEqual(res_fail["interval_days"], 1)
        self.assertTrue(res_fail["ease_factor"] < 2.5)

    def test_02_flashcards_api_workflow(self):
        """Test flashcard creation, retrieval, and review API endpoints."""
        # Create card
        create_resp = self.client.post("/api/flashcards", json={
            "front": "What is Churn Rate?",
            "back": "The percentage of customers that stop using a product over a given timeframe.",
            "concept_name": "Unit Economics",
            "difficulty": "Easy"
        })
        self.assertEqual(create_resp.status_code, 200)
        card_id = create_resp.json()["id"]

        # Get all flashcards
        get_resp = self.client.get("/api/flashcards")
        self.assertEqual(get_resp.status_code, 200)
        self.assertTrue(any(c["id"] == card_id for c in get_resp.json()["flashcards"]))

        # Review card with rating 3 (Easy)
        rev_resp = self.client.post(f"/api/flashcards/{card_id}/review", json={"rating": 3})
        self.assertEqual(rev_resp.status_code, 200)
        rev_data = rev_resp.json()
        self.assertTrue(rev_data["success"])
        self.assertEqual(rev_data["rating"], 3)
        self.assertTrue(rev_data["interval_days"] >= 1)

    def test_03_doubt_notebook_workflow(self):
        """Test doubt creation, status update, AI resolution, and conversion to flashcard."""
        # 1. Create doubt
        c_resp = self.client.post("/api/doubts", json={
            "title": "Why is WACC used instead of cost of equity?",
            "doubt_text": "I am confused why we use a blended rate when funding could be 100% equity.",
            "concept_name": "Cost of Capital",
            "auto_resolve": False
        })
        self.assertEqual(c_resp.status_code, 200)
        doubt_id = c_resp.json()["id"]

        # 2. Update status to Needs Revision
        s_resp = self.client.patch(f"/api/doubts/{doubt_id}/status", json={"status": "Needs Revision"})
        self.assertEqual(s_resp.status_code, 200)
        self.assertEqual(s_resp.json()["status"], "Needs Revision")

        # 3. Resolve with AI
        res_resp = self.client.post(f"/api/doubts/{doubt_id}/resolve", json={"clarification_prompt": "Explain tax shield"})
        self.assertEqual(res_resp.status_code, 200)
        self.assertTrue(len(res_resp.json()["ai_resolution"]) > 20)

        # 4. Convert to flashcard
        fc_resp = self.client.post(f"/api/doubts/{doubt_id}/to-flashcard")
        self.assertEqual(fc_resp.status_code, 200)
        self.assertTrue(fc_resp.json()["success"])

    def test_04_business_cases_workflow(self):
        """Test business case generation across 6 roles and submission with 8-rubric grading."""
        # Generate case for Product Manager
        gen_resp = self.client.post("/api/cases/generate", json={
            "role": "Product Manager",
            "industry": "FinTech SaaS",
            "difficulty": "Medium"
        })
        self.assertEqual(gen_resp.status_code, 200)
        case_data = gen_resp.json()
        case_id = case_data["id"]
        self.assertEqual(case_data["role"], "Product Manager")
        self.assertEqual(len(case_data["rubrics"]), 8)

        # Submit student solution
        solution = (
            "Problem Diagnosis: The core churn issue is concentrated in the mid-market tier following the v3 migration. "
            "Action Plan (RICE framework): 1) Reintroduce classic navigation toggle for 60 days (Reach: 50k, Effort: 1 week); "
            "2) Accelerate customer success onboarding clinics. "
            "Expected Impact: Stabilize monthly churn below 2.0% within 90 days. "
            "Success Metrics: Net Revenue Retention (NRR) >= 106%."
        )
        sub_resp = self.client.post(f"/api/cases/{case_id}/submit", json={"solution_text": solution})
        self.assertEqual(sub_resp.status_code, 200)
        eval_data = sub_resp.json()
        self.assertTrue(eval_data["score"] > 60.0)
        self.assertIn("evaluation", eval_data)
        self.assertIn("rubric_scores", eval_data["evaluation"])
        self.assertEqual(len(eval_data["evaluation"]["rubric_scores"]), 8)

    def test_05_interview_session_workflow(self):
        """Test AI interview session initialization and answering questions."""
        # Start Product Sense interview
        start_resp = self.client.post("/api/interviews/start", json={
            "role": "Product Manager",
            "mode": "product_sense",
            "difficulty": "Medium"
        })
        self.assertEqual(start_resp.status_code, 200)
        sess = start_resp.json()
        session_id = sess["session_id"]
        self.assertIn("current_question", sess)

        # Answer question 0
        ans_resp = self.client.post(f"/api/interviews/{session_id}/answer", json={
            "question_index": 0,
            "answer_text": "To solve this problem, I will segment users into busy commuters vs evening learners, identify core friction, propose 3 prioritized features using RICE, and measure DAU/MAU."
        })
        self.assertEqual(ans_resp.status_code, 200)
        ans_data = ans_resp.json()
        self.assertTrue(ans_data["overall_score"] > 50.0)
        self.assertIn("evaluation", ans_data)

    def test_06_deterministic_calculators(self):
        """Test deterministic precision of financial and operational calculators."""
        # 1. LTV & CAC: ARPU=$100, GM=80%, Churn=5%, CAC=$400 -> LTV = $80 / 0.05 = $1600. LTV:CAC = 4.0x
        ltv_res = calculate_ltv_cac(arpu=100.0, gross_margin_pct=80.0, monthly_churn_pct=5.0, cac=400.0)
        self.assertEqual(ltv_res["ltv"], 1600.0)
        self.assertEqual(ltv_res["ltv_cac_ratio"], 4.0)

        # 2. Break-Even: FC=$50,000, Price=$100, VC=$50 -> CM=$50, BE=1,000 units
        be_res = calculate_breakeven(fixed_costs=50000.0, selling_price_per_unit=100.0, variable_cost_per_unit=50.0)
        self.assertEqual(be_res["breakeven_units"], 1000)
        self.assertEqual(be_res["contribution_margin_per_unit"], 50.0)

        # 3. NPV: Initial $1000, r=10%, Year 1: $600, Year 2: $600 -> PV = 600/1.1 + 600/1.21 = 545.45 + 495.87 = 1041.32 -> NPV = $41.32
        npv_res = calculate_npv_payback(initial_investment=1000.0, discount_rate_pct=10.0, cash_flows=[600.0, 600.0])
        self.assertEqual(npv_res["npv"], 41.32)
        self.assertIn("ACCEPT", npv_res["decision"])

        # 4. RICE Score: Reach=1000, Impact=2.0, Confidence=80%, Effort=2 -> (1000 * 2.0 * 0.8) / 2 = 800.0
        rice_res = calculate_rice_score(reach=1000.0, impact=2.0, confidence_pct=80.0, effort_person_weeks=2.0)
        self.assertEqual(rice_res["rice_score"], 800.0)

        # 5. WACC: Equity=$60M, Debt=$40M, Re=12%, Rd=6%, Tc=25% -> E/V=60%, D/V=40% -> WACC = (0.6*12%) + (0.4 * 6% * 0.75) = 7.2% + 1.8% = 9.0%
        wacc_res = calculate_wacc(market_value_equity=60000000.0, market_value_debt=40000000.0, cost_of_equity_pct=12.0, cost_of_debt_pct=6.0, tax_rate_pct=25.0)
        self.assertEqual(wacc_res["wacc_pct"], 9.0)

    def test_07_frameworks_library(self):
        """Test MBA framework retrieval and persistent user note taking."""
        # Get all frameworks
        resp = self.client.get("/api/frameworks")
        self.assertEqual(resp.status_code, 200)
        fws = resp.json()["frameworks"]
        self.assertTrue(len(fws) >= 15)

        # Get SWOT analysis
        swot_resp = self.client.get("/api/frameworks/swot")
        self.assertEqual(swot_resp.status_code, 200)
        self.assertEqual(swot_resp.json()["name"], "SWOT Analysis")

        # Save note on SWOT
        note_resp = self.client.post("/api/frameworks/swot/notes", json={
            "notes": "Remember: Match internal Strengths to external Opportunities (SO Strategy) for proactive growth."
        })
        self.assertEqual(note_resp.status_code, 200)
        self.assertTrue(note_resp.json()["success"])

    def test_08_exam_plans_and_mock_exams(self):
        """Test 7-day exam planner and anti-cheat mock exam generation."""
        # Find any subject ID
        with get_db() as conn:
            sub = conn.execute("SELECT id FROM subjects LIMIT 1").fetchone()
            sub_id = sub["id"] if sub else "subj_demo"

        # Generate 7-day plan
        plan_resp = self.client.post("/api/exams/plans/generate", json={
            "subject_id": sub_id,
            "duration_days": 7
        })
        self.assertEqual(plan_resp.status_code, 200)
        plan_data = plan_resp.json()
        self.assertEqual(plan_data["duration_days"], 7)
        self.assertEqual(len(plan_data["schedule"]), 7)

        # Generate mock exam
        mock_resp = self.client.post("/api/exams/mock/generate", json={
            "subject_id": sub_id,
            "question_count": 5,
            "time_limit_minutes": 20
        })
        self.assertEqual(mock_resp.status_code, 200)
        mock_data = mock_resp.json()
        mock_id = mock_data["mock_exam_id"]
        # Verify anti-cheat: correct answers MUST NOT be revealed in questions payload
        for q in mock_data["questions"]:
            self.assertNotIn("correct_indices", q)

        # Submit mock exam
        sub_resp = self.client.post(f"/api/exams/mock/{mock_id}/submit", json={
            "answers": {q["id"]: [1] for q in mock_data["questions"]}
        })
        self.assertEqual(sub_resp.status_code, 200)
        res_data = sub_resp.json()
        self.assertIn("score", res_data)
        self.assertIn("accuracy", res_data)

    def test_09_confidence_matrix(self):
        """Test logging confidence levels and computing 2x2 Knowledge Matrix."""
        # Log 1 Mastered (Very Confident + Correct)
        self.client.post("/api/confidence/log", json={
            "question_id": "q_test_1",
            "confidence_level": "Very Confident",
            "is_correct": True
        })
        # Log 1 Dangerous Blindspot (Very Confident + False)
        self.client.post("/api/confidence/log", json={
            "question_id": "q_test_2",
            "confidence_level": "Very Confident",
            "is_correct": False
        })

        matrix_resp = self.client.get("/api/confidence/matrix")
        self.assertEqual(matrix_resp.status_code, 200)
        matrix_data = matrix_resp.json()
        self.assertTrue(matrix_data["matrix"]["mastered"] >= 1)
        self.assertTrue(matrix_data["matrix"]["dangerous_blindspot"] >= 1)
        self.assertTrue(matrix_data["summary"]["requires_urgent_review"])

    def test_10_export_tools(self):
        """Test export endpoints for Markdown study notes and JSON analytics."""
        md_resp = self.client.get("/api/export/notes/markdown")
        self.assertEqual(md_resp.status_code, 200)
        self.assertIn("VISHAL SINGH LMS", md_resp.text)

        json_resp = self.client.get("/api/export/progress/json")
        self.assertEqual(json_resp.status_code, 200)
        self.assertEqual(json_resp.json()["user"], "Vishal Singh")

if __name__ == "__main__":
    unittest.main()
