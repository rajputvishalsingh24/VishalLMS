import sys
import os
import traceback

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse

fallback_app = FastAPI(title="VISHAL SINGH LMS - Diagnostics")

@fallback_app.get("/api/health")
def health():
    return {
        "status": "online",
        "python": sys.version,
        "platform": sys.platform,
        "root_dir": root_dir,
        "files_in_root": os.listdir(root_dir) if os.path.exists(root_dir) else []
    }

import_error = None
backend_app = None

try:
    from backend.main import app as main_app
    backend_app = main_app
except BaseException:
    import_error = traceback.format_exc()
    print("FATAL IMPORT ERROR IN api/index.py:\n", import_error, file=sys.stderr)

if backend_app is not None:
    app = backend_app
else:
    app = fallback_app
    @app.get("/{full_path:path}")
    def show_error(full_path: str = ""):
        html = f"""<!DOCTYPE html>
<html>
<head><title>VISHAL SINGH - Server Initialization</title></head>
<body style="background:#0f172a;color:#f8fafc;padding:40px;font-family:sans-serif;">
  <div style="background:#1e293b;border:1px solid #ef4444;border-radius:12px;padding:24px;max-width:900px;margin:0 auto;">
    <h1 style="color:#ef4444;font-size:20px;">Startup Exception</h1>
    <pre style="background:#0f172a;color:#fca5a5;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;">{import_error}</pre>
  </div>
</body>
</html>"""
        return HTMLResponse(content=html, status_code=200)
