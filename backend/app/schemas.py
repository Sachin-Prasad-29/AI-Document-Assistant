from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentCreate(BaseModel):
    # Request body for POST /documents (raw text)
    title: str
    content: str


class DocumentOut(BaseModel):
    # Response model. Deliberately leaves out `content` (can be huge) and `file_path` (internal).
    id: str
    title: str
    filename: str | None
    num_chunks: int
    status: str
    error: str | None
    summary: str | None
    uploaded_by: str | None
    created_at: datetime

    # Lets Pydantic read values from a SQLAlchemy object (doc.title) instead of only dicts
    model_config = ConfigDict(from_attributes=True)


class SummarizeRequest(BaseModel):
    force: bool = False


class SummarizeResponse(BaseModel):
    document_id: str
    summary: str


class UserOut(BaseModel):
    id: str
    email: str | None
    role: str


class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None  # omit to start a new conversation


class ChatResponse(BaseModel):
    thread_id: str
    status: str  # "completed" now; "awaiting_approval" arrives in Phase 5
    answer: str | None
    tools_used: list[str]
    approval_request: dict | None = None


class ResumeRequest(BaseModel):
    thread_id: str
    approved: bool
