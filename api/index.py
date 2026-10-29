import sys
import os
import traceback

# Add root directory to sys.path so backend modules import properly
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

try:
    from backend.main import app
except Exception as e:
    err_tb = traceback.format_exc()
    print("FATAL STARTUP ERROR IN api/index.py:\n", err_tb, file=sys.stderr)
    from fastapi import FastAPI
    from fastapi.responses import HTMLResponse
    
    app = FastAPI(title="VISHAL SINGH LMS - Startup Diagnostics")
    
    @app.get("/")
    @app.get("/{full_path:path}")
    def fallback_diagnostics(full_path: str = ""):
        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>VISHAL SINGH - Server Initialization Error</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }}
        .card {{ background: #1e293b; border: 1px solid #ef4444; border-radius: 12px; padding: 24px; max-width: 900px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }}
        h1 {{ color: #ef4444; font-size: 20px; margin-top: 0; }}
        pre {{ background: #0f172a; color: #fca5a5; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; line-height: 1.5; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>VISHAL SINGH LMS — Server Initialization Error</h1>
        <p>A fatal exception occurred during application startup on Vercel:</p>
        <pre>{err_tb}</pre>
    </div>
</body>
</html>"""
        return HTMLResponse(content=html, status_code=500)
