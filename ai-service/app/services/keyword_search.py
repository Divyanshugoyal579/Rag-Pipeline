import logging
from typing import List, Dict, Any
from elasticsearch.helpers import bulk
from app.services.db import es_client

logger = logging.getLogger("rag-ai-service")
INDEX_NAME = "rag_chunks"

class KeywordSearchService:
    @staticmethod
    def index_chunks(chunks: List[Dict[str, Any]]) -> bool:
        """Bulk index document chunks into Elasticsearch."""
        try:
            actions = [
                {
                    "_index": INDEX_NAME,
                    "_id": chunk["chunk_id"],
                    "_source": {
                        "chunk_id": chunk["chunk_id"],
                        "document_id": chunk["document_id"],
                        "content": chunk["content"],
                        "metadata": chunk["metadata"]
                    }
                }
                for chunk in chunks
            ]
            
            success, errors = bulk(es_client, actions)
            if errors:
                logger.error(f"Failed to bulk index some chunks: {errors}")
                return False
            
            # Flush changes to make index searchable immediately
            es_client.indices.refresh(index=INDEX_NAME)
            logger.info(f"Indexed {success} chunks in Elasticsearch index '{INDEX_NAME}'.")
            return True
        except Exception as e:
            logger.error(f"Elasticsearch indexing error: {e}")
            return False

    @staticmethod
    def search(query: str, top_k: int = 10, filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """Run BM25 search in Elasticsearch, returning scores and matching contents."""
        try:
            # Build search query
            must_clause = [
                {
                    "match": {
                        "content": {
                            "query": query,
                            "operator": "or"
                        }
                    }
                }
            ]

            # Add filter clauses if requested
            filter_clauses = []
            if filters:
                for key, val in filters.items():
                    if val:
                        filter_clauses.append({"term": {f"metadata.{key}": val}})
            
            body = {
                "size": top_k,
                "query": {
                    "bool": {
                        "must": must_clause,
                        "filter": filter_clauses
                    }
                }
            }

            response = es_client.search(index=INDEX_NAME, body=body)
            hits = response["hits"]["hits"]
            
            results = []
            for hit in hits:
                source = hit["_source"]
                results.append({
                    "chunk_id": source["chunk_id"],
                    "document_id": source["document_id"],
                    "content": source["content"],
                    "metadata": source["metadata"],
                    "score": hit["_score"]  # BM25 relevance score
                })
            return results
        except Exception as e:
            logger.error(f"Elasticsearch BM25 search error: {e}")
            return []

    @staticmethod
    def delete_by_document(document_id: str) -> bool:
        """Delete all indexed chunks associated with a specific document."""
        try:
            query = {
                "query": {
                    "term": {
                        "document_id": document_id
                    }
                }
            }
            response = es_client.delete_by_query(index=INDEX_NAME, body=query)
            es_client.indices.refresh(index=INDEX_NAME)
            logger.info(f"Deleted Elasticsearch chunks for document {document_id}. Response: {response}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete Elasticsearch document {document_id}: {e}")
            return False
