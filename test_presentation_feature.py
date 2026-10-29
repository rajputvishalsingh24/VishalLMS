import os
import json
from pptx import Presentation
from pptx.util import Inches, Pt
from fastapi.testclient import TestClient
from backend.main import app

def test_full_presentation_feature():
    print("=" * 60)
    print("TESTING FULL AI-POWERED PPT SUMMARIZATION & LEARNING FEATURE")
    print("=" * 60)
    
    client = TestClient(app)

    # 1. Health & Root Check
    res = client.get("/")
    assert res.status_code == 200, f"Root returned {res.status_code}"
    print("[PASS] Root page returns 200 OK")

    # 2. Settings Check
    res = client.get("/api/settings")
    assert res.status_code == 200
    print("[PASS] Settings API returns 200 OK")

    # 3. Create real test PPTX
    test_file = "test_mba_presentation.pptx"
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    layout = prs.slide_layouts[6]

    slides = [
        ("Platform Strategy & Two-Sided Network Effects", [
            "Cross-side network effects drive defensible exponential moats.",
            "Subsidizing the price-sensitive side maximizes total transaction throughput.",
            "Examples: Uber, Airbnb, Visa, and Apple App Store."
        ]),
        ("Hamilton Helmer's 7 Powers of Business Moats", [
            "Network Economies, Counter-Positioning, Switching Costs, and Scale Economies.",
            "Branding, Cornered Resource, and Process Power provide durable pricing power.",
            "Power produces persistent differential returns on invested capital."
        ]),
        ("Unit Economics: LTV to CAC Ratio Calculations", [
            "Customer Lifetime Value (LTV) = (ARPU * Gross Margin) / Churn Rate.",
            "Customer Acquisition Cost (CAC) = Total Sales & Marketing Spend / New Customers Acquired.",
            "Rule of thumb: LTV / CAC ratio > 3.0x indicates healthy unit economics."
        ])
    ]

    for title, bullets in slides:
        slide = prs.slides.add_slide(layout)
        tb = slide.shapes.add_textbox(Inches(1), Inches(0.8), Inches(11.3), Inches(1.2))
        p = tb.text_frame.paragraphs[0]
        p.text = title
        p.font.size = Pt(26)
        p.font.bold = True
        body = slide.shapes.add_textbox(Inches(1), Inches(2.2), Inches(11.3), Inches(4.5))
        for b in bullets:
            bp = body.text_frame.add_paragraph()
            bp.text = "• " + b
            bp.font.size = Pt(18)

    prs.save(test_file)
    print(f"[PASS] Created test presentation: {test_file}")

    # 4. Upload PPTX
    with open(test_file, "rb") as f:
        res = client.post(
            "/api/documents/upload",
            files={"file": ("Platform_Strategy_Masterclass.pptx", f, "application/vnd.openxmlformats-officedocument.presentationml.presentation")},
            data={"subject_id": "sub_pm", "semester": "Semester 1", "faculty": "Prof. Strategy"}
        )
    assert res.status_code == 200, res.text
    doc_id = res.json()["id"]
    print(f"[PASS] Uploaded presentation successfully (Doc ID: {doc_id}, Slides: {res.json()['slide_count']})")

    # 5. Analyze Presentation
    res = client.post(f"/api/presentations/{doc_id}/analyze")
    assert res.status_code == 200, res.text
    summary = res.json()["summary"]
    print(f"[PASS] Analyzed presentation. Concepts identified: {len(summary['concepts'])}")
    print(f"[PASS] Frameworks: {len(summary['frameworks'])}, Glossary terms: {len(summary['glossary'])}")
    print(f"[PASS] Learning Path modules: {len(summary['learning_path'])}")
    assert len(summary["concepts"]) >= 3
    assert len(summary["learning_path"]) >= 1

    # 6. Fetch Summary
    res = client.get(f"/api/presentations/{doc_id}/summary")
    assert res.status_code == 200
    sum_data = res.json()
    assert sum_data["overview"]["total_slides"] == 3
    print("[PASS] GET /api/presentations/{doc_id}/summary verified")

    # 7. Fetch & Update Session
    res = client.get(f"/api/presentations/{doc_id}/session")
    assert res.status_code == 200
    sess = res.json()
    first_concept = sum_data["concepts"][0]["name"]
    print(f"[PASS] Initial session loaded: Active concept = '{first_concept}'")

    res = client.post(f"/api/presentations/{doc_id}/session", json={
        "mark_understood": first_concept,
        "current_slide_number": 2
    })
    assert res.status_code == 200
    assert first_concept in res.json()["understood_concepts"]
    print("[PASS] Session updated: Concept marked as understood")

    # 8. Test 8-Step Pedagogical Teaching Package & 12 Teaching Controls
    res = client.post(f"/api/presentations/{doc_id}/teach", json={"concept_name": first_concept})
    assert res.status_code == 200
    teach_pkg = res.json()
    assert len(teach_pkg["steps"]) == 8, f"Expected 8 pedagogical steps, got {len(teach_pkg['steps'])}"
    print(f"[PASS] 8 Pedagogical steps generated for '{first_concept}':")
    for s in teach_pkg["steps"]:
        print(f"       Step {s['step_number']}: {s['title']}")

    # Test teaching controls: Simpler English, Analogy, Compare, Step-by-Step
    controls = ["simpler_english", "analogy", "compare", "step_by_step", "more_detail", "another_example"]
    for ctrl in controls:
        res = client.post(f"/api/presentations/{doc_id}/teach", json={"concept_name": first_concept, "control_action": ctrl})
        assert res.status_code == 200
        assert res.json()["control_action"] == ctrl
        print(f"[PASS] Teaching control verified: '{ctrl}' -> {res.json()['control_title']}")

    # 9. Test Context-Aware AI Tutor Chat with Citations
    chat_res = client.post(f"/api/presentations/{doc_id}/chat", json={
        "query": "How do two-sided network effects create switching costs?",
        "concept_name": first_concept,
        "slide_number": 1
    })
    assert chat_res.status_code == 200
    chat_data = chat_res.json()
    assert "reply" in chat_data
    assert "citation" in chat_data
    print(f"[PASS] Context-aware follow-up chat verified:")
    print(f"       Citation: {chat_data['citation']}")
    print(f"       Reply Preview: {chat_data['reply'][:120]}...")

    # 10. Flashcards & Exam Prep
    res = client.get(f"/api/presentations/{doc_id}/flashcards")
    assert res.status_code == 200
    flashcards = res.json()
    assert len(flashcards) >= 1
    print(f"[PASS] Generated {len(flashcards)} flashcards for presentation")

    card_id = flashcards[0]["id"]
    res = client.post(f"/api/presentations/{doc_id}/flashcards/{card_id}/master")
    assert res.status_code == 200
    print("[PASS] Mastered flashcard successfully")

    # 11. Printable Export
    res = client.get(f"/api/presentations/{doc_id}/export-printable")
    assert res.status_code == 200
    assert "Detailed MBA Summary" in res.text
    print("[PASS] Printable export generated successfully")

    # Cleanup test presentation file
    try:
        os.remove(test_file)
    except Exception:
        pass

    print("=" * 60)
    print("ALL AI-POWERED PPT SUMMARIZATION & LEARNING TESTS PASSED!")
    print("=" * 60)

if __name__ == "__main__":
    test_full_presentation_feature()
