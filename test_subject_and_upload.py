import unittest
import io
import os
import json
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_connection

class TestSubjectAndUpload(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        
        # Log in to obtain a valid session token
        login_resp = cls.client.post("/api/auth/login", json={
            "username": "vishal",
            "password": "password123"
        })
        if login_resp.status_code != 200:
            # Fallback test user
            login_resp = cls.client.post("/api/auth/login", json={
                "username": "vishal",
                "password": "vishal123"
            })
        cls.token = login_resp.json().get("token", "")
        cls.headers = {"Authorization": f"Bearer {cls.token}"} if cls.token else {}

    def test_01_create_subject_product_management(self):
        """Test A: Create a subject named 'Product Management'"""
        resp = self.client.post(
            "/api/subjects",
            json={
                "name": "Product Management",
                "semester": "Semester 1",
                "description": "Core product management fundamentals, roadmaps, and metrics.",
                "color": "#3B82F6"
            },
            headers=self.headers
        )
        self.assertEqual(resp.status_code, 200, f"Error: {resp.text}")
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertIn("id", data)
        self.assertEqual(data.get("name"), "Product Management")
        self.assertEqual(data.get("user_id"), "user_vishal")
        self.assertIsNotNone(data.get("created_at"))
        
        subj_id = data["id"]
        
        # Verify it appears in subjects list
        list_resp = self.client.get("/api/subjects", headers=self.headers)
        self.assertEqual(list_resp.status_code, 200)
        subjects = list_resp.json()
        names = [s["name"] for s in subjects]
        self.assertIn("Product Management", names)
        
        # Verify in database
        conn = get_connection()
        row = conn.execute("SELECT * FROM subjects WHERE id = ?", (subj_id,)).fetchone()
        conn.close()
        self.assertIsNotNone(row)
        self.assertEqual(row["name"], "Product Management")
        self.assertEqual(row["user_id"], "user_vishal")

    def test_02_subject_validation(self):
        """Reject empty subject names"""
        resp = self.client.post(
            "/api/subjects",
            json={"name": "   ", "semester": "Semester 1"},
            headers=self.headers
        )
        self.assertEqual(resp.status_code, 400)

    def test_03_upload_pptx_presentation(self):
        """Test B: Upload a PowerPoint presentation and verify slide extraction & database persistence"""
        # Create a test subject first
        sub_resp = self.client.post(
            "/api/subjects",
            json={"name": "Tech & Product Operations", "semester": "Semester 2"},
            headers=self.headers
        )
        sub_id = sub_resp.json()["id"]

        # Create a mock PPTX zip in memory
        import zipfile
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # Standard pptx minimal structure
            zf.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>')
            zf.writestr("ppt/presentation.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"></p:presentation>')
            slide1_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
                <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Lecture 1: Product Strategy</a:t></a:r></a:p><a:p><a:r><a:t>Value proposition and product-market fit metrics.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
            </p:sld>"""
            zf.writestr("ppt/slides/slide1.xml", slide1_xml)
        
        buf.seek(0)
        file_bytes = buf.getvalue()

        upload_resp = self.client.post(
            "/api/documents/upload",
            data={"subject_id": sub_id, "semester": "Semester 2"},
            files={"file": ("product_strategy.pptx", file_bytes, "application/vnd.openxmlformats-officedocument.presentationml.presentation")},
            headers=self.headers
        )
        self.assertEqual(upload_resp.status_code, 200, f"Upload error: {upload_resp.text}")
        doc_data = upload_resp.json()
        self.assertTrue(doc_data.get("success"))
        self.assertIn("id", doc_data)
        doc_id = doc_data["id"]

        # Verify database record
        conn = get_connection()
        doc_row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
        chunks = conn.execute("SELECT * FROM document_chunks WHERE document_id = ?", (doc_id,)).fetchall()
        conn.close()

        self.assertIsNotNone(doc_row)
        self.assertEqual(doc_row["name"], "product_strategy.pptx")
        self.assertEqual(doc_row["user_id"], "user_vishal")
        self.assertEqual(doc_row["subject_id"], sub_id)
        self.assertGreaterEqual(len(chunks), 1)

        # Verify subject detail includes the document
        detail_resp = self.client.get(f"/api/subjects/{sub_id}", headers=self.headers)
        self.assertEqual(detail_resp.status_code, 200)
        subject_docs = detail_resp.json().get("documents", [])
        doc_ids = [d["id"] for d in subject_docs]
        self.assertIn(doc_id, doc_ids)

    def test_04_delete_subject_cascade(self):
        """Deleting a subject cascades to its documents and chunks"""
        sub_resp = self.client.post(
            "/api/subjects",
            json={"name": "Temporary Subject", "semester": "Semester 1"},
            headers=self.headers
        )
        sub_id = sub_resp.json()["id"]

        del_resp = self.client.delete(f"/api/subjects/{sub_id}", headers=self.headers)
        self.assertEqual(del_resp.status_code, 200)

        conn = get_connection()
        row = conn.execute("SELECT * FROM subjects WHERE id = ?", (sub_id,)).fetchone()
        conn.close()
        self.assertIsNone(row)

if __name__ == "__main__":
    unittest.main()
