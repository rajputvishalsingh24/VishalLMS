"""
End-to-End Verification Test Suite for VISHAL SINGH LMS
Tests:
1. Subject CRUD & duplicate handling
2. PPT Upload & Layout Extractor
3. Slide layout data & download endpoint
4. 5-Question Concept Quiz Engine (cheat prevention & question count)
5. Quiz Submission & Evaluation
6. Quiz Regeneration
7. Active Study Session Tracking & auto-capping
8. Learning Analytics, 8 real metrics, 7-day activity chart, and dynamic recommendations
"""
import os
import sys
import unittest
from fastapi.testclient import TestClient

# Ensure backend can be imported
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from backend.main import app
from backend.database import get_connection, init_db

class TestVishalLMS(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def test_01_subject_crud_and_duplicate(self):
        import uuid
        uid = uuid.uuid4().hex[:6]
        subj_name = f"Corporate Strategy {uid}"
        new_name = f"Strategic Management {uid}"

        # 1. Create Subject
        resp = self.client.post("/api/subjects", json={
            "name": subj_name,
            "description": "Strategic planning and competitive advantage",
            "semester": "Semester 1"
        })
        self.assertIn(resp.status_code, [200, 201])
        data = resp.json()
        subject_id = data["id"]
        self.assertEqual(data["name"], subj_name)

        # 2. Duplicate Subject Check
        dup_resp = self.client.post("/api/subjects", json={
            "name": subj_name,
            "description": "Duplicate attempt"
        })
        self.assertEqual(dup_resp.status_code, 400)

        # 3. Rename Subject
        update_resp = self.client.put(f"/api/subjects/{subject_id}", json={
            "name": new_name,
            "description": "Updated strategic management curriculum"
        })
        self.assertEqual(update_resp.status_code, 200)
        self.assertEqual(update_resp.json()["name"], new_name)

        # 4. Fetch All Subjects
        get_resp = self.client.get("/api/subjects")
        self.assertEqual(get_resp.status_code, 200)
        subjects = get_resp.json()
        self.assertTrue(any(s["id"] == subject_id for s in subjects))

    def test_02_ppt_upload_and_extraction(self):
        # Create a sample PPTX presentation for testing
        from pptx import Presentation
        from pptx.util import Inches, Pt

        prs = Presentation()
        # Slide 1: Title
        slide1 = prs.slides.add_slide(prs.slide_layouts[0])
        slide1.shapes.title.text = "Strategic Advantage & Competitive Moats"
        slide1.placeholders[1].text = "An Executive Framework for Sustained Superior Performance"

        # Slide 2: Core Concept
        slide2 = prs.slides.add_slide(prs.slide_layouts[1])
        slide2.shapes.title.text = "Porter's Five Forces Analysis"
        tf = slide2.placeholders[1].text_frame
        tf.text = "1. Threat of New Entrants: Barriers to entry dictate industry profitability."
        p = tf.add_paragraph()
        p.text = "2. Bargaining Power of Buyers: High buyer concentration forces price concessions."
        p2 = tf.add_paragraph()
        p2.text = "3. Competitive Rivalry: Intense price wars erode economic rents."

        # Slide 3: Practical Decision Framework
        slide3 = prs.slides.add_slide(prs.slide_layouts[1])
        slide3.shapes.title.text = "Customer Lifetime Value (LTV) vs CAC"
        tf3 = slide3.placeholders[1].text_frame
        tf3.text = "Unit economics require an LTV to CAC ratio greater than 3:1 for sustainable scaling."
        p3 = tf3.add_paragraph()
        p3.text = "Payback period should ideally be under 12 months for enterprise B2B SaaS models."

        # Add speaker notes to slide 2
        notes_slide = slide2.notes_slide
        notes_text_frame = notes_slide.notes_text_frame
        notes_text_frame.text = "Emphasize to students that Five Forces analyzes industry structure, not company positioning."

        test_ppt_path = os.path.join(os.path.dirname(__file__), "test_sample_strategy.pptx")
        prs.save(test_ppt_path)

        # Create Subject for document
        import uuid
        subj_resp = self.client.post("/api/subjects", json={"name": f"Business Strategy {uuid.uuid4().hex[:6]}", "description": "For testing"})
        subj_id = subj_resp.json()["id"]

        # Upload the PPTX
        with open(test_ppt_path, "rb") as f:
            upload_resp = self.client.post("/api/documents/upload", files={"file": ("test_sample_strategy.pptx", f, "application/vnd.openxmlformats-officedocument.presentationml.presentation")}, data={"subject_id": subj_id})
        
        self.assertEqual(upload_resp.status_code, 200)
        doc_data = upload_resp.json()
        doc_id = doc_data["id"]
        self.assertGreaterEqual(doc_data["slide_count"], 3)

        # Analyze presentation
        analyze_resp = self.client.post(f"/api/presentations/{doc_id}/analyze")
        self.assertEqual(analyze_resp.status_code, 200)
        resp_json = analyze_resp.json()
        summary = resp_json.get("summary", resp_json)
        self.assertTrue("concepts" in summary)
        self.assertGreater(len(summary["concepts"]), 0)

        # Store doc_id on class for downstream tests
        TestVishalLMS.test_doc_id = doc_id
        TestVishalLMS.test_subject_id = subj_id

    def test_03_ppt_viewer_and_download(self):
        doc_id = getattr(TestVishalLMS, "test_doc_id", None)
        self.assertIsNotNone(doc_id)

        # 1. Slide Layout Extractor Endpoint
        slides_resp = self.client.get(f"/api/presentations/{doc_id}/slides")
        self.assertEqual(slides_resp.status_code, 200)
        slides_data = slides_resp.json()

        self.assertGreaterEqual(slides_data["total_slides"], 3)
        first_slide = slides_data["slides"][0]
        self.assertIn("shapes", first_slide)
        self.assertIn("slide_number", first_slide)
        self.assertEqual(first_slide["slide_number"], 1)

        # Verify speaker notes on slide 2
        slide_2 = slides_data["slides"][1]
        self.assertIn("speaker_notes", slide_2)
        self.assertTrue("Five Forces" in slide_2["speaker_notes"] or "industry" in slide_2["speaker_notes"])

        # 2. Original PPT Download Endpoint
        dl_resp = self.client.get(f"/api/documents/{doc_id}/download")
        self.assertEqual(dl_resp.status_code, 200)
        self.assertIn("Content-Disposition", dl_resp.headers)
        self.assertTrue("attachment" in dl_resp.headers["Content-Disposition"])
        self.assertGreater(len(dl_resp.content), 1000)

    def test_04_concept_quiz_prep_and_generation(self):
        doc_id = getattr(TestVishalLMS, "test_doc_id", None)
        self.assertIsNotNone(doc_id)

        # 1. Quiz Catalog
        cat_resp = self.client.get(f"/api/presentations/{doc_id}/quiz-catalog")
        self.assertEqual(cat_resp.status_code, 200)
        catalog = cat_resp.json()["catalog"]
        self.assertGreater(len(catalog), 0)

        target_concept = catalog[0]["concept_name"]

        # 2. Quiz Prep Mode (Revision before quiz)
        prep_resp = self.client.get(f"/api/presentations/{doc_id}/concepts/{target_concept}/quiz-prep")
        self.assertEqual(prep_resp.status_code, 200)
        prep = prep_resp.json()
        self.assertEqual(prep["concept_name"], target_concept)
        self.assertIn("key_revision_points", prep)
        self.assertIn("decision_framework", prep)
        self.assertEqual(len(prep["key_revision_points"]), 5)

        # 3. Generate 5-Question Concept Quiz
        quiz_resp = self.client.post(f"/api/presentations/{doc_id}/concepts/{target_concept}/quiz", params={"difficulty": "Medium"})
        self.assertEqual(quiz_resp.status_code, 200)
        quiz = quiz_resp.json()
        self.assertIn("quiz_id", quiz)
        self.assertIn("questions", quiz)

        # STRICT RULE: Exactly 5 questions per concept
        self.assertEqual(len(quiz["questions"]), 5, "Strict Requirement: Exactly 5 questions per concept")

        # CHEAT PREVENTION: Correct answers and explanations must NOT be sent to client
        for q in quiz["questions"]:
            self.assertNotIn("correct_indices", q, "Security Leak: correct_indices must not be exposed before submission")
            self.assertNotIn("explanation", q, "Security Leak: explanation must not be exposed before submission")
            self.assertIn("id", q)
            self.assertIn("stem", q)
            self.assertIn("options", q)
            self.assertGreaterEqual(len(q["options"]), 2)

        TestVishalLMS.test_quiz = quiz
        TestVishalLMS.test_concept = target_concept

    def test_05_quiz_submission_and_evaluation(self):
        quiz = getattr(TestVishalLMS, "test_quiz", None)
        self.assertIsNotNone(quiz)
        quiz_id = quiz["quiz_id"]

        # Prepare answers payload (selecting option 0 for each question)
        answers = []
        for q in quiz["questions"]:
            answers.append({
                "question_id": q["id"],
                "selected_indices": [0],
                "time_spent_seconds": 15
            })

        submit_resp = self.client.post(f"/api/quizzes/{quiz_id}/submit", json={"answers": answers})
        self.assertEqual(submit_resp.status_code, 200)
        result = submit_resp.json()

        self.assertEqual(result["quiz_id"], quiz_id)
        self.assertEqual(result["total_questions"], 5)
        self.assertIn("score", result)
        self.assertIn("percentage", result)
        self.assertIn("concept_status", result)
        self.assertIn("question_results", result)
        self.assertEqual(len(result["question_results"]), 5)

        # Now question_results MUST have correct answers, explanations, and slide citations
        first_res = result["question_results"][0]
        self.assertIn("correct_indices", first_res)
        self.assertIn("explanation", first_res)
        self.assertIn("slide_number", first_res)

    def test_06_quiz_regeneration(self):
        quiz = getattr(TestVishalLMS, "test_quiz", None)
        self.assertIsNotNone(quiz)
        quiz_id = quiz["quiz_id"]

        regen_resp = self.client.post(f"/api/quizzes/{quiz_id}/regenerate")
        self.assertEqual(regen_resp.status_code, 200)
        regen_quiz = regen_resp.json()

        self.assertEqual(regen_quiz["quiz_id"], quiz_id)
        self.assertEqual(len(regen_quiz["questions"]), 5, "Regenerated quiz must have exactly 5 questions")

    def test_07_study_session_tracking(self):
        doc_id = getattr(TestVishalLMS, "test_doc_id", None)
        self.assertIsNotNone(doc_id)

        # 1. Record a valid 45-second study session
        resp = self.client.post("/api/study/session", json={
            "doc_id": doc_id,
            "duration_seconds": 45
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["recorded"])

        # 2. Inactive duration check (less than 5s ignored)
        ign_resp = self.client.post("/api/study/session", json={
            "doc_id": doc_id,
            "duration_seconds": 2
        })
        self.assertEqual(ign_resp.status_code, 200)
        self.assertFalse(ign_resp.json()["recorded"])

    def test_08_learning_analytics_and_recommendations(self):
        # Fetch comprehensive analytics
        resp = self.client.get("/api/progress/analytics")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        # Check 8 Live Metrics
        self.assertIn("metrics", data)
        m = data["metrics"]
        self.assertIn("total_subjects", m)
        self.assertIn("total_presentations", m)
        self.assertIn("presentations_studied", m)
        self.assertIn("concepts_completed", m)
        self.assertIn("concepts_remaining", m)
        self.assertIn("quizzes_taken", m)
        self.assertIn("avg_quiz_accuracy", m)
        self.assertIn("total_study_minutes", m)

        self.assertGreater(m["total_subjects"], 0)
        self.assertGreater(m["total_presentations"], 0)
        self.assertGreater(m["quizzes_taken"], 0)

        # Check 7-Day Chart
        self.assertIn("daily_chart", data)
        self.assertEqual(len(data["daily_chart"]), 7)
        for day in data["daily_chart"]:
            self.assertIn("day_name", day)
            self.assertIn("minutes", day)

        # Check Subject and Presentation Progress
        self.assertIn("subject_progress", data)
        self.assertIn("presentation_progress", data)

        # Check Recommendations Engine
        self.assertIn("recommendations", data)
        self.assertIsInstance(data["recommendations"], list)

if __name__ == "__main__":
    unittest.main()
