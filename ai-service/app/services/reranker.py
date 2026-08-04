import logging
from typing import List, Dict, Any
from sentence_transformers import CrossEncoder
import cohere
from app.config import settings

logger = logging.getLogger("rag-ai-service")

def reciprocal_rank_fusion(
    vector_results: List[Dict[str, Any]], 
    keyword_results: List[Dict[str, Any]], 
    k: int = 60
) -> List[Dict[str, Any]]:
    """
    Perform Reciprocal Rank Fusion (RRF) on vector and keyword retrieval lists.
    RRF score: Sum of (1 / (k + rank)) for each system the document appears in.
    """
    rrf_scores: Dict[str, float] = {}
    items_map: Dict[str, Dict[str, Any]] = {}

    # Rank indices are 1-based (rank 1 is best)
    for rank, doc in enumerate(vector_results, start=1):
        chunk_id = doc["chunk_id"]
        items_map[chunk_id] = doc
        rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + (1.0 / (k + rank))

    for rank, doc in enumerate(keyword_results, start=1):
        chunk_id = doc["chunk_id"]
        if chunk_id not in items_map:
            items_map[chunk_id] = doc
        rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + (1.0 / (k + rank))

    # Sort items based on computed RRF score descending
    sorted_chunk_ids = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)

    fused_results = []
    for cid in sorted_chunk_ids:
        doc = items_map[cid]
        # Attach the RRF score to the item
        doc["rrf_score"] = rrf_scores[cid]
        fused_results.append(doc)

    return fused_results

class RerankerService:
    def __init__(self):
        self._local_reranker = None
        self._cohere_client = None

        # Load local cross-encoder model if possible
        try:
            logger.info(f"Loading local Cross-Encoder reranker: {settings.RERANKER_MODEL}")
            self._local_reranker = CrossEncoder(settings.RERANKER_MODEL)
            logger.info("Local Cross-Encoder reranker loaded successfully.")
        except Exception as e:
            logger.warning(
                f"Failed to load local Cross-Encoder reranker: {e}. "
                "Will use Cohere API or fallback to RRF ranking."
            )
            if settings.COHERE_API_KEY:
                self._cohere_client = cohere.Client(settings.COHERE_API_KEY)
                logger.info("Cohere Client initialized for reranking.")

    def rerank(self, query: str, chunks: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
        """Rerank candidates using Cross-Encoder model or API fallback."""
        if not chunks:
            return []

        # If local reranker is available
        if self._local_reranker is not None:
            try:
                pairs = [[query, chunk["content"]] for chunk in chunks]
                scores = self._local_reranker.predict(pairs)
                
                # Attach score and sort
                for idx, score in enumerate(scores):
                    chunks[idx]["rerank_score"] = float(score)

                sorted_chunks = sorted(chunks, key=lambda x: x["rerank_score"], reverse=True)
                return sorted_chunks[:top_k]
            except Exception as err:
                logger.error(f"Local Cross-Encoder prediction failed: {err}")

        # Fallback to Cohere API if credentials are provided
        if self._cohere_client is not None:
            try:
                documents = [chunk["content"] for chunk in chunks]
                response = self._cohere_client.rerank(
                    model="rerank-english-v3.0",
                    query=query,
                    documents=documents,
                    top_n=top_k
                )
                
                reranked_chunks = []
                for result in response.results:
                    idx = result.index
                    chunk = chunks[idx]
                    chunk["rerank_score"] = float(result.relevance_score)
                    reranked_chunks.append(chunk)
                return reranked_chunks
            except Exception as api_err:
                logger.error(f"Cohere API reranking failed: {api_err}")

        # If all fail, fallback to raw RRF ranking order
        logger.warning("Reranking failed/skipped. Returning top-K from fused rank.")
        return chunks[:top_k]

reranker_service = RerankerService()
