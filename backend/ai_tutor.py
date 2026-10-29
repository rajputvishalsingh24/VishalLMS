import os
import json
import re
from typing import List, Dict, Any, Optional
from .database import get_connection

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

def get_configured_api_key() -> str:
    """Retrieve API key from env or database user settings."""
    if GEMINI_API_KEY:
        return GEMINI_API_KEY
    conn = get_connection()
    row = conn.execute("SELECT value FROM user_settings WHERE key = 'gemini_api_key'").fetchone()
    conn.close()
    if row and row["value"]:
        return row["value"]
    return ""

def search_chunks(query: str, subject_id: Optional[str] = None, document_id: Optional[str] = None, limit: int = 6) -> List[Dict[str, Any]]:
    """
    RAG Search: Full-Text search and ranking over document slides and pages.
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    # Clean query for FTS
    clean_query = re.sub(r'[^\w\s]', ' ', query).strip()
    words = [w for w in clean_query.split() if len(w) > 2]
    
    results = []
    
    # 1. Try FTS5 if words available
    if words:
        fts_query = " OR ".join(words)
        try:
            sql = """
            SELECT dc.id, dc.document_id, dc.slide_number, dc.page_number, dc.title, dc.content, dc.takeaways,
                   d.name as doc_name, d.file_type, s.name as subject_name
            FROM document_chunks dc
            JOIN documents d ON dc.document_id = d.id
            LEFT JOIN subjects s ON d.subject_id = s.id
            WHERE dc.id IN (
                SELECT chunk_id FROM document_chunks_fts 
                WHERE document_chunks_fts MATCH ?
            )
            """
            params = [fts_query]
            if document_id:
                sql += " AND dc.document_id = ?"
                params.append(document_id)
            elif subject_id:
                sql += " AND d.subject_id = ?"
                params.append(subject_id)
            sql += f" LIMIT {limit}"
            
            rows = cursor.execute(sql, params).fetchall()
            for r in rows:
                results.append(dict(r))
        except Exception as e:
            # Fallback to LIKE query if FTS has an issue
            pass
            
    # 2. Fallback or augment with LIKE query
    if len(results) < limit:
        like_sql = """
        SELECT dc.id, dc.document_id, dc.slide_number, dc.page_number, dc.title, dc.content, dc.takeaways,
               d.name as doc_name, d.file_type, s.name as subject_name
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        LEFT JOIN subjects s ON d.subject_id = s.id
        WHERE 1=1
        """
        params = []
        if document_id:
            like_sql += " AND dc.document_id = ?"
            params.append(document_id)
        elif subject_id:
            like_sql += " AND d.subject_id = ?"
            params.append(subject_id)
            
        if words:
            like_clause = " OR ".join(["(dc.title LIKE ? OR dc.content LIKE ?)" for _ in words[:3]])
            like_sql += f" AND ({like_clause})"
            for w in words[:3]:
                params.extend([f"%{w}%", f"%{w}%"])
                
        existing_ids = [r["id"] for r in results]
        if existing_ids:
            placeholders = ",".join(["?"] * len(existing_ids))
            like_sql += f" AND dc.id NOT IN ({placeholders})"
            params.extend(existing_ids)
            
        like_sql += f" LIMIT {limit - len(results)}"
        rows = cursor.execute(like_sql, params).fetchall()
        for r in rows:
            results.append(dict(r))

    conn.close()
    return results

def call_gemini(prompt: str, system_instruction: str = "") -> Optional[str]:
    """Call Google Gemini API via REST endpoint with zero extra binary dependencies."""
    api_key = get_configured_api_key()
    if not api_key:
        return None
    try:
        import requests
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}]
        }
        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
        resp = requests.post(url, json=payload, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "")
    except Exception as e:
        print(f"Gemini REST API notice: {e}")
    return None

def answer_tutor_query(
    query: str,
    mode: str = "ask_materials",
    subject_id: Optional[str] = None,
    document_id: Optional[str] = None,
    detail_level: str = "normal",
    teaching_mode: str = "MBA"
) -> Dict[str, Any]:
    """
    Master AI Tutor dispatcher supporting citations, grounding, and 4 Teaching Modes:
    - Beginner (ELI5 / Intuitive analogies, zero jargon)
    - MBA (Executive business school rigor, frameworks, strategic tradeoffs)
    - Exam (High-yield definitions, marking schemes, exam questions)
    - Expert (First-principles, deep edge cases, counter-intuitive nuances)
    """
    chunks = search_chunks(query, subject_id=subject_id, document_id=document_id, limit=5)
    
    # Construct context block
    context_str = ""
    citations = []
    for c in chunks:
        doc_name = c.get("doc_name", "Document")
        slide_num = c.get("slide_number", 1)
        ref = f"{doc_name} (Slide/Page {slide_num})"
        citations.append({"document": doc_name, "slide": slide_num, "title": c.get("title", "")})
        context_str += f"\n--- SOURCE: {ref} | Topic: {c.get('title')} ---\n{c.get('content')}\n"

    # Define mode-specific instructions
    mode_instructions = {
        "Beginner": "Adopt an ELI5 (Explain Like I'm 5) pedagogical approach. Avoid heavy corporate jargon, use everyday metaphors (e.g. lemonade stands, smartphones, sports), and explain concepts from fundamental human intuition.",
        "MBA": "Adopt a top-tier MBA Professor persona. Emphasize strategic frameworks (Porter's 5 Forces, SWOT, Unit Economics, RICE), quantitative trade-offs, managerial decision-making, and market dynamics.",
        "Exam": "Adopt a rigorous Exam Prep Tutor persona. Prioritize high-yield exam definitions, bullet-pointed summaries, structured marking-scheme criteria, common examiner trick questions, and concise memory mnemonics.",
        "Expert": "Adopt a C-Suite Strategy & Principal Product Director persona. Focus on edge-case failure modes, first-principles unit economics, second-order consequences, organizational inertia, and counter-intuitive industry realpolitik."
    }
    pedagogy_guide = mode_instructions.get(teaching_mode, mode_instructions["MBA"])

    system_prompt = f"""You are the personal AI MBA Tutor for Vishal Singh on his platform 'VISHAL SINGH'.
You are teaching Vishal using his uploaded MBA study materials.
Pedagogy Style: {teaching_mode} Mode ({pedagogy_guide})

Guidelines:
1. Always cite exact source documents and slide/page numbers when referencing uploaded materials.
2. If the user's question cannot be answered from the materials, explicitly clarify that it is not in the uploaded documents, but offer general MBA context clearly marked as [General Knowledge].
3. Format output cleanly in GitHub-flavored Markdown with bold headers, bullet points, and practical examples.
4. Active learning mode: {mode}.
"""

    if mode == "simple_explanation":
        prompt = f"""Provide a structured explanation for: "{query}".
Context from Vishal's MBA materials:
{context_str}

Please strictly provide the following 8 sections:
### 1. What is it?
(Clear, simple definition without unnecessary jargon)

### 2. Why is it important?
(Strategic and managerial importance in business)

### 3. How does it work?
(Step-by-step mechanism or framework breakdown)

### 4. Practical Business Example
(A real-world company case e.g., Apple, Netflix, Amazon, Starbucks)

### 5. Product Management Application
(How a Product Manager uses this in discovery, strategy, sprint, or roadmapping)

### 6. Key Points to Remember
(3-4 high-yield bullet points for quick retention)

### 7. Common Mistakes & Misunderstandings
(Where students or managers commonly get confused)

### 8. Three Questions to Check Understanding
(1 conceptual question, 1 scenario question, 1 application question)
"""
    elif mode == "teach_step_by_step":
        prompt = f"""Vishal wants to learn step-by-step: "{query}".
Materials available:
{context_str}

Break this into Lesson Step 1 of an interactive tutorial:
1. Introduce the core intuition with a relatable real-life analogy.
2. Explain key terminology clearly.
3. Walk through the first fundamental concept.
4. End with a single interactive question to check Vishal's understanding before moving to step 2.
"""
    elif mode == "presentation_explainer":
        prompt = f"""Analyze the presentation slide for query/slide: "{query}".
Slide materials:
{context_str}

Provide:
- **Slide Title & Focus**
- **Main Idea (Simple English)**
- **Detailed Explanation**
- **Important Terms & Definitions**
- **Relevant Business/PM Example**
- **Key Takeaway**
- **Possible MBA Examination Question**
Include exact slide references.
"""
    else: # ask_materials
        prompt = f"""Vishal asks: "{query}".
Relevant passages from his study library:
{context_str}

Provide a comprehensive, grounded answer. Cite specific slide/page numbers from his materials.
If information is missing, state it clearly.
"""

    # Try live Gemini call
    ai_response = call_gemini(prompt, system_instruction=system_prompt)
    
    if not ai_response:
        # High quality offline MBA fallback generator
        ai_response = generate_offline_mba_tutor_response(query, mode, chunks, citations)

    return {
        "query": query,
        "mode": mode,
        "teaching_mode": teaching_mode,
        "response": ai_response,
        "citations": citations,
        "source_count": len(chunks)
    }

def ask_ai_tutor_internal(
    question: str,
    document_id: Optional[str] = None,
    slide_number: Optional[int] = None,
    teaching_mode: str = "MBA"
) -> Dict[str, Any]:
    """Helper for internal backend engines to query AI tutor with consistent grounding."""
    query = question
    if slide_number:
        query = f"[Slide {slide_number}] {question}"
    return answer_tutor_query(
        query=query,
        mode="simple_explanation" if teaching_mode == "Beginner" else "ask_materials",
        document_id=document_id,
        teaching_mode=teaching_mode
    )

def generate_offline_mba_tutor_response(query: str, mode: str, chunks: List[Dict[str, Any]], citations: List[Dict[str, Any]]) -> str:
    """
    Intelligent built-in pedagogical MBA tutor response dynamically constructed
    from the actual uploaded document slides and chunks.
    """
    topic_name = query.title()
    citation_text = ""
    if citations:
        citation_text = f"\n\n> 📚 **Cited Sources from Your Library:**\n" + "\n".join([f"> - **{c['document']}**, Slide/Page {c['slide']} (`{c['title']}`)" for c in citations[:4]])
    
    # Use content from top matching chunk if available
    top_chunk = chunks[0] if chunks else None
    slide_title = top_chunk["title"] if top_chunk else topic_name
    slide_num = top_chunk["slide_number"] if top_chunk else 1
    doc_name = top_chunk["doc_name"] if top_chunk else "Study Material"
    raw_content = top_chunk["content"] if top_chunk else f"Discussion and strategic principles of {topic_name}."
    
    # Parse bullet points and takeaways from the actual slide
    content_lines = [l.strip().lstrip("•-* ") for l in raw_content.split("\n") if len(l.strip()) > 5]
    if not content_lines:
        content_lines = [f"Foundational concepts and execution framework for {slide_title}"]

    takeaways_list = []
    if top_chunk and top_chunk.get("takeaways"):
        try:
            t_raw = top_chunk["takeaways"]
            takeaways_list = json.loads(t_raw) if isinstance(t_raw, str) else t_raw
        except Exception:
            takeaways_list = content_lines[:3]
    if not takeaways_list:
        takeaways_list = content_lines[:3]

    if mode == "simple_explanation":
        key_points_str = "\n".join([f"- **{l}**" for l in content_lines[:4]])
        return f"""## 📘 Simple Explanation: {slide_title}
**Source Document:** `{doc_name}` (Slide/Page {slide_num})

### 1. What is it?
**{slide_title}** is a core operational and strategic concept in management. Based on your uploaded materials, it focuses on:
> *"{content_lines[0] if content_lines else slide_title}"*

### 2. Why is it important?
In managerial decision-making, mastering **{slide_title}** provides strategic leverage, eliminates operational friction, and ensures that cross-functional teams execute towards quantified business outcomes.

### 3. How does it work?
Your presentation outlines the following structural mechanism:
{chr(10).join([f"{i+1}. **{line}**" for i, line in enumerate(content_lines[:4])])}

### 4. Practical Business Example
- **Real-World Application:** Leading firms apply this exact framework to mitigate risk, benchmark competitors, and ensure continuous customer value delivery during growth phases.

### 5. Product Management Application
In modern product management, PMs leverage this concept during sprint roadmapping and discovery interviews to prioritize high-leverage initiatives over non-essential features.

### 6. Key Points to Remember (From Your Slide)
{key_points_str}

### 7. Common Mistakes & Misunderstandings
- Treating this concept as a one-time static document rather than an iterative managerial tool.
- Confusing high-level strategic outcomes with day-to-day tactical outputs.

### 8. Check Your Understanding
1. *Conceptual:* How does **{slide_title}** directly support the primary business goals stated in your materials?
2. *Scenario:* If your team encounters unexpected market headwinds, how should this framework be adapted?
3. *Application:* Based on Slide {slide_num}, what is the first operational step you would execute?{citation_text}
"""
    elif mode == "teach_step_by_step":
        first_concept = content_lines[0] if content_lines else slide_title
        second_concept = content_lines[1] if len(content_lines) > 1 else "Strategic Alignment"
        return f"""## 🎓 Step-by-Step Lesson: {slide_title}
**Document:** `{doc_name}` | **Slide:** #{slide_num}

### Lesson 1: The Core Intuition
Think of **{slide_title}** as a navigation compass in business. Just as an architect needs blueprints before constructing a building, business leaders use this concept to ensure all team efforts build toward the same vision.

### Key Terminology from Your Materials
- **{first_concept.split(':')[0] if ':' in first_concept else 'Primary Objective'}:** The baseline requirement for achieving measurable business outcomes.
- **{second_concept.split(':')[0] if ':' in second_concept else 'Execution Focus'}:** The disciplined alignment of resources and priorities.

### Fundamental Principle (Slide {slide_num})
Your uploaded notes highlight:
> *"{first_concept}"*

---
### ❓ Interactive Check Question for Vishal:
Based on your study materials on **{slide_title}**, which action represents the most effective starting point?
- [A] Diving directly into task execution without strategic alignment
- [B] Establishing clear problem validation and outcome metrics ({first_concept[:45]}...)
- [C] Delaying all decisions until complete annual forecasts are finalized

*Reply with your answer or click **Next Lesson Step** / **Explain Again** below.*{citation_text}
"""
    elif mode == "presentation_explainer":
        return f"""## 📊 Slide Explainer: Slide {slide_num} - {slide_title}
**Document:** `{doc_name}` | **Slide/Page:** #{slide_num}

### Main Idea (Simple English)
This slide focuses on establishing clarity around **{slide_title}**. It emphasizes that structured decision-making and cross-functional alignment are prerequisites for operational success.

### Detailed Breakdown of Slide Content
{chr(10).join([f"- **Key Element {i+1}:** {line}" for i, line in enumerate(content_lines[:5])])}

### Important Terms on This Slide
- **{slide_title}:** The overarching theme of this presentation section.
- **{content_lines[0][:30] if content_lines else 'Strategic Metric'}:** Key driver of performance.

### Practical Business Example
- High-performing technology and MBA benchmark companies use this principle to align product development, financial planning, and go-to-market strategies.

### Key Takeaway
Features and tasks are outputs; verified customer problem resolution and sustainable business margins are the true measures of success.

### Possible MBA Examination Question
*Critically evaluate how the principles in Slide {slide_num} ('{slide_title}') mitigate business execution risk compared to unstructured approaches.*{citation_text}
"""
    else: # ask_materials
        bullets_summary = "\n".join([f"- {l}" for l in content_lines[:4]])
        return f"""## 🎯 Analysis of "{query}"

Based on the study materials in your personal MBA library:

### Primary Grounded Findings
In your document **{doc_name}** (Slide/Page {slide_num}, *{slide_title}*), this topic is addressed with the following core points:

{bullets_summary}

### Strategic Synthesis
1. **Core Insight:** The materials emphasize disciplined validation, clear prioritization frameworks, and continuous feedback loops.
2. **Framework Alignment:** This connects directly with MBA core concepts in strategic management, customer discovery, and financial feasibility.

> 💡 **Tutor Note:** To enable live Gemini AI synthesis with your custom cloud model, enter your free Gemini API key in **Settings** anytime.{citation_text}
"""

def generate_quiz_for_topic(subject_id: Optional[str], topic_id: Optional[str], document_id: Optional[str], difficulty: str = "MBA Examination Level", format_type: str = "Multiple Choice", num_questions: int = 5) -> Dict[str, Any]:
    """
    Generate questions dynamically grounded in the user's actual uploaded materials.
    """
    conn = get_connection()
    c = conn.cursor()

    # Retrieve chunks for the specified document or subject
    chunks = []
    doc_name = "Study Material"
    if document_id:
        doc_row = c.execute("SELECT name FROM documents WHERE id = ?", (document_id,)).fetchone()
        if doc_row:
            doc_name = doc_row["name"]
        rows = c.execute("""
        SELECT chunk_index, slide_number, page_number, title, content, takeaways
        FROM document_chunks
        WHERE document_id = ?
        ORDER BY slide_number ASC
        LIMIT 15
        """, (document_id,)).fetchall()
        chunks = [dict(r) for r in rows]
    elif subject_id:
        rows = c.execute("""
        SELECT dc.chunk_index, dc.slide_number, dc.page_number, dc.title, dc.content, dc.takeaways, d.name as doc_name
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE d.subject_id = ?
        ORDER BY dc.created_at DESC
        LIMIT 15
        """, (subject_id,)).fetchall()
        chunks = [dict(r) for r in rows]
        if chunks and chunks[0].get("doc_name"):
            doc_name = chunks[0]["doc_name"]
    else:
        rows = c.execute("""
        SELECT dc.chunk_index, dc.slide_number, dc.page_number, dc.title, dc.content, dc.takeaways, d.name as doc_name
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        ORDER BY dc.created_at DESC
        LIMIT 15
        """, ()).fetchall()
        chunks = [dict(r) for r in rows]
        if chunks and chunks[0].get("doc_name"):
            doc_name = chunks[0]["doc_name"]

    conn.close()

    # Try Gemini generation if API key is present
    api_key = get_configured_api_key()
    if api_key and chunks:
        context_text = "\n".join([f"Slide {ch.get('slide_number', i+1)}: {ch.get('title')} - {ch.get('content')[:200]}" for i, ch in enumerate(chunks[:6])])
        prompt = f"""Generate {num_questions} high-quality {difficulty} quiz questions based strictly on these slides from {doc_name}:
{context_text}

Return ONLY a valid JSON array with this structure:
[
  {{
    "id": 1,
    "question": "question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "Option A",
    "explanation": "detailed explanation citing the slide",
    "mistake_analysis": "why other choices are incorrect",
    "source_citation": "{doc_name}, Slide X"
  }}
]
"""
        try:
            gemini_out = call_gemini(prompt)
            if gemini_out:
                clean_json = re.sub(r'^```json\s*', '', gemini_out.strip(), flags=re.MULTILINE)
                clean_json = re.sub(r'```$', '', clean_json.strip())
                parsed_questions = json.loads(clean_json)
                if isinstance(parsed_questions, list) and len(parsed_questions) > 0:
                    return {
                        "title": f"Practice Quiz: {doc_name} ({difficulty})",
                        "difficulty": difficulty,
                        "format": format_type,
                        "questions": parsed_questions[:num_questions]
                    }
        except Exception as e:
            print(f"Gemini quiz generation fallback: {e}")

    # Grounded Dynamic Offline Quiz Generator from Slide Chunks
    questions = []
    if chunks:
        for idx, ch in enumerate(chunks[:num_questions], start=1):
            s_num = ch.get("slide_number", idx)
            s_title = ch.get("title", f"Slide {s_num}")
            s_content = ch.get("content", "")
            lines = [l.strip().lstrip("•-* ") for l in s_content.split("\n") if len(l.strip()) > 10]
            
            correct_fact = lines[0] if lines else f"Covers strategic principles of {s_title}"
            second_fact = lines[1] if len(lines) > 1 else "Disciplined execution and team alignment"

            # Create plausible distractors
            distractor_1 = f"Confining {s_title} solely to short-term micro-tasks without strategic direction"
            distractor_2 = "Ignoring customer validation and assuming market demand without empirical data"
            distractor_3 = "Allocating capital exclusively to unvalidated high-cost marketing campaigns"

            options = [correct_fact, distractor_1, distractor_2, distractor_3]
            # Shuffle options deterministically
            import random
            rnd = random.Random(s_num * 17)
            rnd.shuffle(options)

            questions.append({
                "id": idx,
                "question": f"According to Slide {s_num} ('{s_title}'), what is the primary strategic principle emphasized?",
                "options": options,
                "correct_answer": correct_fact,
                "explanation": f"Slide {s_num} ('{s_title}') highlights: '{correct_fact}'. In strategic management, this ensures resources directly create differentiated customer value.",
                "mistake_analysis": "Distractors represent common managerial traps, such as prematurely scaling or focusing on outputs rather than outcomes.",
                "source_citation": f"{doc_name}, Slide {s_num}"
            })

    if not questions:
        # Fallback question if no chunks exist
        questions = [{
            "id": 1,
            "question": f"What is the primary objective of studying {doc_name}?",
            "options": [
                "To establish structured strategic frameworks and customer-centric value delivery",
                "To eliminate all documentation and planning",
                "To bypass product discovery and customer interviews",
                "To focus only on short-term vanity metrics"
            ],
            "correct_answer": "To establish structured strategic frameworks and customer-centric value delivery",
            "explanation": "Foundational management requires systematic validation and sustainable unit economics.",
            "mistake_analysis": "Ignoring customer discovery leads to high product failure rates.",
            "source_citation": f"{doc_name}, Slide 1"
        }]

    return {
        "title": f"Practice Quiz: {doc_name} ({difficulty})",
        "difficulty": difficulty,
        "format": format_type,
        "questions": questions
    }

def generate_notes_for_topic(subject_id: Optional[str], topic_id: Optional[str], note_type: str = "quick_revision", title: str = "Study Notes") -> Dict[str, Any]:
    """
    Generate AI revision notes, flashcards, one-pagers, or formula sheets.
    """
    if note_type == "flashcards":
        content = json.dumps([
            {"front": "What is the Kano Model?", "back": "A framework that classifies customer preferences into Must-Haves, Performance attributes, and Delighters."},
            {"front": "What is Product-Market Fit (PMF)?", "back": "Being in a good market with a product that can satisfy that market sustainably."},
            {"front": "What is the recommended LTV:CAC ratio?", "back": "3:1 or higher for healthy, scalable unit economics."},
            {"front": "What is the difference between Scrum and Kanban?", "back": "Scrum uses time-boxed sprints and defined roles; Kanban manages continuous flow with WIP limits."},
            {"front": "What are Porter's Five Forces?", "back": "Supplier Power, Buyer Power, Competitive Rivalry, Threat of Substitution, Threat of New Entry."}
        ])
    elif note_type == "formula_sheet":
        content = """# 📐 MBA Quantitative & Business Formulas

### 1. Customer Lifetime Value (LTV)
$$\\text{LTV} = \\frac{\\text{Average Order Value} \\times \\text{Purchase Frequency}}{\\text{Churn Rate}} \\times \\text{Gross Margin}$$
- **AOV:** Average monetary amount per transaction
- **Churn Rate:** Percentage of customers who cancel service within a given period

### 2. Customer Acquisition Cost (CAC)
$$\\text{CAC} = \\frac{\\text{Total Sales \\& Marketing Expenses}}{\\text{Total New Customers Acquired}}$$

### 3. Net Present Value (NPV)
$$\\text{NPV} = \\sum_{t=1}^{T} \\frac{C_t}{(1 + r)^t} - C_0$$
- $C_t$: Net cash inflow during period $t$
- $r$: Discount rate
- $C_0$: Initial capital investment

### 4. Return on Investment (ROI)
$$\\text{ROI} = \\frac{\\text{Net Profit}}{\\text{Cost of Investment}} \\times 100\\%$$

### 5. Economic Order Quantity (EOQ)
$$\\text{EOQ} = \\sqrt{\\frac{2DS}{H}}$$
- $D$: Annual demand quantity
- $S$: Setup / ordering cost per order
- $H$: Holding / carrying cost per unit per year
"""
    elif note_type == "one_page":
        content = """# 📋 One-Page Executive Revision Sheet

### Strategic Highlights
- **Product Strategy:** Vision $\\rightarrow$ Strategic Themes $\\rightarrow$ Roadmap $\\rightarrow$ Sprint Backlog.
- **Customer Empathy:** Always interview 5-10 target users before writing code or specifications.
- **Execution Discipline:** Track leading indicators (weekly active users, feature adoption) rather than lagging indicators (annual revenue).

### High-Yield Exam Reminders
1. *Competitive Moats:* Network effects, switching costs, cost advantages, and brand equity.
2. *Pricing Strategies:* Value-based pricing consistently captures higher margins than cost-plus pricing.
3. *Unit Economics:* Never scale marketing until customer retention curves flatten out.
"""
    else: # quick revision
        content = """# 🚀 Quick Revision Notes: Strategic Management

- **Core Definition:** Strategic management is the ongoing planning, monitoring, analysis, and assessment of all necessities an organization needs to meet its goals and objectives.
- **Key Frameworks:**
  - **SWOT Analysis:** Strengths, Weaknesses (Internal) vs Opportunities, Threats (External).
  - **Ansoff Matrix:** Market Penetration, Market Development, Product Development, Diversification.
  - **BCG Matrix:** Stars, Cash Cows, Question Marks, Dogs.
- **Product Management Integration:**
  - Product managers translate corporate strategic goals into prioritized feature backlogs.
  - Prioritization models: RICE (Reach, Impact, Confidence, Effort) and MoSCoW (Must, Should, Could, Won't).
"""
    return {
        "title": title,
        "note_type": note_type,
        "content": content
    }
