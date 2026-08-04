import json
import logging
import asyncio
from typing import List, Dict, Any, AsyncGenerator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI
from app.config import settings
from app.services.embedding_service import embedding_service
from app.services.vector_store import VectorStoreService
from app.services.keyword_search import KeywordSearchService
from app.services.reranker import reciprocal_rank_fusion, reranker_service

logger = logging.getLogger("rag-ai-service")

class RAGOrchestrator:
    def __init__(self):
        self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def get_semantic_cache(self, session: AsyncSession, query: str, query_embedding: List[float]) -> Dict[str, Any] | None:
        """Check pgvector semantic_cache for queries similar to the current one (threshold distance < 0.08)."""
        try:
            # Cosine similarity check (distance <=> < 0.08 equivalent to similarity > 0.92)
            query_str = """
                SELECT response_text, citations_json
                FROM semantic_cache
                WHERE query_embedding <=> :emb < 0.08
                ORDER BY query_embedding <=> :emb
                LIMIT 1
            """
            result = await session.execute(text(query_str), {"emb": str(query_embedding)})
            row = result.fetchone()
            if row:
                logger.info(f"Semantic cache hit for query: '{query}'")
                citations = row[1] if isinstance(row[1], list) else json.loads(row[1])
                return {
                    "text": row[0],
                    "citations": citations,
                    "cached": True
                }
        except Exception as e:
            logger.error(f"Semantic cache retrieval error: {e}")
        return None

    async def save_semantic_cache(self, session: AsyncSession, query: str, query_embedding: List[float], response: str, citations: List[Dict[str, Any]]):
        """Save a successfully answered query to the semantic cache."""
        try:
            insert_str = """
                INSERT INTO semantic_cache (query_text, query_embedding, response_text, citations_json, created_at)
                VALUES (:query, :emb, :response, :citations, NOW())
            """
            await session.execute(text(insert_str), {
                "query": query,
                "emb": str(query_embedding),
                "response": response,
                "citations": json.dumps(citations)
            })
            await session.commit()
            logger.info(f"Query cached semantically.")
        except Exception as e:
            await session.rollback()
            logger.error(f"Failed to save semantic cache: {e}")

    async def expand_query(self, query: str) -> List[str]:
        """Multi-Query expansion: Generate 2 alternative search queries to improve recall."""
        try:
            system_prompt = (
                "You are an AI language query expansion system. Generate exactly two alternative search queries "
                "separated by newlines that are semantically identical or highly related to the user's search. "
                "Do not include numbering, explanations, or quotes. Output ONLY the queries."
            )
            response = await self.openai_client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Query: {query}"}
                ],
                temperature=0.2,
                max_tokens=100
            )
            expanded = response.choices[0].message.content.strip().split("\n")
            queries = [q.strip() for q in expanded if q.strip()]
            logger.info(f"Query expansion generated: {queries}")
            return queries
        except Exception as e:
            logger.error(f"Query expansion failed: {e}")
            return []

    async def generate_hyde_document(self, query: str) -> str:
        """Hyde (Hypothetical Document Embeddings): Generate a synthetic answer to embed."""
        try:
            system_prompt = (
                "Write a short paragraph answering the following question. "
                "This is a hypothetical response that will be used to retrieve documents by embedding similarity. "
                "Be detailed, factual, and write as if you are a textbook or technical document."
            )
            response = await self.openai_client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Question: {query}"}
                ],
                temperature=0.3,
                max_tokens=250
            )
            hyde_doc = response.choices[0].message.content.strip()
            logger.info("HyDE hypothetical document generated.")
            return hyde_doc
        except Exception as e:
            logger.error(f"HyDE document generation failed: {e}")
            return ""

    async def retrieve_context(self, session: AsyncSession, query: str, filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """Run the hybrid search pipeline: expansion, HyDE, parallel vector/keyword retrieval, RRF, and Cross-Encoder Reranking."""
        # 1. Classify query intent to make sure we need retrieval
        # (For simple queries like greeting, we can skip search, but we perform it by default here)
        
        # 2. Run query expansion & HyDE in parallel
        expansion_task = asyncio.create_task(self.expand_query(query))
        hyde_task = asyncio.create_task(self.generate_hyde_document(query))
        
        expanded_queries, hyde_doc = await asyncio.gather(expansion_task, hyde_task)
        all_search_queries = [query] + expanded_queries
        
        # 3. Generate embeddings for queries + HyDE doc in batch
        embed_texts = all_search_queries + ([hyde_doc] if hyde_doc else [])
        embeddings = await embedding_service.get_embeddings_batch(embed_texts)
        
        query_embeddings = embeddings[:len(all_search_queries)]
        hyde_embedding = embeddings[len(all_search_queries):] if hyde_doc else []

        # 4. Perform parallel Keyword (ES) and Vector (PG) searches for all inputs
        vector_tasks = []
        keyword_tasks = []

        # Searches for actual queries
        for emb in query_embeddings:
            vector_tasks.append(
                asyncio.create_task(VectorStoreService.search(session, emb, top_k=15, filters=filters))
            )
        # Search for HyDE embedding if available
        if hyde_embedding:
            vector_tasks.append(
                asyncio.create_task(VectorStoreService.search(session, hyde_embedding[0], top_k=15, filters=filters))
            )

        for q in all_search_queries:
            keyword_tasks.append(
                asyncio.create_task(asyncio.to_thread(KeywordSearchService.search, q, top_k=15, filters=filters))
            )

        # Gather all parallel retrieval executions
        all_vector_results = await asyncio.gather(*vector_tasks)
        all_keyword_results = await asyncio.gather(*keyword_tasks)

        # Flatten results
        flat_vector_results = [item for sublist in all_vector_results for item in sublist]
        flat_keyword_results = [item for sublist in all_keyword_results for item in sublist]

        # 5. Apply Reciprocal Rank Fusion (RRF) to merge ranks
        fused_results = reciprocal_rank_fusion(flat_vector_results, flat_keyword_results)

        # 6. De-duplicate chunks by chunk_id
        seen_chunks = set()
        deduped_results = []
        for chunk in fused_results:
            if chunk["chunk_id"] not in seen_chunks:
                seen_chunks.add(chunk["chunk_id"])
                deduped_results.append(chunk)

        # 7. Cross-Encoder Re-ranking
        logger.info(f"Running Cross-Encoder reranking on {len(deduped_results)} unique retrieved chunks.")
        reranked_results = reranker_service.rerank(query, deduped_results, top_k=5)

        return reranked_results

    async def execute_rag_flow(
        self, 
        session: AsyncSession, 
        query: str, 
        history: List[Dict[str, str]], 
        filters: Dict[str, Any] = None
    ) -> AsyncGenerator[str, None]:
        """
        Orchestrate complete RAG pipeline.
        Yields chunked Server-Sent Events (SSE) data containing response tokens, citations, and completions.
        """
        # Step 1: Embedding check for semantic cache
        query_embedding = await embedding_service.get_embedding(query)
        cache_hit = await self.get_semantic_cache(session, query, query_embedding)
        
        if cache_hit:
            # Yield cached response instantly
            yield f"data: {json.dumps({'text': cache_hit['text'], 'citations': cache_hit['citations']})}\n\n"
            yield "data: [DONE]\n\n"
            return

        # Step 2: Retrieve relevant context chunks
        chunks = await self.retrieve_context(session, query, filters)
        
        # Construct citations list
        citations = []
        context_blocks = []
        for idx, chunk in enumerate(chunks, start=1):
            metadata = chunk["metadata"]
            citations.append({
                "chunk_id": chunk["chunk_id"],
                "source": metadata.get("source", "Unknown"),
                "page_number": metadata.get("page_number"),
                "score": chunk.get("rerank_score", chunk.get("score")),
                "content": chunk["content"]
            })
            # Form reference context blocks
            context_blocks.append(
                f"Source [{idx}]: {metadata.get('source')} (Page {metadata.get('page_number', 'N/A')})\n"
                f"Content: {chunk['content']}"
            )

        context_str = "\n\n---\n\n".join(context_blocks)

        # Step 3: Build dynamic prompt builder
        system_prompt = (
            "You are an elite enterprise-grade Hybrid RAG chatbot assistant. "
            "Your objective is to provide professional, comprehensive answers based ONLY on the retrieved contexts below. "
            "Strictly cite your references using '[idx]' corresponding to the source block indexes (e.g. [1], [2]). "
            "If the context does not contain sufficient details to answer, state that clearly; do not fabricate information.\n\n"
            f"=== RETRIEVED CONTEXT ===\n{context_str}\n\n"
        )

        messages = [{"role": "system", "content": system_prompt}]
        
        # Load conversation history memory (restrict to last 8 messages for context window compression)
        for msg in history[-8:]:
            messages.append({"role": msg["role"], "content": msg["content"]})
            
        messages.append({"role": "user", "content": query})

        # Step 4: Stream response from OpenAI API
        logger.info(f"Starting OpenAI streaming completion using model: {settings.LLM_MODEL}")
        
        # Emit initial citations so frontend has them immediately
        yield f"data: {json.dumps({'citations': citations})}\n\n"

        full_response_text = ""
        try:
            stream = await self.openai_client.chat.completions.create(
                model=settings.LLM_MODEL,
                messages=messages,
                stream=True,
                temperature=0.3
            )

            async for chunk in stream:
                token = chunk.choices[0].delta.content
                if token:
                    full_response_text += token
                    yield f"data: {json.dumps({'text': token})}\n\n"
            
            # Save the successful interaction to Semantic Cache
            if len(full_response_text) > 100:
                await self.save_semantic_cache(session, query, query_embedding, full_response_text, citations)

        except Exception as e:
            logger.error(f"LLM generation stream failed: {e}")
            yield f"data: {json.dumps({'error': 'LLM synthesis error occurred.'})}\n\n"

        yield "data: [DONE]\n\n"

rag_orchestrator = RAGOrchestrator()
