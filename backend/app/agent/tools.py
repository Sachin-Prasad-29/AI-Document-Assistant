import logging

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langgraph.types import interrupt

from app.db import crud
from app.db.database import SessionLocal
from app.services import documents as documents_service
from app.services import summarizer, vector_store

logger = logging.getLogger(__name__)


def _get_user_id(config: RunnableConfig | None) -> str | None:
    if not config:
        return None
    conf = config.get("configurable", {})
    user = conf.get("user") or {}
    return conf.get("user_id") or user.get("id")


@tool
def list_documents(config: RunnableConfig) -> str:
    """List the documents you uploaded (id, title, filename, status, created_at).
    Use this to see what your documents are, or to find the id of a document the
    user refers to by name or description (e.g. "the leave policy")."""
    logger.info("tool=%s args=%s", "list_documents", {})
    user_id = _get_user_id(config)
    if not user_id:
        return "Could not determine the current user."

    db = SessionLocal()
    try:
        # Users (including admins) see only their own uploads here; documents
        # uploaded by admins are still readable through search_documents.
        docs = crud.list_documents_by_user(db, user_id)

        if not docs:
            return "No documents uploaded."
        return "\n".join(
            f"{d.id} | {d.title} | {d.filename} | {d.status} | {d.created_at}"
            for d in docs
        )
    finally:
        db.close()


@tool
def search_documents(
    query: str, config: RunnableConfig, document_id: str | None = None
) -> str:
    """Semantic search over the documents you may read: your own uploads plus
    documents uploaded by admins (company knowledge base). Use this for specific
    questions about facts, rules or details (e.g. "how many casual leaves?").
    Pass document_id only to restrict the search to one document; get the id
    from list_documents first."""
    user_id = _get_user_id(config)
    logger.info(
        "tool=%s args=%s",
        "search_documents",
        {"query": query, "document_id": document_id, "user_id": user_id},
    )

    db = SessionLocal()
    try:
        allowed_ids = (
            crud.list_chat_visible_document_ids(db, user_id) if user_id else []
        )
        if document_id:
            if document_id not in allowed_ids:
                return "Permission denied: You do not have access to this document."
            results = vector_store.search(query, document_id=document_id)
        else:
            results = vector_store.search(query, document_ids=allowed_ids)
    finally:
        db.close()

    if not results:
        return "No relevant passages found."

    lines = []
    for r in results:
        source = r["title"]
        if r["page"] is not None:
            source += f", page {r['page']}"
        lines.append(f"[{source}] {r['text']}")
    return "\n\n".join(lines)


@tool
def get_document(document_id: str, config: RunnableConfig) -> str:
    """Get a document's metadata and its full text (truncated to the first
    6000 characters). Use this when the user wants the full text or the
    details of one specific document. Allowed for your own documents and for
    admin-uploaded documents. Get the id from list_documents first."""
    logger.info("tool=%s args=%s", "get_document", {"document_id": document_id})
    user_id = _get_user_id(config)
    db = SessionLocal()
    try:
        doc = crud.get_document(db, document_id)
        if doc is None:
            return f"No document found with id {document_id}."
        if not crud.can_read_in_chat(doc, user_id):
            return "Permission denied: You do not have access to this document."
        return (
            f"Title: {doc.title}\n"
            f"Filename: {doc.filename}\n"
            f"Status: {doc.status}\n"
            f"Created: {doc.created_at}\n\n"
            f"{doc.content[:6000]}"
        )
    finally:
        db.close()


@tool
def summarize_document(document_id: str, config: RunnableConfig) -> str:
    """Get a summary of one document. Allowed for your own documents and for
    admin-uploaded documents. Use this when the user asks for an overview or
    summary instead of a specific fact. Get the id from list_documents first."""
    logger.info("tool=%s args=%s", "summarize_document", {"document_id": document_id})
    user_id = _get_user_id(config)
    db = SessionLocal()
    try:
        doc = crud.get_document(db, document_id)
        if doc is None:
            return f"No document found with id {document_id}."
        if not crud.can_read_in_chat(doc, user_id):
            return "Permission denied: You do not have access to this document."
        return summarizer.summarize_document(db, document_id)
    except (LookupError, ValueError) as e:
        # Expected problems: return the message so the agent can recover
        return str(e)
    finally:
        db.close()


@tool
def delete_document(document_id: str, config: RunnableConfig) -> str:
    """Permanently delete one of your documents. You can only delete documents
    that you uploaded yourself.
    This requires human approval, which is handled automatically when you call this tool.
    Call list_documents first to find the correct document_id. Use only when the user
    explicitly asks to delete a document."""
    logger.info("tool=%s args=%s", "delete_document", {"document_id": document_id})
    user_id = _get_user_id(config)
    db = SessionLocal()
    try:
        # Read-only lookup. Safe to run twice (it re-runs on resume).
        doc = crud.get_document(db, document_id)
        if doc is None:
            # Check BEFORE interrupt: never ask a human to approve deleting nothing
            return f"No document found with id {document_id}."
        if not user_id or doc.uploaded_by != user_id:
            logger.warning(
                "User id=%s attempted to delete document_id=%s uploaded_by=%s via agent",
                user_id,
                document_id,
                doc.uploaded_by,
            )
            return "Permission denied: you can only delete documents that you uploaded yourself."

        # First run: the graph pauses here and the payload goes back to the API.
        # After resume: this returns whatever was passed to Command(resume=...).
        decision = interrupt(
            {
                "action": "delete_document",
                "document_id": doc.id,
                "title": doc.title,
                "message": f"'{doc.title}' will be permanently deleted. Approve?",
            }
        )

        # Only reached after resume
        if decision.get("approved"):
            title = doc.title
            documents_service.delete_document(db, doc)
            return f"Deleted '{title}'."
        return "Deletion was rejected by the user. Nothing was deleted."
    finally:
        db.close()
