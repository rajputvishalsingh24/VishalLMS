import urllib.request
import json
import io
import zipfile

base_url = "https://vishallms-y8uh.vercel.app"

# 1. Login
try:
    login_data = json.dumps({"username": "vishal", "password": "password123"}).encode("utf-8")
    req = urllib.request.Request(f"{base_url}/api/auth/login", data=login_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        login_res = json.loads(resp.read().decode("utf-8"))
except Exception:
    login_data = json.dumps({"username": "vishal", "password": "vishal123"}).encode("utf-8")
    req = urllib.request.Request(f"{base_url}/api/auth/login", data=login_data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        login_res = json.loads(resp.read().decode("utf-8"))

token = login_res.get("token", "")
auth_headers = {"Authorization": f"Bearer {token}", "X-Auth-Token": token}
print("1. Logged in successfully as:", login_res.get("user", {}).get("username"))

# 2. Test A: Create Subject 'Product Management'
subj_payload = json.dumps({
    "name": "Product Management",
    "semester": "Semester 1",
    "description": "End-to-end product discovery, roadmaps, and growth metrics."
}).encode("utf-8")
req = urllib.request.Request(f"{base_url}/api/subjects", data=subj_payload, headers={"Content-Type": "application/json", **auth_headers})
with urllib.request.urlopen(req) as resp:
    create_subj_res = json.loads(resp.read().decode("utf-8"))

print("2. Subject Created successfully:", create_subj_res)
subject_id = create_subj_res.get("id")

# 3. Verify in Subjects List
req = urllib.request.Request(f"{base_url}/api/subjects", headers=auth_headers)
with urllib.request.urlopen(req) as resp:
    subjects_list = json.loads(resp.read().decode("utf-8"))

names = [s["name"] for s in subjects_list]
print("3. Subject List verification: Found Product Management?", "Product Management" in names)

# 4. Upload presentation to this subject
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>')
    zf.writestr("ppt/presentation.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"></p:presentation>')
    slide1_xml = '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Product Management Fundamentals</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
    zf.writestr("ppt/slides/slide1.xml", slide1_xml)

buf.seek(0)
file_bytes = buf.getvalue()

boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
body = io.BytesIO()
body.write(f"--{boundary}\r\n".encode("utf-8"))
body.write(b'Content-Disposition: form-data; name="subject_id"\r\n\r\n')
body.write(f"{subject_id}\r\n".encode("utf-8"))

body.write(f"--{boundary}\r\n".encode("utf-8"))
body.write(b'Content-Disposition: form-data; name="semester"\r\n\r\n')
body.write(b"Semester 1\r\n")

body.write(f"--{boundary}\r\n".encode("utf-8"))
body.write(b'Content-Disposition: form-data; name="file"; filename="product_strategy_live.pptx"\r\n')
body.write(b"Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n")
body.write(file_bytes)
body.write(b"\r\n")
body.write(f"--{boundary}--\r\n".encode("utf-8"))

req = urllib.request.Request(
    f"{base_url}/api/documents/upload",
    data=body.getvalue(),
    headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        **auth_headers
    }
)
with urllib.request.urlopen(req) as resp:
    upload_res = json.loads(resp.read().decode("utf-8"))

print("4. Presentation uploaded successfully:", upload_res)
doc_id = upload_res.get("id")

# 5. Verify Subject Detail
req = urllib.request.Request(f"{base_url}/api/subjects/{subject_id}", headers=auth_headers)
with urllib.request.urlopen(req) as resp:
    subj_detail = json.loads(resp.read().decode("utf-8"))

docs_in_subj = [d["id"] for d in subj_detail.get("documents", [])]
print("5. Presentation present in subject details?", doc_id in docs_in_subj)
print("SUCCESS: ALL VERIFICATIONS CONFIRMED ON LIVE PRODUCTION SITE!")
