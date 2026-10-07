"""
High-fidelity page renderer for AegisRAG.
Generates optical PNG page previews for all file types: PDF, images, XLSX spreadsheets, TXT/MD, CSV, and fallback chunks.
"""
from pathlib import Path
import io
import openpyxl
import pymupdf

PAGE_A4 = pymupdf.paper_rect("a4")  # 595.3 x 841.9 points

def _render_pdf_page(path: Path, page_number: int, out_path: Path) -> bool:
    try:
        with pymupdf.open(path) as pdf:
            if 1 <= page_number <= len(pdf):
                page = pdf[page_number - 1]
                png = page.get_pixmap(dpi=150).tobytes("png")
                out_path.parent.mkdir(parents=True, exist_ok=True)
                out_path.write_bytes(png)
                return True
    except Exception:
        pass
    return False

def _render_image_page(path: Path, out_path: Path) -> bool:
    try:
        pix = pymupdf.Pixmap(str(path))
        if pix.n >= 5:  # CMYK or other formats -> convert to RGB
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        png = pix.tobytes("png")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(png)
        return True
    except Exception:
        pass
    return False

def _render_text_document(title: str, text: str, page_number: int, out_path: Path, classification_label: str = "Internal") -> bool:
    """Renders text or markdown into paginated, publication-grade A4 page preview."""
    try:
        pdf = pymupdf.open()
        lines = text.split("\n")
        lines_per_page = 42
        
        # Paginate lines
        total_pages = max(1, (len(lines) + lines_per_page - 1) // lines_per_page)
        curr_page = max(1, min(page_number, total_pages))
        
        page_lines = lines[(curr_page - 1) * lines_per_page : curr_page * lines_per_page]
        
        page = pdf.new_page(width=PAGE_A4.width, height=PAGE_A4.height)
        
        # Header banner
        page.draw_rect(pymupdf.Rect(40, 30, PAGE_A4.width - 40, 65), color=(0.9, 0.9, 0.92), fill=(0.96, 0.96, 0.98))
        page.insert_text((50, 48), title[:60], fontsize=13, fontname="helv", color=(0.1, 0.1, 0.15))
        page.insert_text((PAGE_A4.width - 150, 48), f"Security: {classification_label.upper()}", fontsize=9, fontname="helv", color=(0.4, 0.4, 0.45))
        
        # Content box
        body_text = "\n".join(page_lines)
        page.insert_textbox(
            pymupdf.Rect(50, 85, PAGE_A4.width - 50, PAGE_A4.height - 60),
            body_text,
            fontsize=10,
            fontname="helv",
            color=(0.15, 0.15, 0.18)
        )
        
        # Footer
        page.draw_line((40, PAGE_A4.height - 40), (PAGE_A4.width - 40, PAGE_A4.height - 40), color=(0.85, 0.85, 0.88), width=0.5)
        page.insert_text((50, PAGE_A4.height - 25), "AegisRAG Verified Document Preview", fontsize=8, fontname="helv", color=(0.5, 0.5, 0.55))
        page.insert_text((PAGE_A4.width - 110, PAGE_A4.height - 25), f"Page {curr_page} of {total_pages}", fontsize=8, fontname="helv", color=(0.5, 0.5, 0.55))
        
        png = page.get_pixmap(dpi=150).tobytes("png")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(png)
        return True
    except Exception:
        return False

def _render_xlsx_sheet(path: Path, page_number: int, out_path: Path, title: str = "Spreadsheet") -> bool:
    """Renders tabular spreadsheet into formatted A4 table preview."""
    try:
        book = openpyxl.load_workbook(io.BytesIO(path.read_bytes()), data_only=True, read_only=True)
        sheet_names = book.sheetnames
        if not sheet_names:
            return False
            
        sheet_idx = max(0, min(page_number - 1, len(sheet_names) - 1))
        sheet = book[sheet_names[sheet_idx]]
        
        rows = []
        for r in sheet.iter_rows(values_only=True):
            if any(c is not None for c in r):
                rows.append([str(c) if c is not None else "" for c in r])
                if len(rows) >= 35:  # 1 page cap
                    break
                    
        if not rows:
            rows = [["(Empty sheet)"]]
            
        pdf = pymupdf.open()
        page = pdf.new_page(width=PAGE_A4.width, height=PAGE_A4.height)
        
        # Header
        page.draw_rect(pymupdf.Rect(40, 30, PAGE_A4.width - 40, 65), color=(0.85, 0.88, 0.92), fill=(0.94, 0.96, 0.98))
        page.insert_text((50, 48), f"{title} — Sheet: {sheet.title}", fontsize=12, fontname="helv", color=(0.1, 0.1, 0.2))
        page.insert_text((PAGE_A4.width - 120, 48), "Tabular Data", fontsize=9, fontname="helv", color=(0.3, 0.4, 0.5))
        
        # Table render
        top_y = 80
        num_cols = min(6, max(len(r) for r in rows))
        col_width = (PAGE_A4.width - 90) / max(1, num_cols)
        row_height = 19
        
        for r_idx, row in enumerate(rows):
            curr_y = top_y + r_idx * row_height
            if curr_y + row_height > PAGE_A4.height - 50:
                break
                
            is_header = (r_idx == 0)
            bg_color = (0.9, 0.93, 0.96) if is_header else ((0.98, 0.98, 0.99) if r_idx % 2 == 0 else (1.0, 1.0, 1.0))
            
            page.draw_rect(
                pymupdf.Rect(45, curr_y, PAGE_A4.width - 45, curr_y + row_height),
                color=(0.8, 0.83, 0.88),
                fill=bg_color,
                width=0.5
            )
            
            for c_idx in range(num_cols):
                val = row[c_idx] if c_idx < len(row) else ""
                cell_x = 48 + c_idx * col_width
                page.insert_text(
                    (cell_x, curr_y + 13),
                    val[:22],
                    fontsize=8.5 if not is_header else 9,
                    fontname="hebo" if is_header else "helv",
                    color=(0.05, 0.05, 0.1) if is_header else (0.2, 0.2, 0.25)
                )
                
        # Footer
        page.draw_line((40, PAGE_A4.height - 40), (PAGE_A4.width - 40, PAGE_A4.height - 40), color=(0.85, 0.85, 0.88), width=0.5)
        page.insert_text((50, PAGE_A4.height - 25), f"Sheet {sheet_idx + 1} of {len(sheet_names)}: {sheet.title}", fontsize=8, fontname="helv", color=(0.5, 0.5, 0.55))
        page.insert_text((PAGE_A4.width - 110, PAGE_A4.height - 25), "AegisRAG Catalog", fontsize=8, fontname="helv", color=(0.5, 0.5, 0.55))
        
        png = page.get_pixmap(dpi=150).tobytes("png")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(png)
        return True
    except Exception:
        return False

def render_document_page(doc, page_number: int, original_path: Path, out_path: Path, fallback_chunks: list = None) -> bool:
    """
    Renders any document page to a PNG file.
    Works for PDF, images, spreadsheets, text files, and DB chunks.
    """
    ext = Path(doc.filename).suffix.lower()
    
    if original_path.is_file():
        if ext == ".pdf":
            if _render_pdf_page(original_path, page_number, out_path):
                return True
        elif ext in [".png", ".jpg", ".jpeg", ".webp", ".bmp"]:
            if _render_image_page(original_path, out_path):
                return True
        elif ext == ".xlsx":
            if _render_xlsx_sheet(original_path, page_number, out_path, title=doc.title):
                return True
        elif ext in [".txt", ".md", ".csv", ".json", ".log"]:
            text = original_path.read_text("utf-8", errors="replace")
            if _render_text_document(doc.title, text, page_number, out_path, classification_label=getattr(doc, "classification_label", "Internal")):
                return True
                
    # Fallback to database chunks if original file is unavailable or unsupported format
    if fallback_chunks:
        page_chunks = [c for c in fallback_chunks if c.page == page_number]
        if not page_chunks and fallback_chunks:
            page_chunks = fallback_chunks[:3]  # take initial chunks
        text = "\n\n".join(c.text for c in page_chunks)
        if _render_text_document(doc.title, text or "(No text extracted for this page)", page_number, out_path, classification_label="Internal"):
            return True
            
    # Generic fallback
    return _render_text_document(
        doc.title,
        f"Document: {doc.title}\nFilename: {doc.filename}\nPage: {page_number}\n\nDocument text indexed in AegisRAG vector catalog.",
        page_number,
        out_path,
        classification_label="Internal"
    )
