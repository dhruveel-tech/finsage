from typing import Annotated
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.agent.agent import run_agent
from app.db.mongo import get_chat_history, get_all_sessions
from app.core.auth import get_current_user, User
import uuid

router = APIRouter(prefix="/api/chat", tags=["chat"])

# In-memory conversation store per session (cleared on server restart)
_sessions: dict[str, list] = {}


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    tools_called: list[str]


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, current_user: Annotated[User, Depends(get_current_user)]):
    session_id = req.session_id or str(uuid.uuid4())
    if session_id not in _sessions:
        _sessions[session_id] = []

    response, tools_called = await run_agent(req.message, _sessions[session_id], session_id, current_user.id)
    return ChatResponse(response=response, session_id=session_id, tools_called=tools_called)


@router.get("/history/{session_id}")
async def history(session_id: str):
    return await get_chat_history(session_id)


@router.get("/sessions")
async def sessions():
    return await get_all_sessions()
