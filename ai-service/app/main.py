import logging
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.services.db import init_db
from app.routes import ingest, query

# Configure Logger
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("ai_service.log")
    ]
)
logger = logging.getLogger("rag-ai-service")

# Initialize FastAPI
app = FastAPI(
    title="Enterprise Hybrid RAG AI Service",
    description="Vector search, text chunking, BGE Embeddings generation, and LLM orchestration with citations.",
    version="1.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(ingest.router, tags=["Ingestion"])
app.include_router(query.router, tags=["Retrieval & Chat"])

@app.on_event("startup")
def startup_event():
    logger.info("Starting up FastAPI AI service...")
    try:
        init_db()
        logger.info("External database initializations completed.")
    except Exception as e:
        logger.critical(f"Database initialization failed during startup: {e}")
        # In kubernetes/docker environment, crashing on startup is standard for pod health check failure
        sys.exit(1)

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down FastAPI AI service...")

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "ai-service",
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=settings.DEBUG)
