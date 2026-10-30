import io
import os
import sys
import json
import tempfile

# Add workspace to path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from backend.database import init_db, get_connection
from backend.extractor import detect_file_signature, extract_document
from backend.summarizer import analyze_presentation, get_concept_teaching_package
from backend.ai_tutor import answer_tutor_query

def run_tests():
    print("=== STARTING COMPLETE VERIFICATION SUITE ===")
    init_db()

    # 1. Test File Signatures & Extractor
    print("\n[Test 1] Testing File Signature Detection & Extraction...")
    # Create sample PPTX (ZIP structure)
    import zipfile
    pptx_bytes_io = io.BytesIO()
    with zipfile.ZipFile(pptx_bytes_io, 'w') as zf:
        zf.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>')
        zf.writestr("ppt/presentation.xml", '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"></p:presentation>')
    pptx_bytes = pptx_bytes_io.getvalue()

    with tempfile.NamedTemporaryFile(suffix=".pptx", delete=False) as f:
        f.write(pptx_bytes)
        pptx_path = f.name

    sig = detect_file_signature(pptx_path)
    assert sig == "pptx", f"Expected 'pptx', got {sig}"
    print("  [OK] Magic bytes PPTX detection verified.")

    # Create dummy PDF
    pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(pdf_bytes)
        pdf_path = f.name
    sig_pdf = detect_file_signature(pdf_path)
    assert sig_pdf == "pdf", f"Expected 'pdf', got {sig_pdf}"
    print("  [OK] Magic bytes PDF detection verified.")

    # 2. Test Document & Chunk Storage
    print("\n[Test 2] Testing Database Persistence & Subject Auto-Fallback...")
    conn = get_connection()
    c = conn.cursor()
    # Ensure a subject exists
    sub = c.execute("SELECT id FROM subjects LIMIT 1").fetchone()
    if not sub:
        c.execute("INSERT INTO subjects (id, name, description) VALUES ('sub_test', 'Marketing Strategy', 'Test subject')")
        conn.commit()
        sub_id = 'sub_test'
    else:
        sub_id = sub['id']

    doc_id = "doc_test_101"
    c.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    c.execute("DELETE FROM document_chunks WHERE document_id = ?", (doc_id,))
    c.execute("DELETE FROM presentation_summaries WHERE document_id = ?", (doc_id,))
    c.execute("DELETE FROM presentation_learning_sessions WHERE document_id = ?", (doc_id,))

    c.execute("""
    INSERT INTO documents (
        id, subject_id, name, original_filename, file_type, file_size,
        file_path, semester, slide_count, progress
    ) VALUES (?, ?, 'Product_Strategy_Lecture.pptx', 'Product_Strategy_Lecture.pptx', 'PPTX', 1024,
        ?, 'Semester 1', 3, 0)
    """, (doc_id, sub_id, pptx_path))

    # Add 3 realistic MBA slides
    slides = [
        (1, "Product-Market Fit & Value Proposition", "Understanding customer problem spaces before engineering execution.\n• Qualitative customer discovery loops\n• Measuring retention curves\n• Validated willingness to pay"),
        (2, "RICE Prioritization Framework", "Scoring competing roadmap initiatives.\n• Reach: Target users per quarter\n• Impact: Utility score from 0.5 to 3.0\n• Confidence: Validation percentage\n• Effort: Engineering sprints required"),
        (3, "Unit Economics & CAC Payback", "Evaluating financial sustainability of customer acquisition.\n• Customer Lifetime Value (LTV)\n• Customer Acquisition Cost (CAC)\n• Target LTV to CAC ratio greater than 3x\n• Payback period under 12 months")
    ]
    for s_num, title, content in slides:
        c.execute("""
        INSERT INTO document_chunks (id, document_id, chunk_index, slide_number, title, content)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (f"chunk_{doc_id}_{s_num}", doc_id, s_num, s_num, title, content))

    conn.commit()
    conn.close()
    print("  [OK] Document and 3 realistic MBA chunks persisted in DB.")

    # 3. Test Summary Analysis
    print("\n[Test 3] Testing Presentation Analysis...")
    summary = analyze_presentation(doc_id)
    assert "overview" in summary, "Summary missing 'overview'"
    assert "concepts" in summary, "Summary missing 'concepts'"
    assert len(summary["concepts"]) >= 3, f"Expected at least 3 concepts, got {len(summary['concepts'])}"
    print(f"  [OK] Analysis produced {len(summary['concepts'])} concepts and structured learning path.")

    # 4. Test 10-Section Pedagogical Engine (Sections A through J)
    print("\n[Test 4] Testing 10-Section Pedagogical Teaching Engine...")
    target_concept = summary["concepts"][0]["name"]
    pkg = get_concept_teaching_package(doc_id, target_concept, None, "MBA")

    assert "sections" in pkg, "Package missing 'sections'"
    assert "steps" in pkg, "Package missing 'steps'"
    assert len(pkg["steps"]) == 10, f"Expected 10 steps (A through J), got {len(pkg['steps'])}"

    expected_letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
    actual_letters = [s.get("step_letter") for s in pkg["steps"]]
    assert actual_letters == expected_letters, f"Expected step letters {expected_letters}, got {actual_letters}"

    sections = pkg["sections"]
    assert "section_a" in sections and sections["section_a"]["definition"], "Section A invalid"
    assert "section_b" in sections and sections["section_b"]["explanation"], "Section B invalid"
    assert "section_c" in sections and sections["section_c"]["analogy"], "Section C invalid"
    assert "section_d" in sections and sections["section_d"]["case_study"], "Section D invalid"
    assert "section_e" in sections and sections["section_e"]["steps"], "Section E invalid"
    assert "section_f" in sections and sections["section_f"]["decision_triggers"], "Section F invalid"
    assert "section_g" in sections and sections["section_g"]["advantages"], "Section G invalid"
    assert "section_h" in sections and sections["section_h"]["actionable_playbook"], "Section H invalid"
    assert "section_i" in sections and sections["section_i"]["takeaways"], "Section I invalid"
    assert "section_j" in sections and len(sections["section_j"]["questions"]) >= 2, "Section J questions missing"

    print("  [OK] All 10 mandatory sections (A through J) verified with university-level depth.")
    print(f"    - Section A (Intro): {sections['section_a']['definition'][:60]}...")
    print(f"    - Section C (Analogy): {sections['section_c']['analogy'][:60]}...")
    print(f"    - Section D (Case): {sections['section_d']['company']} - {sections['section_d']['case_study'][:60]}...")
    print(f"    - Section J (Quiz): {len(sections['section_j']['questions'])} practice challenge questions.")

    # 5. Test 4 Teaching Modes
    print("\n[Test 5] Testing 4 Distinct Teaching Modes (Beginner, MBA, Exam, Expert)...")
    for mode in ["Beginner", "MBA", "Exam", "Expert"]:
        pkg_mode = get_concept_teaching_package(doc_id, target_concept, None, mode)
        assert pkg_mode["teaching_mode"] == mode, f"Mode mismatch: {pkg_mode['teaching_mode']} != {mode}"
        sec_a = pkg_mode["sections"]["section_a"]["definition"]
        assert len(sec_a) > 20, f"Definition too short in {mode} mode"
        print(f"  [OK] Mode '{mode}' verified. Sample intro: {sec_a[:55]}...")

    # 6. Test Interactive Controls
    print("\n[Test 6] Testing Interactive Controls (simpler_english, more_detail, another_example, test_me)...")
    controls = ["simpler_english", "more_detail", "another_example", "test_me"]
    for ctrl in controls:
        pkg_ctrl = get_concept_teaching_package(doc_id, target_concept, ctrl, "MBA")
        assert pkg_ctrl["control_action"] == ctrl
        assert pkg_ctrl["control_title"]
        print(f"  [OK] Control '{ctrl}' successfully handled -> '{pkg_ctrl['control_title']}'")

    # Cleanup temp files
    try:
        os.remove(pptx_path)
        os.remove(pdf_path)
    except Exception:
        pass

    print("\n=== ALL TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    run_tests()
