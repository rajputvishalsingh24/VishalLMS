import os
import re
from typing import List, Dict, Any, Tuple
import pypdf
from pptx import Presentation
import docx

def clean_text(text: str) -> str:
    """Normalize text whitespace and strip control characters."""
    if not text:
        return ""
    text = re.sub(r'[\r\n]+', '\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()

def extract_pptx(file_path: str) -> List[Dict[str, Any]]:
    """
    Extract PPTX slide-by-slide preserving slide numbers, titles,
    shapes, tables, and notes.
    """
    slides_data = []
    try:
        prs = Presentation(file_path)
        for idx, slide in enumerate(prs.slides, start=1):
            title = ""
            texts = []
            
            # 1. Slide title
            if slide.shapes.title and slide.shapes.title.text:
                title = clean_text(slide.shapes.title.text)
                
            # 2. Extract shape text & tables
            for shape in slide.shapes:
                if shape == slide.shapes.title:
                    continue
                if shape.has_text_frame:
                    for paragraph in shape.text_frame.paragraphs:
                        p_text = clean_text(paragraph.text)
                        if p_text and p_text != title:
                            texts.append(p_text)
                elif shape.has_table:
                    table_rows = []
                    for row in shape.table.rows:
                        row_cells = [clean_text(cell.text) for cell in row.cells if clean_text(cell.text)]
                        if row_cells:
                            table_rows.append(" | ".join(row_cells))
                    if table_rows:
                        texts.append("Table:\n" + "\n".join(table_rows))
            
            # 3. Slide notes (speaker notes)
            notes_text = ""
            if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                notes_text = clean_text(slide.notes_slide.notes_text_frame.text)
                if notes_text:
                    texts.append(f"[Speaker Note]: {notes_text}")

            content = "\n".join(texts)
            if not title:
                # Derive title from first line if missing
                if texts:
                    title = texts[0][:60] + "..." if len(texts[0]) > 60 else texts[0]
                else:
                    title = f"Slide {idx}"

            # Generate synthetic key takeaways for presentation view
            bullet_points = [t for t in texts if len(t) > 10 and not t.startswith("[Speaker Note]")][:4]
            if not bullet_points:
                bullet_points = [f"Covers key concepts relating to {title}"]

            slides_data.append({
                "slide_number": idx,
                "page_number": idx,
                "title": title,
                "content": content if content else f"Slide {idx}: {title}",
                "takeaways": bullet_points
            })
    except Exception as e:
        print(f"Error parsing PPTX {file_path}: {e}")
        # Graceful fallback chunk
        slides_data.append({
            "slide_number": 1,
            "page_number": 1,
            "title": os.path.basename(file_path),
            "content": f"Document content could not be fully parsed: {str(e)}",
            "takeaways": ["Requires manual inspection"]
        })

    return slides_data

def extract_pdf(file_path: str) -> List[Dict[str, Any]]:
    """
    Extract PDF page-by-page using pypdf.
    """
    pages_data = []
    try:
        reader = pypdf.PdfReader(file_path)
        for idx, page in enumerate(reader.pages, start=1):
            raw_text = page.extract_text() or ""
            text = clean_text(raw_text)
            
            # Derive title from top lines
            lines = [l.strip() for l in text.split("\n") if l.strip()]
            title = lines[0][:80] if lines else f"Page {idx}"
            
            takeaways = [l for l in lines[1:5] if len(l) > 15][:3]
            if not takeaways:
                takeaways = [f"Discussion of key points on Page {idx}"]

            pages_data.append({
                "slide_number": idx,
                "page_number": idx,
                "title": title,
                "content": text if text else f"[Page {idx} contains image or non-extractable text]",
                "takeaways": takeaways
            })
    except Exception as e:
        print(f"Error reading PDF {file_path}: {e}")
        pages_data.append({
            "slide_number": 1,
            "page_number": 1,
            "title": os.path.basename(file_path),
            "content": f"PDF parse error: {str(e)}",
            "takeaways": ["Document parsing issue"]
        })
    return pages_data

def extract_docx(file_path: str) -> List[Dict[str, Any]]:
    """
    Extract Word document sections/paragraphs into structured chunks.
    """
    chunks = []
    try:
        doc = docx.Document(file_path)
        current_title = "Introduction"
        current_paras = []
        section_idx = 1

        for p in doc.paragraphs:
            text = clean_text(p.text)
            if not text:
                continue
            
            # Check if paragraph looks like a heading
            if p.style.name.startswith("Heading") or (len(text) < 70 and text.endswith((":"))):
                if current_paras:
                    chunks.append({
                        "slide_number": section_idx,
                        "page_number": section_idx,
                        "title": current_title,
                        "content": "\n".join(current_paras),
                        "takeaways": [p for p in current_paras if len(p) > 20][:3]
                    })
                    section_idx += 1
                    current_paras = []
                current_title = text
            else:
                current_paras.append(text)

        if current_paras or not chunks:
            chunks.append({
                "slide_number": section_idx,
                "page_number": section_idx,
                "title": current_title,
                "content": "\n".join(current_paras) if current_paras else "Document content",
                "takeaways": [p for p in current_paras if len(p) > 20][:3] or ["Key section notes"]
            })
    except Exception as e:
        print(f"Error reading DOCX {file_path}: {e}")
        chunks.append({
            "slide_number": 1,
            "page_number": 1,
            "title": os.path.basename(file_path),
            "content": f"DOCX error: {str(e)}",
            "takeaways": ["Unable to extract docx"]
        })
    return chunks

def extract_text_file(file_path: str) -> List[Dict[str, Any]]:
    """
    Extract TXT or MD files into sections based on headers or double newlines.
    """
    chunks = []
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        
        # Split by markdown headers or sections
        sections = re.split(r'\n(?=#{1,3}\s+)', content)
        for idx, sec in enumerate(sections, start=1):
            sec_text = clean_text(sec)
            if not sec_text:
                continue
            lines = sec_text.split("\n")
            title = lines[0].replace("#", "").strip() if lines else f"Section {idx}"
            body = "\n".join(lines[1:]) if len(lines) > 1 else lines[0]
            takeaways = [l for l in lines[1:4] if len(l) > 10]
            if not takeaways:
                takeaways = [f"Covers {title}"]
            
            chunks.append({
                "slide_number": idx,
                "page_number": idx,
                "title": title,
                "content": body if body else sec_text,
                "takeaways": takeaways
            })
        if not chunks:
            chunks.append({
                "slide_number": 1,
                "page_number": 1,
                "title": os.path.basename(file_path),
                "content": clean_text(content),
                "takeaways": ["Key notes from document"]
            })
    except Exception as e:
        print(f"Error reading text file {file_path}: {e}")
        chunks.append({
            "slide_number": 1,
            "page_number": 1,
            "title": os.path.basename(file_path),
            "content": f"Text reading error: {str(e)}",
            "takeaways": ["Error reading file"]
        })
    return chunks

def extract_document(file_path: str, file_type: str) -> List[Dict[str, Any]]:
    """
    Master dispatcher for document extraction.
    Supports PPT, PPTX, PDF, DOCX, TXT, MD.
    """
    ft = file_type.lower().replace(".", "")
    if ft in ["ppt", "pptx"]:
        return extract_pptx(file_path)
    elif ft == "pdf":
        return extract_pdf(file_path)
    elif ft in ["doc", "docx"]:
        return extract_docx(file_path)
    elif ft in ["txt", "md", "markdown"]:
        return extract_text_file(file_path)
    else:
        raise ValueError(f"Unsupported file format: {file_type}. Supported: PPT, PPTX, PDF, DOCX, TXT, MD")
