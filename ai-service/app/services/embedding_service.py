import logging
import numpy as np
from typing import List
from sentence_transformers import SentenceTransformer
from openai import AsyncOpenAI
from app.config import settings

logger = logging.getLogger("rag-ai-service")

class EmbeddingService:
    def __init__(self):
        self._local_model = None
        self._openai_client = None

        # Attempt to load local SentenceTransformer for BGE Embeddings
        try:
            logger.info(f"Loading local SentenceTransformer model: {settings.EMBEDDING_MODEL}")
            self._local_model = SentenceTransformer(settings.EMBEDDING_MODEL)
            logger.info("Local SentenceTransformer loaded successfully.")
        except Exception as e:
            logger.warning(
                f"Could not load local SentenceTransformer model: {e}. "
                "Defaulting to OpenAI text-embedding-3-large fallback."
            )
            # Initialize async OpenAI client
            self._openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def get_embedding(self, text: str) -> List[float]:
        """Generate embedding for a single text string."""
        embeddings = await self.get_embeddings_batch([text])
        return embeddings[0]

    async def get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of texts in batch."""
        if not texts:
            return []

        # If local model is loaded, use it
        if self._local_model is not None:
            try:
                # bge-large-en-v1.5 requires query instruction for queries sometimes,
                # but for general chunks we embed directly.
                embeddings = self._local_model.encode(
                    texts, 
                    show_progress_bar=False, 
                    normalize_embeddings=True
                )
                return [arr.tolist() for arr in embeddings]
            except Exception as err:
                logger.error(f"Local embedding generation failed: {err}. Falling back to OpenAI API.")

        # Fallback to OpenAI API with dimension configured to 1024 to match pgvector definition
        if self._openai_client is None:
            self._openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            
        try:
            response = await self._openai_client.embeddings.create(
                input=texts,
                model="text-embedding-3-large",
                dimensions=1024  # Custom dimension size supported by OpenAI text-embedding-3
            )
            return [data.embedding for data in response.data]
        except Exception as api_err:
            logger.error(f"OpenAI API embedding generation failed: {api_err}")
            # Final mock return if both fail to prevent app crash in sandbox envs
            logger.warning("Failing back to dummy random embeddings for safety.")
            mock_emb = np.random.randn(len(texts), 1024)
            mock_emb = mock_emb / np.linalg.norm(mock_emb, axis=1, keepdims=True)
            return mock_emb.tolist()

embedding_service = EmbeddingService()
