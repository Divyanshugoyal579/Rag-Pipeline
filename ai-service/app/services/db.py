import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import create_engine, Column, String, Integer, Text, JSON, DateTime, text
from pgvector.sqlalchemy import Vector
from elasticsearch import Elasticsearch
import redis.asyncio as aioredis
from datetime import datetime
from app.config import settings

logger = logging.getLogger("rag-ai-service")

# SQLAlchemy Setup
Base = declarative_base()

# Sync Engine for initial DDL setup
sync_engine = create_engine(settings.postgres_sync_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

# Async Engine for operations
async_engine = create_async_engine(settings.postgres_async_url, future=True, echo=False)
AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False, class_=AsyncSession)

# Document Chunk ORM Model
class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(String(50), primary_key=True)  # custom UUID or composite key
    document_id = Column(String(100), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    metadata_json = Column(JSON, nullable=False)  # holds tags, section, pages, source, author, dates
    embedding = Column(Vector(1024))  # BGE Large embeddings have 1024 dimensions
    created_at = Column(DateTime, default=datetime.utcnow)

# Semantic Cache model using pgvector
class SemanticCache(Base):
    __tablename__ = "semantic_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    query_text = Column(String(500), nullable=False)
    query_embedding = Column(Vector(1024), nullable=False)
    response_text = Column(Text, nullable=False)
    citations_json = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# Initialize external databases
es_client = Elasticsearch(settings.ELASTICSEARCH_URL)
redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

def init_db():
    """Sync function to initialize schema, extensions, and tables."""
    try:
        with sync_engine.connect() as conn:
            # Enable pgvector extension
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            conn.commit()
            logger.info("Successfully enabled pgvector extension.")

        # Create tables
        Base.metadata.create_all(bind=sync_engine)
        logger.info("SQL database tables created.")

        # Initialize Elasticsearch Index
        index_name = "rag_chunks"
        if not es_client.indices.exists(index=index_name):
            es_client.indices.create(
                index=index_name,
                body={
                    "mappings": {
                        "properties": {
                            "chunk_id": {"type": "keyword"},
                            "document_id": {"type": "keyword"},
                            "content": {"type": "text", "analyzer": "english"},
                            "metadata": {
                                "properties": {
                                    "heading": {"type": "text"},
                                    "section": {"type": "text"},
                                    "source": {"type": "keyword"},
                                    "file_name": {"type": "keyword"},
                                    "author": {"type": "text"},
                                    "tags": {"type": "keyword"},
                                    "page_number": {"type": "integer"},
                                    "created_date": {"type": "date"},
                                }
                            }
                        }
                    }
                }
            )
            logger.info(f"Elasticsearch index '{index_name}' created.")
        else:
            logger.info(f"Elasticsearch index '{index_name}' already exists.")

    except Exception as e:
        logger.error(f"Error initializing databases: {e}")
        raise e

async def get_db_session() -> AsyncSession:
    """Async session dependency."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
