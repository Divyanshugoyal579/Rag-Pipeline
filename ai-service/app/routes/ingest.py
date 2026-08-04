import os
import shutil
import logging
import asyncio
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.db import get_db_session
from app.services.parser import DocumentParser
from app.services.vector_store import VectorStoreService
from app.services.keyword_search import KeywordSearchService

logger = logging.getLogger("rag-ai-service")
router = APIRouter()

TEMP_DIR = "temp_uploads"
os.makedirs(TEMP_DIR, exist_ok=True)

class ChunkMetadata(BaseModel):
    chunk_id: str
    document_id: str
    page_number: int
    heading: str
    section: str
    source: str
    file_name: str
    author: str
    tags: List[str]
    created_date: str

class ChunkInput(BaseModel):
    chunk_id: str
    document_id: str
    content: str
    metadata: ChunkMetadata

@router.post("/ingest-chunks", status_code=status.HTTP_201_CREATED)
async def ingest_chunks(
    chunks: List[ChunkInput],
    session: AsyncSession = Depends(get_db_session)
):
    """
    Ingest pre-parsed chunks sent by Spring Boot.
    Generates embeddings and indexes in PostgreSQL + pgvector and Elasticsearch in parallel.
    """
    try:
        if not chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty chunk list received."
            )
            
        formatted_chunks = []
        for chunk in chunks:
            formatted_chunks.append({
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.document_id,
                "content": chunk.content,
                "metadata": chunk.metadata.dict()
            })
            
        document_id = formatted_chunks[0]["document_id"]
        logger.info(f"Ingesting {len(formatted_chunks)} pre-parsed chunks for document: {document_id}")

        pg_task = VectorStoreService.index_chunks(session, formatted_chunks)
        es_task = asyncio.to_thread(KeywordSearchService.index_chunks, formatted_chunks)

        pg_success, es_success = await asyncio.gather(pg_task, es_task)

        if not pg_success or not es_success:
            await VectorStoreService.delete_by_document(session, document_id)
            KeywordSearchService.delete_by_document(document_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to index document chunks in one or more databases."
            )

        logger.info(f"Successfully indexed pre-parsed chunks for document {document_id}")
        return {
            "message": "Chunks ingested successfully",
            "document_id": document_id,
            "chunks_count": len(chunks)
        }
    except Exception as e:
        logger.error(f"Ingest chunks router failed: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error indexing chunks: {str(e)}"
        )


@router.post("/ingest", status_code=status.HTTP_201_CREATED)
async def ingest_document(
    file: UploadFile = File(...),
    document_id: str = Form(...),
    uploaded_by: str = Form(...),
    session: AsyncSession = Depends(get_db_session)
):
    """
    Ingest uploaded document: Parse content, create semantic chunks, 
    generate embeddings, index in pgvector and Elasticsearch in parallel.
    """
    temp_file_path = os.path.join(TEMP_DIR, f"{document_id}_{file.filename}")
    
    try:
        # Save upload locally temporarily
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 1. Determine extension and parse
        ext = os.path.splitext(file.filename)[1].lower()
        logger.info(f"Extracting text from {file.filename} (type: {ext}) for document: {document_id}")
        
        if ext == ".pdf":
            raw_pages = DocumentParser.extract_text_pdf(temp_file_path)
        elif ext == ".docx":
            raw_pages = DocumentParser.extract_text_docx(temp_file_path)
        elif ext == ".md":
            raw_pages = DocumentParser.extract_text_markdown(temp_file_path)
        elif ext in [".txt", ".log"]:
            raw_pages = DocumentParser.extract_text_txt(temp_file_path)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file format: {ext}"
            )

        if not raw_pages:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Document contained no extractable text."
            )

        # 2. Chunk document text
        logger.info(f"Creating semantic overlapping chunks for document: {document_id}")
        chunks = DocumentParser.chunk_document(
            raw_pages=raw_pages, 
            document_id=document_id, 
            file_name=file.filename,
            author=uploaded_by
        )

        if not chunks:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Chunking resulted in 0 text segments."
            )

        # 3. Store to PGVector and Elasticsearch in parallel
        # pgvector storage generates vector embeddings in the process
        pg_task = VectorStoreService.index_chunks(session, chunks)
        es_task = asyncio.to_thread(KeywordSearchService.index_chunks, chunks)

        pg_success, es_success = await asyncio.gather(pg_task, es_task)

        if not pg_success or not es_success:
            # Cleanup any partially created database states
            await VectorStoreService.delete_by_document(session, document_id)
            KeywordSearchService.delete_by_document(document_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to index document chunks in one or more databases."
            )

        logger.info(f"Successfully processed and indexed document {document_id} ({len(chunks)} chunks)")
        return {
            "message": "Document ingested successfully",
            "document_id": document_id,
            "chunks_count": len(chunks)
        }

    except Exception as e:
        logger.error(f"Ingestion router failed: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error parsing document: {str(e)}"
        )
    finally:
        # Delete temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@router.delete("/documents/{document_id}", status_code=status.HTTP_200_OK)
async def delete_document_vectors(
    document_id: str,
    session: AsyncSession = Depends(get_db_session)
):
    """Delete document chunks and embeddings from pgvector and Elasticsearch."""
    pg_task = VectorStoreService.delete_by_document(session, document_id)
    es_task = asyncio.to_thread(KeywordSearchService.delete_by_document, document_id)

    pg_success, es_success = await asyncio.gather(pg_task, es_task)

    if not pg_success or not es_success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fully remove document from vector store/search engines."
        )

    return {"message": "Document storage and indexes cleared successfully", "document_id": document_id}
