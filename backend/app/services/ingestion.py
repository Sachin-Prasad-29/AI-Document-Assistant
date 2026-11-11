import logging
from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_core.documents import Document as LCDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy.orm import Session

from app.config import settings
from app.db import crud
from app.db.models import Document
from app.services.vector_store import add_chunks

logger = logging.getLogger(__name__)


def load_documents(doc: Document) -> list[LCDocument]:
    # Raw-text document: no file, wrap the stored text in a single LangChain Document
    if doc.file_path is None:
        return [LCDocument(page_content=doc.content)]

    ext = Path(doc.file_path).suffix.lower()

    if ext == ".pdf":
        # One LangChain Document per page. PyPDF's page is 0-indexed, convert to 1-indexed.
        pages = PyPDFLoader(doc.file_path).load()
        for p in pages:
            p.metadata["page"] = p.metadata.get("page", 0) + 1
        return pages

    # .txt / .md
    return TextLoader(doc.file_path, encoding="utf-8").load()


def ingest_document(db: Session, document_id: str) -> None:
    doc = crud.get_document(db, document_id)
    if doc is None:
        logger.warning(
            "ingest_document called with unknown document_id=%s", document_id
        )
        return

    logger.info("Ingesting document id=%s title=%r", doc.id, doc.title)
    try:
        pages = load_documents(doc)
        # Full text goes into SQLite (used by get_document and the summarizer)
        full_text = "\n\n".join(p.page_content for p in pages)
        if not full_text.strip():
            raise ValueError("No text could be extracted from the document")

        # Chunks inherit each page's metadata (including "page" for PDFs)
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        chunks = splitter.split_documents(pages)

        for i, chunk in enumerate(chunks):
            page = chunk.metadata.get("page")  # capture BEFORE replacing the dict
            metadata = {
                "document_id": doc.id,
                "title": doc.title,
                "chunk_index": i,
            }
            if page is not None:  # Chroma rejects None values, so only add for PDFs
                metadata["page"] = page
            chunk.metadata = metadata

        ids = [f"{doc.id}:{i}" for i in range(len(chunks))]
        add_chunks(chunks, ids)

        logger.info("Ingestion complete id=%s chunks=%d", doc.id, len(chunks))
        crud.update_document(
            db,
            doc,
            content=full_text,
            num_chunks=len(chunks),
            status="ready",
            error=None,
        )
    except Exception as e:
        logger.exception("Ingestion failed for document id=%s: %s", document_id, e)
        db.rollback()  # clear any half-finished DB state before saving the failure
        crud.update_document(db, doc, status="failed", error=str(e))
