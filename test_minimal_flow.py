import io
import json
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_full_user_flow():
    print("=== STARTING FULL END-TO-END VERIFICATION ===")

    # 1. Health check
    h = client.get("/api/health")
    assert h.status_code == 200
    print("[PASS] 1. API Health Check OK")

    # 2. Get initial subjects
    s_resp = client.get("/api/subjects")
    assert s_resp.status_code == 200
    print(f"[PASS] 2. Fetched subjects: {len(s_resp.json())} subjects found")

    # 3. Create Subject validation: empty name should return 400
    bad_sub = client.post("/api/subjects", json={"name": "   ", "description": "test"})
    assert bad_sub.status_code == 400
    print("[PASS] 3. Empty subject name correctly rejected with HTTP 400")

    # 4. Create Subject
    test_subj_name = "Strategic Brand Management"
    create_sub = client.post("/api/subjects", json={"name": test_subj_name, "description": "Advanced MBA brand strategy & positioning."})
    assert create_sub.status_code == 200
    sub_data = create_sub.json()
    subj_id = sub_data["id"]
    print(f"[PASS] 4. Subject created: id={subj_id}, name={sub_data['name']}")

    # 5. Duplicate name should return 400
    dup_sub = client.post("/api/subjects", json={"name": test_subj_name})
    assert dup_sub.status_code == 400
    print("[PASS] 5. Duplicate subject name correctly rejected with HTTP 400")

    # 6. Rename Subject
    update_sub = client.put(f"/api/subjects/{subj_id}", json={"name": "Strategic Brand Management (Updated)", "description": "Updated description"})
    assert update_sub.status_code == 200
    print("[PASS] 6. Subject successfully renamed")

    # 7. Get Subject Detail
    detail_sub = client.get(f"/api/subjects/{subj_id}")
    assert detail_sub.status_code == 200
    assert detail_sub.json()["name"] == "Strategic Brand Management (Updated)"
    print("[PASS] 7. Subject detail fetched successfully")

    # 8. Upload Presentation to this subject
    # Create a mock PPTX file
    file_bytes = b"PK\x03\x04test mock ppt content for brand equity and customer acquisition"
    upload_resp = client.post(
        "/api/documents/upload",
        data={"subject_id": subj_id, "semester": "Semester 2"},
        files={"file": ("Brand_Strategy_Masterclass.pptx", io.BytesIO(file_bytes), "application/vnd.openxmlformats-officedocument.presentationml.presentation")}
    )
    assert upload_resp.status_code == 200
    doc_id = upload_resp.json()["id"]
    print(f"[PASS] 8. Presentation uploaded: doc_id={doc_id}, slides={upload_resp.json()['slide_count']}")

    # 9. Rename Presentation Document
    rename_doc = client.put(f"/api/documents/{doc_id}", json={"name": "Brand Strategy & Customer Equity"})
    assert rename_doc.status_code == 200
    print("[PASS] 9. Presentation renamed successfully")

    # 10. Analyze presentation
    analyze_resp = client.post(f"/api/presentations/{doc_id}/analyze")
    assert analyze_resp.status_code == 200
    summary = analyze_resp.json()["summary"]
    assert "overview" in summary
    assert "concepts" in summary
    first_concept = summary["concepts"][0]["name"]
    print(f"[PASS] 10. Presentation analyzed: detected {len(summary['concepts'])} concepts, 1st concept='{first_concept}'")

    # 11. Fetch Summary via GET
    get_sum = client.get(f"/api/presentations/{doc_id}/summary")
    assert get_sum.status_code == 200
    print("[PASS] 11. Presentation summary fetched successfully")

    # 12. Teach concept with standard action
    teach_std = client.post(f"/api/presentations/{doc_id}/teach", json={"concept_name": first_concept})
    assert teach_std.status_code == 200
    pkg = teach_std.json()
    assert len(pkg["steps"]) == 8
    assert "external_sources" in pkg
    print(f"[PASS] 12. Concept teaching package generated: {len(pkg['steps'])} steps, {len(pkg['external_sources'])} external sources")

    # 13. Teach concept in Hinglish
    teach_hinglish = client.post(f"/api/presentations/{doc_id}/teach", json={"concept_name": first_concept, "control_action": "in_hinglish"})
    assert teach_hinglish.status_code == 200
    assert teach_hinglish.json()["control_title"] == "Conversational Hinglish Explanation"
    print("[PASS] 13. Teaching in Hinglish control verified")

    # 14. Teach concept as Framework
    teach_fw = client.post(f"/api/presentations/{doc_id}/teach", json={"concept_name": first_concept, "control_action": "framework"})
    assert teach_fw.status_code == 200
    assert teach_fw.json()["control_title"] == "Executive Framework Matrix"
    print("[PASS] 14. Teaching as Framework control verified")

    # 15. Dual Knowledge Ask AI Chat (with slide citation and web sources)
    chat_resp = client.post(
        f"/api/presentations/{doc_id}/chat",
        json={"query": "How do we measure brand loyalty and customer retention?", "concept_name": first_concept, "slide_number": 1}
    )
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()
    assert "reply" in chat_data
    assert "### From Your PPT" in chat_data["reply"]
    assert "### Sources" in chat_data["reply"]
    assert len(chat_data["sources"]) > 0
    print(f"[PASS] 15. Dual Knowledge Chat verified: Sources returned: {len(chat_data['sources'])}")

    # 16. Chat History Persistence
    chat_hist = client.get(f"/api/presentations/{doc_id}/chat")
    assert chat_hist.status_code == 200
    assert len(chat_hist.json()["messages"]) >= 2
    print(f"[PASS] 16. Chat history persisted: {len(chat_hist.json()['messages'])} messages stored")

    # 17. Printable Export
    print_resp = client.get(f"/api/presentations/{doc_id}/export-printable")
    assert print_resp.status_code == 200
    assert "text/html" in print_resp.headers["content-type"]
    print("[PASS] 17. Printable summary export verified")

    # 18. Clear chat history
    clear_resp = client.delete(f"/api/presentations/{doc_id}/chat")
    assert clear_resp.status_code == 200
    chat_after = client.get(f"/api/presentations/{doc_id}/chat")
    assert len(chat_after.json()["messages"]) == 0
    print("[PASS] 18. Chat history cleared successfully")

    # 19. Cascade Delete Subject
    del_subj = client.delete(f"/api/subjects/{subj_id}")
    assert del_subj.status_code == 200
    # Document should also be deleted
    doc_check = client.get(f"/api/documents/{doc_id}")
    assert doc_check.status_code == 404
    print("[PASS] 19. Cascade deletion of subject and document verified")

    print("\n=== ALL 19 CRITICAL TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    test_full_user_flow()
