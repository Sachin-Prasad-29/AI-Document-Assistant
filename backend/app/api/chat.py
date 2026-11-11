import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.types import Command

from app.auth import get_current_user
from app.schemas import ChatRequest, ChatResponse, ResumeRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


def _content_to_text(content) -> str:
    # content is a plain string for some models, or a list of blocks for others
    if isinstance(content, str):
        return content
    parts = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
        elif isinstance(block, dict) and block.get("type") == "text":
            parts.append(block.get("text", ""))
    return "".join(parts)


def _tools_used_this_turn(messages: list) -> list[str]:
    # Walk back from the end to the latest user message: only this turn's tools
    names = []
    for m in reversed(messages):
        if isinstance(m, HumanMessage):
            break
        if isinstance(m, ToolMessage):
            names.append(m.name)
    names.reverse()
    return names


def _is_pending(agent, config) -> bool:
    # A paused graph has unresolved interrupts / a next node to run
    state = agent.get_state(config)
    return bool(state.interrupts or state.next)


def _build_response(thread_id: str, result: dict) -> ChatResponse:
    messages = result.get("messages", [])  # defensive: may be missing when paused
    tools_used = _tools_used_this_turn(messages)

    if result.get("__interrupt__"):
        # Graph paused at interrupt(): return the payload for the human to review
        request = result["__interrupt__"][0].value
        return ChatResponse(
            thread_id=thread_id,
            status="awaiting_approval",
            answer=None,
            tools_used=tools_used,
            approval_request=request,
        )

    return ChatResponse(
        thread_id=thread_id,
        status="completed",
        answer=_content_to_text(messages[-1].content),
        tools_used=tools_used,
        approval_request=None,
    )


@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    agent = request.app.state.agent
    thread_id = payload.thread_id or str(uuid.uuid4())
    config = {
        "configurable": {
            "thread_id": thread_id,
            "user_id": user["id"],
            "user_role": user["role"],
            "user": user,
        }
    }
    logger.info(
        "Chat request thread_id=%s user_id=%s message=%r",
        thread_id,
        user["id"],
        payload.message[:80],
    )

    # 409: a thread waiting for approval can't take new messages
    if _is_pending(agent, config):
        raise HTTPException(
            status_code=409,
            detail="This thread has a pending approval. Call /chat/resume first.",
        )

    try:
        result = agent.invoke(
            {"messages": [{"role": "user", "content": payload.message}]}, config
        )
    except Exception as e:
        logger.exception("Agent invocation failed for thread_id=%s", thread_id)
        raise HTTPException(status_code=502, detail=f"Agent error: {e}")

    return _build_response(thread_id, result)


@router.post("/resume", response_model=ChatResponse)
def resume(
    payload: ResumeRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    agent = request.app.state.agent
    config = {
        "configurable": {
            "thread_id": payload.thread_id,
            "user_id": user["id"],
            "user_role": user["role"],
            "user": user,
        }
    }
    logger.info(
        "Resume request thread_id=%s approved=%s user_id=%s",
        payload.thread_id,
        payload.approved,
        user["id"],
    )

    # 409: nothing to approve or reject on this thread
    if not _is_pending(agent, config):
        raise HTTPException(
            status_code=409, detail="No pending approval for this thread."
        )

    # Check pending interrupt for admin actions
    state = agent.get_state(config)
    if state.interrupts:
        interrupt_val = state.interrupts[0].value
        if (
            isinstance(interrupt_val, dict)
            and interrupt_val.get("action") == "delete_document"
            and user["role"] != "admin"
        ):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Only admin users can approve document deletion.",
            )

    try:
        # Same thread_id; the tool re-runs and interrupt() returns this value
        result = agent.invoke(Command(resume={"approved": payload.approved}), config)
    except Exception as e:
        logger.exception("Agent resume failed for thread_id=%s", payload.thread_id)
        raise HTTPException(status_code=502, detail=f"Agent error: {e}")

    return _build_response(thread_id=payload.thread_id, result=result)
