import os
import uuid
import logging
import pdfplumber
import docx
import markdown
from typing import List, Dict, Any
from datetime import datetime
from app.config import settings

logger = logging.getLogger("rag-ai-service")

class DocumentParser:
    @staticmethod
    def extract_text_pdf(file_path: str) -> List[Dict[str, Any]]:
        """Extract text and page metadata from PDF using pdfplumber, with OCR hook."""
        pages_content = []
        try:
            with pdfplumber.open(file_path) as pdf:
                for idx, page in enumerate(pdf.pages):
                    text = page.extract_text()
                    page_num = idx + 1
                    
                    # OCR Ready architecture: If extraction is empty, trigger OCR hook
                    if not text or len(text.strip()) < 50:
                        logger.info(f"Page {page_num} of {file_path} is empty or scanned. Triggering OCR hook...")
                        text = DocumentParser._ocr_fallback_hook(page)
                    
                    pages_content.append({
                        "page_number": page_num,
                        "text": text or "",
                        "heading": f"Page {page_num}",
                        "section": f"Section {page_num}"
                    })
        except Exception as e:
            logger.error(f"Error parsing PDF file {file_path}: {e}")
            raise e
        return pages_content

    @staticmethod
    def _ocr_fallback_hook(page_obj) -> str:
        """OCR extension hook. In production, this imports pytesseract and parses images."""
        # For this implementation, we stub the OCR-ready process
        # e.g., image = page_obj.to_image().original; return pytesseract.image_to_string(image)
        logger.warning("OCR process started: Tesseract/Vision API is ready to hook.")
        return "[OCR Extract: Scanned document page - text extraction skipped]"

    @staticmethod
    def extract_text_docx(file_path: str) -> List[Dict[str, Any]]:
        """Extract text from DOCX documents paragraph by paragraph."""
        pages_content = []
        try:
            doc = docx.Document(file_path)
            full_text = []
            
            # Simple heading tracker
            current_heading = "Introduction"
            for para in doc.paragraphs:
                text = para.text.strip()
                if not text:
                    continue
                if para.style.name.startswith("Heading"):
                    current_heading = text
                full_text.append((text, current_heading))

            # DOCX does not have native page counts, so we segment into chunks of ~1500 chars
            current_page = 1
            chunk_char_limit = 1500
            accumulated_text = []
            char_count = 0
            
            for text, heading in full_text:
                accumulated_text.append(text)
                char_count += len(text)
                if char_count >= chunk_char_limit:
                    pages_content.append({
                        "page_number": current_page,
                        "text": "\n".join(accumulated_text),
                        "heading": heading,
                        "section": heading
                    })
                    accumulated_text = []
                    char_count = 0
                    current_page += 1
            
            if accumulated_text:
                pages_content.append({
                    "page_number": current_page,
                    "text": "\n".join(accumulated_text),
                    "heading": current_heading,
                    "section": current_heading
                })
        except Exception as e:
            logger.error(f"Error parsing DOCX file {file_path}: {e}")
            raise e
        return pages_content

    @staticmethod
    def extract_text_markdown(file_path: str) -> List[Dict[str, Any]]:
        """Extract text from Markdown file, splitting by headers."""
        pages_content = []
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            lines = content.split("\n")
            current_heading = "Root"
            current_section = "Intro"
            accumulated_text = []
            page_num = 1

            for line in lines:
                striped = line.strip()
                if striped.startswith("#"):
                    # Flush previous section
                    if accumulated_text:
                        pages_content.append({
                            "page_number": page_num,
                            "text": "\n".join(accumulated_text),
                            "heading": current_heading,
                            "section": current_section
                        })
                        accumulated_text = []
                        page_num += 1
                    
                    current_heading = striped.replace("#", "").strip()
                    current_section = current_heading
                else:
                    accumulated_text.append(line)

            if accumulated_text:
                pages_content.append({
                    "page_number": page_num,
                    "text": "\n".join(accumulated_text),
                    "heading": current_heading,
                    "section": current_section
                })
        except Exception as e:
            logger.error(f"Error parsing Markdown file {file_path}: {e}")
            raise e
        return pages_content

    @staticmethod
    def extract_text_txt(file_path: str) -> List[Dict[str, Any]]:
        """Extract text from plain text files, chunked by character counts."""
        pages_content = []
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()
            
            # Split into virtual pages of ~2000 characters
            chunk_size = 2000
            for idx, i in enumerate(range(0, len(text), chunk_size)):
                pages_content.append({
                    "page_number": idx + 1,
                    "text": text[i : i + chunk_size],
                    "heading": "Document Body",
                    "section": "Main Section"
                })
        except Exception as e:
            logger.error(f"Error parsing TXT file {file_path}: {e}")
            raise e
        return pages_content

    @staticmethod
    def chunk_document(
        raw_pages: List[Dict[str, Any]], 
        document_id: str, 
        file_name: str,
        author: str = "Unknown",
        tags: List[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Split raw extracted page contents into overlapping chunks.
        Standard recursive character-based strategy with custom chunk size (1000 chars)
        and chunk overlap (200 chars).
        """
        if tags is None:
            tags = ["RAG", "Ingested"]

        chunks = []
        chunk_size = 1000
        chunk_overlap = 200
        
        for page in raw_pages:
            text = page["text"]
            page_num = page["page_number"]
            heading = page["heading"]
            section = page["section"]

            if len(text.strip()) == 0:
                continue

            # Standard overlapping split
            start = 0
            while start < len(text):
                end = min(start + chunk_size, len(text))
                chunk_text = text[start:end]
                
                chunk_id = f"{document_id}_p{page_num}_c{len(chunks)}"
                
                chunks.append({
                    "chunk_id": chunk_id,
                    "document_id": document_id,
                    "content": chunk_text,
                    "metadata": {
                        "chunk_id": chunk_id,
                        "document_id": document_id,
                        "page_number": page_num,
                        "heading": heading,
                        "section": section,
                        "source": file_name,
                        "file_name": file_name,
                        "author": author,
                        "tags": tags,
                        "created_date": datetime.utcnow().isoformat()
                    }
                })
                
                start += (chunk_size - chunk_overlap)
                
        return chunks
