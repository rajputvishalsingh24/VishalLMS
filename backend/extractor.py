import os
import re
import tempfile
import struct
import zipfile
from typing import List, Dict, Any, Tuple
from pptx import Presentation
import docx
import pypdf

def clean_text(text: str) -> str:
    """Normalize text whitespace and strip control characters."""
    if not text:
        return ""
    text = re.sub(r'[\r\n]+', '\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()

def detect_file_signature(file_path: str) -> str:
    """
    Detect real file format by checking magic bytes rather than trusting file extension alone.
    """
    try:
        with open(file_path, "rb") as f:
            header = f.read(32)
        if header.startswith(b"PK\x03\x04"):
            # ZIP container - check if PPTX or DOCX
            try:
                with zipfile.ZipFile(file_path, 'r') as z:
                    names = z.namelist()
                    if any(n.startswith("ppt/") for n in names):
                        return "pptx"
                    if any(n.startswith("word/") for n in names):
                        return "docx"
            except Exception:
                pass
            return "pptx"
        elif header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
            # OLE2 Compound File - legacy binary PPT or DOC
            return "ppt"
        elif header.startswith(b"%PDF-"):
            return "pdf"
        elif header.isascii() or header.startswith(b"\xef\xbb\xbf"):
            return "txt"
    except Exception:
        pass
    ext = os.path.splitext(file_path)[1].lower().replace(".", "")
    return ext or "pptx"

def extract_binary_ppt(file_path: str) -> List[Dict[str, Any]]:
    """
    Extract legacy Microsoft PowerPoint 97-2003 binary (.ppt) presentations.
    Parses PowerPoint document records:
    - RT_Slide (0x03EE)
    - RT_TextCharsAtom (0x0FA8, UTF-16LE)
    - RT_TextBytesAtom (0x0FA0, Latin1/ASCII)
    - CString (0x0FBA)
    """
    slides_data = []
    try:
        with open(file_path, "rb") as f:
            data = f.read()

        slides_texts = [[]]
        offset = 0
        total_len = len(data)

        while offset < total_len - 8:
            try:
                rec_type = struct.unpack('<H', data[offset+2:offset+4])[0]
                rec_len = struct.unpack('<I', data[offset+4:offset+8])[0]

                if rec_len > total_len - offset - 8 or rec_len <= 0:
                    offset += 1
                    continue

                if rec_type == 0x03EE:  # RT_Slide boundary
                    if slides_texts[-1]:
                        slides_texts.append([])
                elif rec_type == 0x0FA8:  # RT_TextCharsAtom (UTF-16LE)
                    txt = data[offset+8:offset+8+rec_len].decode('utf-16le', errors='ignore')
                    cleaned = clean_text(txt)
                    if len(cleaned) > 1 and not cleaned.isspace():
                        slides_texts[-1].append(cleaned)
                elif rec_type in (0x0FA0, 0x0FBA):  # RT_TextBytesAtom / CString
                    txt = data[offset+8:offset+8+rec_len].decode('latin1', errors='ignore')
                    cleaned = clean_text(txt)
                    if len(cleaned) > 1 and not cleaned.isspace() and any(c.isalnum() for c in cleaned):
                        slides_texts[-1].append(cleaned)

                offset += 8 + rec_len
            except Exception:
                offset += 1

        # Filter out empty slide buckets
        valid_slides = [s for s in slides_texts if s]

        if not valid_slides:
            # Fallback regex extraction of printable unicode and ascii text sequences
            raw_strings = re.findall(r'(?:[\x20-\x7E]{4,})|(?:(?:[\x20-\x7E]\x00){4,})', data.decode('latin1', errors='ignore'))
            cleaned_strings = []
            for s in raw_strings:
                cs = clean_text(s.replace('\x00', ''))
                if len(cs) >= 4 and any(c.isalnum() for c in cs):
                    cleaned_strings.append(cs)

            # Chunk into simulated slides of 4-6 text items
            chunk_size = 5
            for i in range(0, len(cleaned_strings), chunk_size):
                group = cleaned_strings[i:i+chunk_size]
                if group:
                    valid_slides.append(group)

        if not valid_slides:
            valid_slides = [[f"Presentation: {os.path.basename(file_path)}", "Contains visual diagram or binary data"]]

        for idx, texts in enumerate(valid_slides, start=1):
            title = texts[0][:80] if texts else f"Slide {idx}"
            content = "\n".join(texts)
            takeaways = [t for t in texts[1:5] if len(t) > 10][:3]
            if not takeaways:
                takeaways = [f"Key concepts on {title}"]

            slides_data.append({
                "slide_number": idx,
                "page_number": idx,
                "title": title,
                "content": content,
                "takeaways": takeaways
            })

    except Exception as e:
        print(f"Error in extract_binary_ppt for {file_path}: {e}")
        slides_data.append({
            "slide_number": 1,
            "page_number": 1,
            "title": os.path.basename(file_path),
            "content": f"PowerPoint presentation uploaded. Text extraction notice: {str(e)}",
            "takeaways": ["Review presentation slides"]
        })

    return slides_data

def extract_pptx(file_path: str) -> List[Dict[str, Any]]:
    """
    Extract PPTX slide-by-slide preserving slide numbers, titles,
    shapes, tables, and notes.
    """
    # If the file is actually an older binary PPT, route to binary extractor
    sig = detect_file_signature(file_path)
    if sig == "ppt":
        return extract_binary_ppt(file_path)

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
        print(f"Error parsing PPTX {file_path}, attempting binary extraction: {e}")
        # Try binary extractor before giving up
        try:
            return extract_binary_ppt(file_path)
        except Exception:
            pass

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
    Detects true signature so misnamed files (.ppt that is actually .pptx or vice versa) parse accurately.
    """
    sig = detect_file_signature(file_path)
    ft = file_type.lower().replace(".", "")

    # Prefer actual file signature if confident
    if sig == "pptx":
        return extract_pptx(file_path)
    elif sig == "ppt":
        return extract_binary_ppt(file_path)
    elif sig == "pdf" or ft == "pdf":
        return extract_pdf(file_path)
    elif sig == "docx" or ft in ["doc", "docx"]:
        return extract_docx(file_path)
    elif ft in ["ppt", "pptx"]:
        return extract_pptx(file_path)
    elif ft in ["txt", "md", "markdown"] or sig == "txt":
        return extract_text_file(file_path)
    else:
        # Default try PPTX then text
        try:
            return extract_pptx(file_path)
        except Exception:
            return extract_text_file(file_path)

def extract_slide_layouts(file_path: str, doc_id: str = "") -> List[Dict[str, Any]]:
    """
    High-fidelity slide layout extractor for the interactive presentation viewer.
    Extracts slide coordinates, shapes, formatted texts, tables, embedded images,
    and speaker notes.
    """
    ext = os.path.splitext(file_path)[1].lower().replace(".", "")
    if ext in ["pptx", "ppt"]:
        try:
            prs = Presentation(file_path)
            slide_w = float(prs.slide_width)
            slide_h = float(prs.slide_height)
            ratio = "16:9" if (slide_w / slide_h) > 1.5 else "4:3"

            from .database import is_cloud_env
            assets_dir = tempfile.gettempdir() if is_cloud_env() else os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "uploads")
            os.makedirs(assets_dir, exist_ok=True)

            slides = []
            for s_idx, slide in enumerate(prs.slides, start=1):
                title = ""
                if slide.shapes.title and slide.shapes.title.text:
                    title = clean_text(slide.shapes.title.text)

                shapes_data = []
                for sh_idx, shape in enumerate(slide.shapes):
                    try:
                        left_pct = round((float(shape.left) / slide_w) * 100, 2)
                        top_pct = round((float(shape.top) / slide_h) * 100, 2)
                        width_pct = round((float(shape.width) / slide_w) * 100, 2)
                        height_pct = round((float(shape.height) / slide_h) * 100, 2)
                    except Exception:
                        left_pct, top_pct, width_pct, height_pct = 5.0, 10.0 + (sh_idx * 15.0), 90.0, 20.0

                    # 1. Image Shape
                    if hasattr(shape, "image"):
                        try:
                            img_filename = f"img_{doc_id}_{s_idx}_{sh_idx}.png"
                            img_path = os.path.join(assets_dir, img_filename)
                            with open(img_path, "wb") as f_img:
                                f_img.write(shape.image.blob)
                            shapes_data.append({
                                "type": "image",
                                "left": left_pct,
                                "top": top_pct,
                                "width": width_pct,
                                "height": height_pct,
                                "url": f"/api/documents/{doc_id}/assets/{img_filename}"
                            })
                            continue
                        except Exception as e_img:
                            print(f"Notice extracting shape image: {e_img}")

                    # 2. Table Shape
                    if shape.has_table:
                        rows_data = []
                        for row in shape.table.rows:
                            cells = [clean_text(c.text) for c in row.cells]
                            rows_data.append(cells)
                        shapes_data.append({
                            "type": "table",
                            "left": left_pct,
                            "top": top_pct,
                            "width": width_pct,
                            "height": height_pct,
                            "rows": rows_data
                        })
                        continue

                    # 3. Text Shape
                    if shape.has_text_frame:
                        paras = []
                        for p in shape.text_frame.paragraphs:
                            t = clean_text(p.text)
                            if t:
                                is_title = (shape == slide.shapes.title)
                                paras.append({
                                    "text": t,
                                    "is_title": is_title
                                })
                        if paras:
                            shapes_data.append({
                                "type": "text",
                                "is_title": (shape == slide.shapes.title),
                                "left": left_pct,
                                "top": top_pct,
                                "width": width_pct,
                                "height": height_pct,
                                "paragraphs": paras
                            })

                # Notes
                notes = ""
                if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                    notes = clean_text(slide.notes_slide.notes_text_frame.text)

                if not title and shapes_data:
                    first_text = next((sh["paragraphs"][0]["text"] for sh in shapes_data if sh.get("paragraphs")), f"Slide {s_idx}")
                    title = first_text[:60]
                elif not title:
                    title = f"Slide {s_idx}"

                slides.append({
                    "slide_number": s_idx,
                    "title": title,
                    "aspect_ratio": ratio,
                    "shapes": shapes_data,
                    "notes": notes,
                    "speaker_notes": notes
                })

            if slides:
                return slides
        except Exception as e:
            print(f"Error in extract_slide_layouts for PPTX: {e}")

    # Fallback for PDF, DOCX, TXT or failed PPTX
    chunks = extract_document(file_path, ext)
    slides = []
    for c in chunks:
        s_num = c.get("slide_number", 1)
        title = c.get("title", f"Slide {s_num}")
        content = c.get("content", "")
        lines = [l.strip() for l in content.split("\n") if l.strip()]

        shapes = [
            {
                "type": "text",
                "is_title": True,
                "left": 8.0,
                "top": 8.0,
                "width": 84.0,
                "height": 14.0,
                "paragraphs": [{"text": title, "is_title": True}]
            },
            {
                "type": "text",
                "is_title": False,
                "left": 8.0,
                "top": 26.0,
                "width": 84.0,
                "height": 65.0,
                "paragraphs": [{"text": l, "is_title": False} for l in lines[:8]]
            }
        ]
        slides.append({
            "slide_number": s_num,
            "title": title,
            "aspect_ratio": "16:9",
            "shapes": shapes,
            "notes": c.get("speaker_notes", ""),
            "speaker_notes": c.get("speaker_notes", "")
        })
    return slides
