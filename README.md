# VISHAL SINGH
## AI-Powered Personal Learning Management Platform
> **Tagline:** One Place. Every Subject. Smarter Learning.  
> **Subtitle:** Your Personal AI Learning Space

---

### Overview
**VISHAL SINGH** is a personal digital classroom and learning platform designed to store, organize, understand, revise, and master MBA curriculum study materials.

Built using the exact UI/UX specifications and design mockups, the application integrates persistent document indexing with an AI tutor supporting 4 distinct learning modes, slide-by-slide presentation viewing, grounded citations, exam quiz generation, revision notes, flashcards, and live progress analytics.

---

### Features & Capabilities

1. **Personal Dashboard**
   - Mountain vector hero banner: *"Welcome back, Vishal."* &bull; *"Your classroom, your materials, your learning journey."*
   - Live statistics calculated from stored data:
     - Presentations Uploaded
     - Study Documents
     - Core Subjects
     - Topics Completed
     - Quizzes Attempted
     - Overall Progress Donut Chart
   - Continue Learning cards with direct resume action
   - Quick Action triggers (Upload, Learn a Topic, Ask AI Tutor, Take Quiz, Revise Notes, Browse Subjects)
   - Recent Uploads table with format badges (PPT, PDF, DOCX, TXT)

2. **Study Material Library**
   - Two-pane hierarchical document explorer:
     - Left pane: Semesters accordion (MBA &rarr; Semester 1, 2, 3, 4) & Subject document counts
     - Right pane: Searchable, sortable document inventory
   - Format filter pills: All Files, PPT, PDF, DOCX, TXT, MD
   - Drag-and-drop upload modal with metadata (Subject, Topic, Semester, Faculty, Description, Tags)
   - Real document extraction: slide-by-slide parsing for PPTX, page-by-page for PDF, sections for DOCX/TXT/MD

3. **Presentation Viewer (Slide Stage & AI Assistant)**
   - 16:9 presentation slide canvas with title, subtitle, bullet points, and visual layout
   - Thumbnail sidebar preview for quick slide jumps
   - Slide controls: `< 1 / 12 >`, zoom, fullscreen, and keyboard arrow navigation
   - Contextual AI Assistant with 3 tabs:
     - **AI Summary:** Key Takeaways for the active slide + *"Ask AI about this slide"*
     - **Notes:** Personal slide revision notes with auto-save
     - **Ask AI:** Slide-grounded chat

4. **AI Personal Tutor (4 Learning Modes)**
   - **Mode 1: Simple Explanation** &bull; 8-section breakdown (What is it, Why important, How it works, Business example, PM example, Key points, Common mistakes, 3 check questions)
   - **Mode 2: Teach Me Step-by-Step** &bull; Interactive bite-sized lessons with analogies, terminology, check questions, and controls (*Next Lesson*, *Explain Again*, *Give PM Example*)
   - **Mode 3: Presentation Explainer** &bull; Deep slide analysis with source citations
   - **Mode 4: Ask My Study Materials** &bull; Conversational RAG with exact document and slide/page citations
   - Built-in MBA pedagogical engine + optional Google Gemini API cloud integration

5. **AI Quiz Generator & Evaluation**
   - Customizable difficulty (Beginner, Intermediate, Advanced, MBA Examination Level)
   - Interactive one-question-at-a-time quiz player with progress tracking
   - Real-time scoring, correct answer highlight, mistake breakdown, and slide references
   - Quiz history and accuracy analytics

6. **My Notes & Flashcards**
   - Subject-wise notes repository
   - Note formats: Quick Revision, Detailed Study, Examination Notes, One-Page Revision Sheets, Flashcards, and Formula Sheets
   - Interactive 3D flip card active recall player

7. **Learning Progress & Recommendations**
   - Live curriculum mastery bars per subject
   - *"What Should I Learn Next?"* AI recommendation engine based on quiz performance and unstudied topics
   - Study streak and exam readiness tracking

8. **Settings & Customization**
   - Student profile (Vishal Singh, MBA)
   - Google Gemini API key configuration (stored securely in persistent database)
   - Light and dark theme support
   - One-click sample curriculum restore

---

### Quick Start

To run the application locally:

```powershell
# Double-click run.bat or execute:
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Open your browser at:
`http://localhost:8000`
