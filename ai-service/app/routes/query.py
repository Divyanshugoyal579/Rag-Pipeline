import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.db import get_db_session
from app.services.orchestrator import rag_orchestrator

logger = logging.getLogger("rag-ai-service")
router = APIRouter()

class QueryMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str

class QueryRequest(BaseModel):
    query: str
    history: List[QueryMessage] = []
    filters: Optional[Dict[str, Any]] = None

@router.post("/query")
async def execute_query(
    payload: QueryRequest,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Execute Hybrid Retrieval and stream synthesized response.
    Returns chunked Server-Sent Events data.
    """
    try:
        # Convert Pydantic messages to standard dict structure
        history_dicts = [{"role": msg.role, "content": msg.content} for msg in payload.history]
        
        # Execute query flow returning generator
        generator = rag_orchestrator.execute_rag_flow(
            session=session,
            query=payload.query,
            history=history_dicts,
            filters=payload.filters
        )

        return StreamingResponse(
            generator,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no" # Disable buffering on Nginx for real-time streaming
            }
        )

    except Exception as e:
        logger.error(f"Error executing query: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during search execution: {str(e)}"
        )
