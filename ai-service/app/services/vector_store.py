import logging
import json
from typing import List, Dict, Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.db import DocumentChunk
from app.services.embedding_service import embedding_service

logger = logging.getLogger("rag-ai-service")

class VectorStoreService:
    @staticmethod
    async def index_chunks(session: AsyncSession, chunks: List[Dict[str, Any]]) -> bool:
        """Store chunk texts, metadata, and generated vector embeddings into PostgreSQL."""
        try:
            # Batch embedding generation
            texts = [chunk["content"] for chunk in chunks]
            embeddings = await embedding_service.get_embeddings_batch(texts)

            for idx, chunk in enumerate(chunks):
                db_chunk = DocumentChunk(
                    id=chunk["chunk_id"],
                    document_id=chunk["document_id"],
                    chunk_index=idx,
                    content=chunk["content"],
                    metadata_json=chunk["metadata"],
                    embedding=embeddings[idx]
                )
                session.add(db_chunk)
            
            await session.commit()
            logger.info(f"Successfully stored {len(chunks)} chunks in PostgreSQL pgvector store.")
            return True
        except Exception as e:
            await session.rollback()
            logger.error(f"PostgreSQL pgvector indexing error: {e}")
            return False

    @staticmethod
    async def search(
        session: AsyncSession, 
        query_embedding: List[float], 
        top_k: int = 10, 
        filters: Dict[str, Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Run semantic cosine distance search on pgvector.
        Returns matching chunks sorted by similarity score.
        """
        try:
            # Construct pgvector cosine similarity raw sql query for execution
            filter_sql = ""
            params: Dict[str, Any] = {
                "emb": str(query_embedding),
                "limit": top_k
            }

            # Handle metadata filters if provided
            if filters:
                filter_clauses = []
                for key, val in filters.items():
                    if val:
                        filter_clauses.append(f"metadata_json->>'{key}' = :{key}")
                        params[key] = str(val)
                if filter_clauses:
                    filter_sql = "AND " + " AND ".join(filter_clauses)

            # Cosine similarity is 1 - (embedding <=> :emb)
            query_str = f"""
                SELECT 
                    id, 
                    document_id, 
                    content, 
                    metadata_json, 
                    1 - (embedding <=> :emb) AS score
                FROM document_chunks
                WHERE 1=1 {filter_sql}
                ORDER BY embedding <=> :emb
                LIMIT :limit
            """

            result = await session.execute(text(query_str), params)
            rows = result.fetchall()

            results = []
            for row in rows:
                results.append({
                    "chunk_id": row[0],
                    "document_id": row[1],
                    "content": row[2],
                    "metadata": row[3] if isinstance(row[3], dict) else json.loads(row[3]),
                    "score": float(row[4])
                })
            return results
        except Exception as e:
            logger.error(f"pgvector vector search error: {e}")
            return []

    @staticmethod
    async def delete_by_document(session: AsyncSession, document_id: str) -> bool:
        """Delete all chunks and vectors associated with a document ID."""
        try:
            query_str = "DELETE FROM document_chunks WHERE document_id = :doc_id"
            await session.execute(text(query_str), {"doc_id": document_id})
            await session.commit()
            logger.info(f"Deleted PostgreSQL chunks for document {document_id}")
            return True
        except Exception as e:
            await session.rollback()
            logger.error(f"Failed to delete PostgreSQL document {document_id}: {e}")
            return False
