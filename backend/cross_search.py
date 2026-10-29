"""
VISHAL SINGH LMS - Cross-Presentation Search & Synthesis Engine
Searches across all uploaded slide decks using SQLite FTS5 with fallback to pattern matching,
grouping results by Subject and Document, and synthesizing cross-deck insights.
"""

from typing import Dict, Any, List, Optional
from backend.database import get_db
from backend.ai_tutor import ask_ai_tutor_internal

def cross_search_presentations(
    query: str,
    subject_id: Optional[str] = None,
    limit: int = 15
) -> Dict[str, Any]:
    """Execute full-text cross-search across all presentation slides in the LMS."""
    query = query.strip()
    if not query:
        return {"query": "", "total_matches": 0, "results": []}

    results = []
    with get_db() as conn:
        cursor = conn.cursor()

        # Try FTS5 first
        try:
            fts_query = """
                SELECT dc.id, dc.document_id, dc.slide_number, dc.content,
                       COALESCE(d.name, d.original_filename, 'Document') as document_name, s.name as subject_name, s.id as subject_id
                FROM document_chunks_fts fts
                JOIN document_chunks dc ON fts.rowid = dc.rowid
                JOIN documents d ON dc.document_id = d.id
                JOIN subjects s ON d.subject_id = s.id
                WHERE document_chunks_fts MATCH ?
            """
            params = [query]
            if subject_id:
                fts_query += " AND s.id = ?"
                params.append(subject_id)
            fts_query += f" LIMIT {limit}"

            cursor.execute(fts_query, params)
            rows = cursor.fetchall()
            results = [dict(r) for r in rows]
        except Exception:
            results = []

        # Fallback to standard LIKE if FTS produced no rows or encountered syntax issue
        if not results:
            like_query = """
                SELECT dc.id, dc.document_id, dc.slide_number, dc.content,
                       COALESCE(d.name, d.original_filename, 'Document') as document_name, s.name as subject_name, s.id as subject_id
                FROM document_chunks dc
                JOIN documents d ON dc.document_id = d.id
                JOIN subjects s ON d.subject_id = s.id
                WHERE (dc.content LIKE ? OR dc.title LIKE ? OR dc.speaker_notes LIKE ?)
            """
            pattern = f"%{query}%"
            params = [pattern, pattern, pattern]
            if subject_id:
                like_query += " AND s.id = ?"
                params.append(subject_id)
            like_query += f" ORDER BY dc.slide_number ASC LIMIT {limit}"

            cursor.execute(like_query, params)
            results = [dict(r) for r in cursor.fetchall()]

    # Format snippets
    formatted = []
    for r in results:
        content = r.get("content", "")
        # Find excerpt around search term
        idx = content.lower().find(query.lower())
        if idx != -1:
            start = max(0, idx - 60)
            end = min(len(content), idx + len(query) + 90)
            snippet = ("..." if start > 0 else "") + content[start:end].strip() + ("..." if end < len(content) else "")
        else:
            snippet = content[:150] + "..." if len(content) > 150 else content

        formatted.append({
            "chunk_id": r["id"],
            "document_id": r["document_id"],
            "document_name": r["document_name"],
            "subject_name": r["subject_name"],
            "slide_number": r["slide_number"],
            "snippet": snippet
        })

    return {
        "query": query,
        "total_matches": len(formatted),
        "results": formatted
    }


def synthesize_cross_presentation_query(query: str, subject_id: Optional[str] = None) -> Dict[str, Any]:
    """Search all presentations for relevant slides, then synthesize an executive MBA answer."""
    search_res = cross_search_presentations(query=query, subject_id=subject_id, limit=8)
    matches = search_res["results"]

    if not matches:
        return {
            "query": query,
            "answer": f"No direct mentions of '{query}' found across uploaded presentation slides. Try broadening the search term or uploading related lecture slide decks.",
            "citations": []
        }

    context_snippets = []
    citations = []
    for m in matches[:5]:
        context_snippets.append(f"[{m['document_name']} — Slide {m['slide_number']}]: {m['snippet']}")
        citations.append({
            "document_id": m["document_id"],
            "document_name": m["document_name"],
            "slide_number": m["slide_number"]
        })

    prompt = (
        f"Synthesize an executive MBA briefing answering: '{query}'. "
        f"Base your analysis strictly on the following excerpted slide contexts:\n\n"
        + "\n\n".join(context_snippets)
    )

    try:
        tutor_resp = ask_ai_tutor_internal(question=prompt, teaching_mode="Expert")
        ans_text = tutor_resp.get("response", "")
    except Exception:
        ans_text = f"Key findings across {len(matches)} slides for '{query}':\n" + "\n".join([f"- {c}" for c in context_snippets[:3]])

    return {
        "query": query,
        "answer": ans_text,
        "citations": citations
    }
