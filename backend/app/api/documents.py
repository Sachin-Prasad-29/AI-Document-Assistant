import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_role
from app.config import settings
from app.db import crud
from app.db.database import get_db
from app.schemas import DocumentCreate, DocumentOut, UserOut, SummarizeRequest, SummarizeResponse
from app.services import documents as documents_service
from app.services.ingestion import ingest_document
from app.services.summarizer import summarize_document


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md"}


# ---------------------------------------------------------------------------
# /me – quick sanity-check endpoint so the frontend can confirm auth works
# ---------------------------------------------------------------------------
@router.get("/me", response_model=UserOut)
def me(user: dict = Depends(get_current_user)):
    return user


# ---------------------------------------------------------------------------
# Document CRUD
# ---------------------------------------------------------------------------
@router.post("", response_model=DocumentOut, status_code=201)
def create_document(
    payload: DocumentCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create a raw-text document. The caller's user id is stored on the row."""
    logger.info("Creating text document title=%r user_id=%s", payload.title, user["id"])
    doc = crud.create_document(
        db,
        title=payload.title,
        content=payload.content,
        filename=None,
        file_path=None,
        uploaded_by=user["id"],
    )
    ingest_document(db, doc.id)
    return doc


@router.post("/upload", response_model=DocumentOut, status_code=201)
def upload_document(
    file: UploadFile,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Upload a file (PDF / TXT / MD). The caller's user id is stored on the row."""
    filename = file.filename or ""
    ext = Path(filename).suffix.lower()
    logger.info("Uploading document filename=%r user_id=%s", filename, user["id"])

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: '{ext}'")

    data = file.file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(
            status_code=413, detail=f"File too large (max {settings.max_upload_mb} MB)"
        )

    doc_id = str(uuid.uuid4())
    file_path = Path(settings.data_dir) / "uploads" / f"{doc_id}{ext}"
    file_path.write_bytes(data)

    doc = crud.create_document(
        db,
        id=doc_id,
        title=Path(filename).stem,
        filename=filename,
        file_path=str(file_path),
        content="",
        uploaded_by=user["id"],
    )
    ingest_document(db, doc.id)
    return doc


@router.get("", response_model=list[DocumentOut])
def list_documents(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Admins see all documents.
    Regular users see only their own documents.
    """
    if user["role"] == "admin":
        return crud.list_documents(db)
    return crud.list_documents_by_user(db, user["id"])


@router.get("/{id}", response_model=DocumentOut)
def get_document(
    id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Fetch a single document. Users can only fetch their own; admins can fetch any."""
    doc = crud.get_document(db, id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if user["role"] != "admin" and doc.uploaded_by != user["id"]:
        raise HTTPException(
            status_code=403, detail="You do not have access to this document"
        )
    return doc


@router.delete("/{id}", status_code=204)
def delete_document(
    id: str,
    db: Session = Depends(get_db),
    # Only admins may call DELETE via the REST API
    user: dict = Depends(require_role("admin")),
):
    """Permanently delete a document. Admin-only."""
    doc = crud.get_document(db, id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    logger.info(
        "Admin id=%s deleting document id=%s title=%r", user["id"], id, doc.title
    )
    documents_service.delete_document(db, doc)
    return Response(status_code=204)


@router.post("/{id}/summarize", response_model=SummarizeResponse)
def summarize(
    id: str,
    payload: SummarizeRequest | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Summarize a document. Users can only summarize their own docs; admins any."""
    doc = crud.get_document(db, id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if user["role"] != "admin" and doc.uploaded_by != user["id"]:
        raise HTTPException(
            status_code=403, detail="You do not have access to this document"
        )

    force = payload.force if payload else False
    logger.info("Summarize request id=%s force=%s user_id=%s", id, force, user["id"])
    try:
        summary = summarize_document(db, id, force=force)
    except LookupError:
        raise HTTPException(status_code=404, detail="Document not found")
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.exception("Summarizer failed for document id=%s", id)
        raise HTTPException(status_code=502, detail=f"LLM provider error: {e}")
    return SummarizeResponse(document_id=id, summary=summary)
