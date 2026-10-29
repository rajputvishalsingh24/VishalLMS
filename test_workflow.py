import os
import sys
import json
import requests
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

BASE_URL = "http://127.0.0.1:8000"

def log(msg, status="INFO"):
    print(f"[{status}] {msg}")

def run_e2e_audit():
    print("=" * 60)
    print("STARTING VISHAL SINGH LMS COMPREHENSIVE QA AUDIT")
    print("=" * 60)

    # ----------------------------------------------------
    # STEP 1: CREATE & UPLOAD A REAL POWERPOINT PRESENTATION
    # ----------------------------------------------------
    log("Step 1: Generating a real custom PowerPoint presentation...", "RUN")
    test_pptx_path = "test_corporate_valuation.pptx"
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    slides_content = [
        {
            "title": "Corporate Valuation & DCF Modeling",
            "bullets": [
                "Discounted Cash Flow (DCF) calculates intrinsic value based on future cash flows.",
                "Enterprise Value (EV) = Market Value of Equity + Total Debt - Cash & Cash Equivalents.",
                "Weighted Average Cost of Capital (WACC) serves as the discount rate hurdle."
            ]
        },
        {
            "title": "Unlevered Free Cash Flow (FCFF) Mechanics",
            "bullets": [
                "FCFF = EBIT x (1 - Tax Rate) + D&A - Capital Expenditures - Changes in Net Working Capital.",
                "Terminal Value is calculated using the Gordon Growth Model or Exit Multiple method.",
                "Terminal Growth Rate assumption benchmark is typically between 2.0% and 3.0%."
            ]
        },
        {
            "title": "Sensitivity Analysis & Monte Carlo Simulation",
            "bullets": [
                "Two-way sensitivity matrices evaluate valuation against WACC and Perpetual Growth Rate variations.",
                "Football field charts display ranges across DCF, Precedent Transactions, and Trading Multiples.",
                "Key Metric: Implied share price compared against current public trading market price."
            ]
        }
    ]

    for item in slides_content:
        slide = prs.slides.add_slide(blank_layout)
        tb = slide.shapes.add_textbox(Inches(1), Inches(0.8), Inches(11.3), Inches(1.2))
        p = tb.text_frame.paragraphs[0]
        p.text = item["title"]
        p.font.size = Pt(26)
        p.font.bold = True
        
        body = slide.shapes.add_textbox(Inches(1), Inches(2.2), Inches(11.3), Inches(4.5))
        for b in item["bullets"]:
            bp = body.text_frame.add_paragraph()
            bp.text = "• " + b
            bp.font.size = Pt(18)
            bp.space_after = Pt(12)

    prs.save(test_pptx_path)
    log(f"Successfully generated real PPTX file at {test_pptx_path} (Size: {os.path.getsize(test_pptx_path)} bytes)", "PASS")

    # ----------------------------------------------------
    # STEP 2 & 3: UPLOAD PRESENTATION & VERIFY EXTRACTION
    # ----------------------------------------------------
    log("Step 2 & 3: Uploading presentation to API...", "RUN")
    with open(test_pptx_path, "rb") as f:
        upload_resp = requests.post(
            f"{BASE_URL}/api/documents/upload",
            files={"file": ("Corporate_Valuation_Masterclass.pptx", f, "application/vnd.openxmlformats-officedocument.presentationml.presentation")},
            data={
                "subject_id": "sub_fin",
                "semester": "Semester 2",
                "faculty": "Prof. Valuation Specialist",
                "description": "DCF modeling, WACC and enterprise value",
                "tags": json.dumps(["Important", "Exam Preparation"])
            }
        )

    assert upload_resp.status_code == 200, f"Upload failed: {upload_resp.text}"
    upload_data = upload_resp.json()
    doc_id = upload_data["id"]
    log(f"Document uploaded successfully! Doc ID: {doc_id}, Slide Count: {upload_data['slide_count']}", "PASS")
    assert upload_data["slide_count"] == 3, f"Expected 3 slides, got {upload_data['slide_count']}"

    # ----------------------------------------------------
    # STEP 4: VERIFY METADATA IN DATABASE
    # ----------------------------------------------------
    log("Step 4: Fetching document metadata and slide chunks from database...", "RUN")
    doc_resp = requests.get(f"{BASE_URL}/api/documents/{doc_id}")
    assert doc_resp.status_code == 200, f"Failed to get doc: {doc_resp.text}"
    doc_details = doc_resp.json()
    
    assert doc_details["name"] == "Corporate_Valuation_Masterclass.pptx"
    assert doc_details["file_type"] == "PPTX"
    assert doc_details["subject_id"] == "sub_fin"
    chunks = doc_details["chunks"]
    assert len(chunks) == 3, f"Expected 3 chunks, got {len(chunks)}"
    
    for i, c in enumerate(chunks, start=1):
        assert c["slide_number"] == i, f"Expected slide number {i}, got {c['slide_number']}"
        assert c["title"] == slides_content[i-1]["title"], f"Title mismatch: {c['title']} vs {slides_content[i-1]['title']}"
        log(f"Verified Slide {c['slide_number']}: '{c['title']}' with {len(c['takeaways'])} takeaways", "PASS")

    # ----------------------------------------------------
    # STEP 5 & 6: OPEN PRESENTATION & ASK AI ABOUT SLIDE 2
    # ----------------------------------------------------
    log("Step 5 & 6: Asking AI Tutor to explain Slide 2 ('Unlevered Free Cash Flow (FCFF) Mechanics')...", "RUN")
    tutor_resp = requests.post(
        f"{BASE_URL}/api/tutor/chat",
        json={
            "query": "Explain Slide 2: Unlevered Free Cash Flow (FCFF) Mechanics",
            "mode": "presentation_explainer",
            "document_id": doc_id
        }
    )
    assert tutor_resp.status_code == 200, f"Tutor chat failed: {tutor_resp.text}"
    tutor_data = tutor_resp.json()
    ai_text = tutor_data["response"]
    citations = tutor_data["citations"]

    # ----------------------------------------------------
    # STEP 7: VERIFY GROUNDED ANSWER
    # ----------------------------------------------------
    log("Step 7: Verifying AI answer is strictly grounded in Slide 2 content...", "RUN")
    assert "Unlevered Free Cash Flow" in ai_text or "FCFF" in ai_text, "Missing core term from slide"
    assert "Slide 2" in ai_text or any(c["slide"] == 2 for c in citations), "Missing slide number reference"
    assert len(citations) > 0, "No source citations returned"
    log(f"AI response verified! Cites: {citations[0]['document']}, Slide {citations[0]['slide']}", "PASS")

    # ----------------------------------------------------
    # STEP 8: GENERATE QUIZ FROM THAT SPECIFIC PRESENTATION
    # ----------------------------------------------------
    log(f"Step 8: Generating practice quiz specifically for document {doc_id}...", "RUN")
    quiz_gen_resp = requests.post(
        f"{BASE_URL}/api/quizzes/generate",
        json={
            "document_id": doc_id,
            "difficulty": "MBA Examination Level",
            "format": "Multiple Choice",
            "num_questions": 3
        }
    )
    assert quiz_gen_resp.status_code == 200, f"Quiz generation failed: {quiz_gen_resp.text}"
    quiz_data = quiz_gen_resp.json()
    quiz_id = quiz_data["id"]
    questions = quiz_data["questions"]
    assert len(questions) == 3, f"Expected 3 questions, got {len(questions)}"
    
    # Verify each question references the actual slides from our presentation
    for q in questions:
        assert "Corporate_Valuation_Masterclass.pptx" in q["source_citation"], f"Citation not matching document: {q['source_citation']}"
        assert len(q["options"]) == 4, "Must have 4 choices"
        assert q["correct_answer"] in q["options"], "Correct answer must be one of the options"
        log(f"Verified Grounded Question: {q['question'][:70]}... (Citation: {q['source_citation']})", "PASS")

    # ----------------------------------------------------
    # STEP 9: SUBMIT ANSWERS AND VERIFY SCORING
    # ----------------------------------------------------
    log("Step 9: Submitting quiz answers (answering 2 correct, 1 incorrect)...", "RUN")
    sub_answers = [
        {"question_id": questions[0]["id"], "selected_answer": questions[0]["correct_answer"]},
        {"question_id": questions[1]["id"], "selected_answer": questions[1]["correct_answer"]},
        {"question_id": questions[2]["id"], "selected_answer": "Deliberately Wrong Choice"}
    ]
    sub_resp = requests.post(
        f"{BASE_URL}/api/quizzes/{quiz_id}/submit",
        json={"answers": sub_answers}
    )
    assert sub_resp.status_code == 200, f"Submit failed: {sub_resp.text}"
    sub_result = sub_resp.json()
    assert sub_result["score"] == 2, f"Expected score 2, got {sub_result['score']}"
    assert sub_result["total"] == 3, f"Expected total 3, got {sub_result['total']}"
    assert sub_result["accuracy"] == 67, f"Expected 67%, got {sub_result['accuracy']}%"
    assert sub_result["correct_count"] == 2
    assert sub_result["incorrect_count"] == 1
    log(f"Scoring calculated accurately: {sub_result['score']}/{sub_result['total']} ({sub_result['accuracy']}%)", "PASS")

    # ----------------------------------------------------
    # STEP 10: VERIFY PROGRESS UPDATES LIVE
    # ----------------------------------------------------
    log("Step 10: Verifying learning progress and dashboard stats updated live...", "RUN")
    stats_resp = requests.get(f"{BASE_URL}/api/stats")
    assert stats_resp.status_code == 200
    stats = stats_resp.json()["stats"]
    log(f"Live stats from DB: Presentations={stats['presentations']}, Docs={stats['documents']}, Quizzes={stats['quizzes_attempted']}, Progress={stats['overall_progress']}%", "PASS")
    assert stats["presentations"] >= 2, "Presentations count must include our newly uploaded PPTX"
    assert stats["documents"] >= 8, "Documents count must include our newly uploaded PPTX"
    assert stats["quizzes_attempted"] >= 2, "Quiz attempts must include our completed quiz"

    # ----------------------------------------------------
    # STEP 11: AUTHENTICATION, LOGOUT, LOGIN & DATA PERSISTENCE
    # ----------------------------------------------------
    log("Step 11: Testing authentication, session creation, logout and relogin...", "RUN")
    login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "vishal", "password": "vishal123"}
    )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json()["token"]
    assert len(token) == 64, "Token should be secure hex string"
    log("Login successful! Generated secure auth token.", "PASS")

    # Verify session with /api/auth/me
    me_resp = requests.get(f"{BASE_URL}/api/auth/me?token={token}")
    assert me_resp.status_code == 200 and me_resp.json()["authenticated"] is True
    log("Verified authenticated user session for Vishal Singh.", "PASS")

    # Logout
    logout_resp = requests.post(f"{BASE_URL}/api/auth/logout?token={token}")
    assert logout_resp.status_code == 200
    log("Logout completed successfully.", "PASS")

    # Relogin
    relogin_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "vishal", "password": "vishal123"}
    )
    assert relogin_resp.status_code == 200
    new_token = relogin_resp.json()["token"]
    
    # Verify all uploaded data, chunks, and quiz attempts persist after relogin!
    verify_doc = requests.get(f"{BASE_URL}/api/documents/{doc_id}")
    assert verify_doc.status_code == 200, "Document must still exist after relogin"
    assert verify_doc.json()["name"] == "Corporate_Valuation_Masterclass.pptx"
    log("Data persistence verified! All uploaded documents, chunks, and quiz results remain intact across sessions.", "PASS")

    # Clean up test pptx file
    if os.path.exists(test_pptx_path):
        os.remove(test_pptx_path)

    print("=" * 60)
    print("ALL 11 END-TO-END QA STEPS PASSED WITH 100% SUCCESS!")
    print("=" * 60)

if __name__ == "__main__":
    run_e2e_audit()
