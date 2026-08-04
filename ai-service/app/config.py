import os
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    # API Keys
    OPENAI_API_KEY: str = Field(default="sk-placeholder-key-replace-in-production")
    COHERE_API_KEY: str = Field(default="")

    # AI Models
    EMBEDDING_MODEL: str = Field(default="BAAI/bge-large-en-v1.5")
    RERANKER_MODEL: str = Field(default="BAAI/bge-reranker-large")
    LLM_MODEL: str = Field(default="gpt-4o")

    # PostgreSQL / pgvector
    POSTGRES_USER: str = Field(default="rag_user")
    POSTGRES_PASSWORD: str = Field(default="rag_password")
    POSTGRES_DB: str = Field(default="rag_db")
    POSTGRES_HOST: str = Field(default="localhost")
    POSTGRES_PORT: str = Field(default="5432")

    # Elasticsearch
    ELASTICSEARCH_URL: str = Field(default="http://localhost:9200")

    # Redis
    REDIS_URL: str = Field(default="redis://localhost:6379")

    # App Settings
    DEBUG: bool = Field(default=True)
    PORT: int = Field(default=8000)

    @property
    def postgres_sync_url(self) -> str:
        return f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def postgres_async_url(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
export_settings = settings
